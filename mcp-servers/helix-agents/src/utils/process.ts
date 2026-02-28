import { spawn, ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  incrementAgentCount,
  decrementAgentCount,
  checkSpawnAllowed,
  type SessionTier,
} from "./orchestrator.js";
import { validateTaskPrompt, sanitizeForLog } from "./validation.js";
import { getCurrentTier } from "./tier-check.js";

const execAsync = promisify(exec);

const NOVA_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const LOGS_DIR = join(NOVA_ROOT, "agents", "logs");

// RAM threshold: 80% of 16GB = 12.8GB (in MB = 13107 MB)
const RAM_THRESHOLD_MB = 13107;

// Per-agent memory limit: 2GB (in MB)
const AGENT_MEMORY_LIMIT_MB = 2048;

// Silence detection: 5 minutes without output
const SILENCE_TIMEOUT_MS = 5 * 60 * 1000;

// Max nesting depth for agents
const MAX_NESTING_DEPTH = 2;

/**
 * Get system memory usage in MB.
 */
async function getSystemMemoryUsage(): Promise<{
  total_mb: number;
  used_mb: number;
  free_mb: number;
  percent_used: number;
}> {
  try {
    const { stdout } = await execAsync(
      "vm_stat | awk '/Pages active/ {active=$3} /Pages wired/ {wired=$4} /Pages free/ {free=$3} END {printf \"%.0f %.0f\\n\", (active+wired)*4096/1048576, free*4096/1048576}'"
    );
    const [used_mb, free_mb] = stdout.trim().split(" ").map(Number);
    const total_mb = used_mb + free_mb;
    const percent_used = (used_mb / total_mb) * 100;
    return { total_mb, used_mb, free_mb, percent_used };
  } catch (err) {
    // Fallback: assume safe to spawn
    return { total_mb: 16384, used_mb: 2048, free_mb: 14336, percent_used: 12.5 };
  }
}

/**
 * Get memory usage for a specific process in MB.
 */
async function getProcessMemory(pid: number): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ps -o rss= -p ${pid} | awk '{printf "%.0f", $1/1024}'`
    );
    return parseInt(stdout.trim(), 10) || 0;
  } catch (err) {
    return 0;
  }
}

export interface AgentInfo {
  id: string;
  task: string;
  status: "running" | "completed" | "failed" | "timed_out" | "stopped";
  startedAt: string;
  completedAt?: string;
  output: string;
  exitCode?: number;
  pid?: number;
}

// Active agents tracked in memory
const agents = new Map<string, AgentInfo & { process?: ChildProcess }>();

/**
 * Determine tier for spawned agent.
 * All agents spawned via spawnAgent() are background workers.
 * Telegram/scheduled tiers are set externally by relay.ts and launchd.ts —
 * those sessions are parallel interactive sessions, not worker agents.
 */
function determineTier(_currentDepth: number, _currentTier: SessionTier): SessionTier {
  return "background";
}

/**
 * Get spawn path identifier (main/telegram/scheduled)
 */
function getSpawnPath(): "main" | "telegram" | "scheduled" {
  const tier = getCurrentTier();
  if (tier === "telegram") return "telegram";
  if (tier === "scheduled") return "scheduled";
  return "main";
}

/**
 * Spawn a Claude Code subprocess with a task prompt.
 */
export async function spawnAgent(
  task: string,
  options: { timeoutMinutes?: number; background?: boolean } = {}
): Promise<AgentInfo> {
  // Get current tier and depth
  const currentTier = getCurrentTier();
  const currentDepth = parseInt(process.env.NOVA_AGENT_DEPTH || "0", 10);
  const nextDepth = currentDepth + 1;
  const nextTier = determineTier(currentDepth, currentTier);

  // Validation: Check task prompt for injection patterns
  validateTaskPrompt(task, currentTier);

  // Orchestrator: Check if spawn is allowed globally
  checkSpawnAllowed(nextTier, nextDepth);

  // Check nesting depth (redundant with orchestrator, but kept for backwards compat)
  if (currentDepth >= MAX_NESTING_DEPTH) {
    throw new Error(
      `Max agent nesting depth exceeded (current: ${currentDepth}, max: ${MAX_NESTING_DEPTH})`
    );
  }

  // Check RAM before spawning
  const ramUsage = await getSystemMemoryUsage();
  if (ramUsage.used_mb > RAM_THRESHOLD_MB) {
    throw new Error(
      `RAM threshold exceeded: ${ramUsage.used_mb}MB used (${ramUsage.percent_used.toFixed(1)}% of total). Cannot spawn agent.`
    );
  }

  const id = `agent_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const timeout = (options.timeoutMinutes || 10) * 60 * 1000;
  const taskSummary = sanitizeForLog(task);

  // Register with orchestrator BEFORE spawning
  incrementAgentCount(
    id,
    nextTier,
    nextDepth,
    getSpawnPath(),
    process.env.NOVA_PARENT_AGENT_ID,
    taskSummary
  );

  await mkdir(LOGS_DIR, { recursive: true });

  const info: AgentInfo & { process?: ChildProcess } = {
    id,
    task,
    status: "running",
    startedAt: new Date().toISOString(),
    output: "",
  };

  const proc = spawn("claude", ["--print", "--dangerously-skip-permissions", task], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NOVA_AGENT_DEPTH: String(nextDepth),
      NOVA_SESSION_TIER: nextTier,
      NOVA_PARENT_AGENT_ID: id, // Child agents will know their parent
    },
  });

  info.pid = proc.pid;
  info.process = proc;

  let output = "";
  let lastOutputTime = Date.now();

  proc.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    lastOutputTime = Date.now();
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    lastOutputTime = Date.now();
  });

  // Memory limit watchdog (check every 30 seconds)
  const memoryCheckInterval = setInterval(async () => {
    if (!proc.pid || info.status !== "running") {
      clearInterval(memoryCheckInterval);
      return;
    }
    const agentMemory = await getProcessMemory(proc.pid);
    if (agentMemory > AGENT_MEMORY_LIMIT_MB) {
      clearInterval(memoryCheckInterval);
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (info.status === "running") {
          proc.kill("SIGKILL");
        }
      }, 5000);
      info.status = "failed";
      output += `\n\n[KILLED: Memory limit exceeded (${agentMemory}MB > ${AGENT_MEMORY_LIMIT_MB}MB)]`;
      // Note: decrementAgentCount will be called in proc.on("close")
    }
  }, 30000);

  // Silence detection watchdog (check every 60 seconds)
  const silenceCheckInterval = setInterval(() => {
    if (info.status !== "running") {
      clearInterval(silenceCheckInterval);
      return;
    }
    const silentFor = Date.now() - lastOutputTime;
    if (silentFor > SILENCE_TIMEOUT_MS) {
      clearInterval(silenceCheckInterval);
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (info.status === "running") {
          proc.kill("SIGKILL");
        }
      }, 5000);
      info.status = "failed";
      output += `\n\n[KILLED: No output for ${Math.floor(silentFor / 1000)}s]`;
    }
  }, 60000);

  // Timeout watchdog
  const timer = setTimeout(() => {
    if (info.status === "running") {
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (info.status === "running") {
          proc.kill("SIGKILL");
        }
      }, 5000);
      info.status = "timed_out";
    }
  }, timeout);

  proc.on("close", async (code) => {
    clearTimeout(timer);
    clearInterval(memoryCheckInterval);
    clearInterval(silenceCheckInterval);
    info.output = output;
    info.exitCode = code ?? undefined;
    info.completedAt = new Date().toISOString();
    if (info.status === "running") {
      info.status = code === 0 ? "completed" : "failed";
    }
    delete info.process;

    // Unregister from orchestrator
    decrementAgentCount(id, info.status === "completed" ? "completed" : "failed");

    // Save log file with YAML frontmatter
    const date = new Date().toISOString().slice(0, 10);
    const time = new Date().toISOString().slice(11, 16).replace(":", "");
    const logFile = join(LOGS_DIR, `${date}_${time}_${id}.md`);

    const elapsed = info.completedAt
      ? `${Math.round((new Date(info.completedAt).getTime() - new Date(info.startedAt).getTime()) / 1000)}s`
      : "unknown";

    const logContent = `---
agent_id: ${id}
task: "${task.replace(/"/g, '\\"')}"
tier: ${nextTier}
depth: ${nextDepth}
parent_agent: ${process.env.NOVA_PARENT_AGENT_ID || 'none'}
spawn_path: ${getSpawnPath()}
started_at: ${info.startedAt}
completed_at: ${info.completedAt}
status: ${info.status}
exit_code: ${info.exitCode ?? 'null'}
runtime: ${elapsed}
---

# Agent ${id}

**Task:** ${task}
**Tier:** ${nextTier}
**Depth:** ${nextDepth}
**Status:** ${info.status}
**Runtime:** ${elapsed}

---

${output}`;
    await writeFile(logFile, logContent, "utf-8").catch(() => {});
  });

  agents.set(id, info);

  return {
    id: info.id,
    task: info.task,
    status: info.status,
    startedAt: info.startedAt,
    output: "",
    pid: info.pid,
  };
}

/**
 * Get the status of an agent.
 */
export function getAgent(id: string): AgentInfo | null {
  const agent = agents.get(id);
  if (!agent) return null;
  const { process: _, ...info } = agent;
  return info;
}

/**
 * List all tracked agents.
 */
export function listAgents(): AgentInfo[] {
  return Array.from(agents.values()).map(({ process: _, ...info }) => info);
}

/**
 * Stop a running agent.
 */
export function stopAgent(id: string): boolean {
  const agent = agents.get(id);
  if (!agent || agent.status !== "running" || !agent.process) return false;

  agent.process.kill("SIGTERM");
  setTimeout(() => {
    if (agent.status === "running" && agent.process) {
      agent.process.kill("SIGKILL");
    }
  }, 5000);

  agent.status = "stopped";
  agent.completedAt = new Date().toISOString();
  return true;
}
