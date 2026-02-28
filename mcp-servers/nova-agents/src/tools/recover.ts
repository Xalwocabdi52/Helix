/**
 * Agent Recovery Tool
 *
 * Parse crashed/failed agent logs and offer recovery strategies
 */

import { z } from "zod";
import { readdir, readFile } from "node:fs/promises";
import { join } from "path";

const NOVA_ROOT = process.env.NOVA_ROOT || process.cwd();
const LOGS_DIR = join(NOVA_ROOT, "agents", "logs");

interface AgentLogMetadata {
  agent_id: string;
  task: string;
  tier: string;
  depth: number;
  parent_agent: string;
  spawn_path: string;
  started_at: string;
  completed_at: string;
  status: string;
  exit_code: string;
  runtime: string;
}

interface FailedAgent {
  metadata: AgentLogMetadata;
  logFile: string;
  failureReason: string;
  recoverySuggestion: string;
}

/**
 * Parse YAML frontmatter from agent log
 */
function parseYAMLFrontmatter(content: string): AgentLogMetadata | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const metadata: Record<string, string> = {};

  for (const line of yaml.split("\n")) {
    const [key, ...valueParts] = line.split(":");
    if (!key || valueParts.length === 0) continue;

    const value = valueParts.join(":").trim().replace(/^["']|["']$/g, "");
    metadata[key.trim()] = value;
  }

  return metadata as unknown as AgentLogMetadata;
}

/**
 * Analyze failure reason from log content
 */
function analyzeFailure(metadata: AgentLogMetadata, logContent: string): {
  reason: string;
  suggestion: string;
} {
  const status = metadata.status;
  const exitCode = metadata.exit_code;

  // Memory kill
  if (logContent.includes("[KILLED: Memory limit exceeded")) {
    return {
      reason: "Agent exceeded 2GB memory limit",
      suggestion:
        "Break task into smaller chunks or increase memory limit in process.ts:AGENT_MEMORY_LIMIT_MB",
    };
  }

  // Silence timeout
  if (logContent.includes("[KILLED: No output for")) {
    return {
      reason: "Agent produced no output for 5+ minutes",
      suggestion:
        "Task may be stuck in infinite loop or waiting on external resource. Review task logic.",
    };
  }

  // Timeout
  if (status === "timed_out") {
    return {
      reason: `Agent exceeded ${metadata.runtime} timeout`,
      suggestion:
        "Increase timeout in spawn options or break task into smaller steps",
    };
  }

  // Permission denied (tier check)
  if (logContent.includes("Permission denied:")) {
    const tierMatch = logContent.match(/current tier is (\w+)/);
    const tier = tierMatch ? tierMatch[1] : metadata.tier;
    return {
      reason: `Tier '${tier}' lacks permissions for requested operation`,
      suggestion:
        "Spawn agent from higher tier (orchestrator/telegram) or reduce task scope",
    };
  }

  // Validation failed
  if (logContent.includes("validation failed:")) {
    return {
      reason: "Task prompt failed pre-spawn validation (security check)",
      suggestion:
        "Remove dangerous patterns from task or run from orchestrator tier (bypasses validation)",
    };
  }

  // Rate limit
  if (logContent.includes("Rate limit exceeded")) {
    return {
      reason: "Global spawn rate limit exceeded (100/hour)",
      suggestion: "Wait for rate limit window to reset or reduce spawn frequency",
    };
  }

  // Orchestrator limit
  if (logContent.includes("Global agent limit reached")) {
    return {
      reason: "Max concurrent agents reached (6 total)",
      suggestion: "Wait for running agents to complete before spawning more",
    };
  }

  // Depth limit
  if (logContent.includes("depth limit exceeded")) {
    return {
      reason: `Agent nesting depth exceeded (max ${metadata.depth})`,
      suggestion: "Flatten agent hierarchy or spawn from root level",
    };
  }

  // Generic failure
  if (status === "failed" && exitCode !== "0") {
    return {
      reason: `Agent exited with code ${exitCode}`,
      suggestion:
        "Review full log for error details. May need to retry or adjust task.",
    };
  }

  return {
    reason: "Unknown failure",
    suggestion: "Review full log for details",
  };
}

/**
 * Find recent failed agents
 */
async function findFailedAgents(limit: number = 10): Promise<FailedAgent[]> {
  try {
    const files = await readdir(LOGS_DIR);
    const logFiles = files
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse()
      .slice(0, 50); // Check last 50 logs

    const failed: FailedAgent[] = [];

    for (const file of logFiles) {
      if (failed.length >= limit) break;

      const content = await readFile(join(LOGS_DIR, file), "utf-8");
      const metadata = parseYAMLFrontmatter(content);

      if (!metadata) continue;

      // Only include failed/timed_out agents
      if (metadata.status !== "failed" && metadata.status !== "timed_out") {
        continue;
      }

      const { reason, suggestion } = analyzeFailure(metadata, content);

      failed.push({
        metadata,
        logFile: file,
        failureReason: reason,
        recoverySuggestion: suggestion,
      });
    }

    return failed;
  } catch (err) {
    console.error("Failed to scan logs:", err);
    return [];
  }
}

/**
 * Get recovery suggestion for a specific agent
 */
async function recoverAgent(agentId: string): Promise<string | null> {
  try {
    const files = await readdir(LOGS_DIR);
    const logFile = files.find((f) => f.includes(agentId));

    if (!logFile) {
      return null;
    }

    const content = await readFile(join(LOGS_DIR, logFile), "utf-8");
    const metadata = parseYAMLFrontmatter(content);

    if (!metadata) {
      return "Log file exists but has no YAML frontmatter (legacy format)";
    }

    const { reason, suggestion } = analyzeFailure(metadata, content);

    return `**Agent:** ${agentId}
**Status:** ${metadata.status} (exit code: ${metadata.exit_code})
**Runtime:** ${metadata.runtime}
**Tier:** ${metadata.tier} (depth: ${metadata.depth})
**Task:** ${metadata.task}

**Failure Reason:** ${reason}
**Recovery Suggestion:** ${suggestion}

**Log File:** ${logFile}`;
  } catch (err) {
    console.error("Failed to read agent log:", err);
    return null;
  }
}

export const recoverTools = {
  agent_recover: {
    description:
      "Analyze failed agents and get recovery suggestions. Can list recent failures or analyze a specific agent by ID.",
    schema: z.object({
      agent_id: z
        .string()
        .optional()
        .describe(
          "Specific agent ID to analyze (e.g., 'agent_1234567890_abcd1234')"
        ),
      limit: z
        .number()
        .default(10)
        .describe("Number of recent failed agents to list (default: 10)"),
    }),
    handler: async ({
      agent_id,
      limit,
    }: {
      agent_id?: string;
      limit: number;
    }) => {
      // Specific agent recovery
      if (agent_id) {
        const analysis = await recoverAgent(agent_id);
        if (!analysis) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No log found for agent: ${agent_id}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: analysis }],
        };
      }

      // List recent failures
      const failed = await findFailedAgents(limit);

      if (failed.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No failed agents found in recent logs",
            },
          ],
        };
      }

      const report = failed
        .map((f, i) => {
          return `${i + 1}. **${f.metadata.agent_id}** (${f.metadata.runtime})
   Status: ${f.metadata.status} | Tier: ${f.metadata.tier} | Depth: ${f.metadata.depth}
   Task: ${f.metadata.task.substring(0, 100)}${f.metadata.task.length > 100 ? "..." : ""}
   Reason: ${f.failureReason}
   Suggestion: ${f.recoverySuggestion}
   Log: ${f.logFile}`;
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `**Recent Failed Agents (${failed.length}):**\n\n${report}\n\nUse \`agent_recover(agent_id: "<id>")\` for detailed analysis.`,
          },
        ],
      };
    },
  },
};
