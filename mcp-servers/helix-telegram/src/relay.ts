import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import {
  getSession,
  setClaudeSessionId,
  addActiveTask,
  removeActiveTask,
} from "./history.js";
import { sendMessage } from "./bot.js";

const CLAUDE_PATH =
  process.env.CLAUDE_BIN || "claude";

/**
 * Relay a message to Claude with conversation continuity.
 *
 * First call for a user: `claude --print --session-id <new-uuid> <message>`
 * Subsequent calls: `claude --print --resume <session-id> <message>`
 */
export async function relayToClaude(
  message: string,
  userId: number
): Promise<string> {
  const session = await getSession(userId);
  let args: string[];

  if (session.claudeSessionId) {
    args = ["--print", "--resume", session.claudeSessionId, message];
  } else {
    const newSessionId = randomUUID();
    args = ["--print", "--session-id", newSessionId, message];
    await setClaudeSessionId(userId, newSessionId);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_PATH, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: config.novaRoot,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NOVA_SESSION_TIER: "telegram",
        NOVA_AGENT_DEPTH: "0",
      },
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("Claude relay timed out"));
    }, config.claudeTimeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 || stdout.length > 0) {
        resolve(stdout.trim() || "(No output)");
      } else {
        reject(
          new Error(
            `claude exited with code ${code}: ${stderr.trim() || "unknown error"}`
          )
        );
      }
    });
  });
}

/**
 * Spawn a background task. Returns immediately with the agent ID.
 * Sends the result back to Telegram when done.
 */
export async function spawnBackgroundTask(
  taskPrompt: string,
  userId: number,
  chatId: number
): Promise<string> {
  const session = await getSession(userId);
  if (session.activeTasks.length >= 2) {
    throw new Error(
      "Max 2 background tasks at a time. Wait for one to finish."
    );
  }

  const agentId = `tg_task_${Date.now()}_${randomUUID().slice(0, 8)}`;
  await addActiveTask(userId, agentId);

  const proc = spawn(
    CLAUDE_PATH,
    ["--print", "--dangerously-skip-permissions", taskPrompt],
    {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: config.novaRoot,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NOVA_SESSION_TIER: "telegram", // Telegram spawns are tier 1
        NOVA_AGENT_DEPTH: "0", // Root spawn from Telegram
      },
    }
  );

  let output = "";
  const timer = setTimeout(() => {
    proc.kill("SIGTERM");
    output += "\n(Task timed out after 10 minutes)";
  }, config.taskTimeoutMs);

  proc.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  proc.stderr.on("data", (chunk: Buffer) => {
    // Capture stderr but don't mix with primary output
  });

  proc.on("close", async (code) => {
    clearTimeout(timer);
    await removeActiveTask(userId, agentId);

    const header =
      code === 0
        ? `Task complete [${agentId}]`
        : `Task failed (exit ${code}) [${agentId}]`;

    const result = output.trim() || "(No output)";
    const fullMessage = `${header}\n\n${result}`;

    try {
      const chunks = splitMessage(fullMessage);
      for (const chunk of chunks) {
        await sendMessage(chatId, chunk);
      }
    } catch (err) {
      console.error(
        `[telegram] Failed to send task result: ${(err as Error).message}`
      );
    }
  });

  return agentId;
}

/**
 * Split a long message into Telegram-safe chunks (max 4096 chars each).
 */
export function splitMessage(text: string): string[] {
  const max = config.maxMessageLength;
  if (text.length <= max) return [text];

  const chunks: string[] = [];
  let current = "";

  for (const line of text.split("\n")) {
    if (line.length > max) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < line.length; i += max) {
        chunks.push(line.slice(i, i + max));
      }
      continue;
    }

    if (current.length + line.length + 1 > max) {
      chunks.push(current);
      current = line;
    } else {
      current += (current ? "\n" : "") + line;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
