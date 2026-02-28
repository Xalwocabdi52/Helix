import { z } from "zod";
import { spawnAgent, getAgent, listAgents, stopAgent } from "../utils/process.js";

export const spawnTools = {
  agent_spawn: {
    description:
      "Launch a Claude Code subprocess with a specific task prompt. The agent runs independently and its output is logged.",
    schema: z.object({
      task: z.string().describe("The task prompt for the agent"),
      timeout_minutes: z
        .number()
        .default(10)
        .describe("Maximum runtime in minutes before the agent is killed (default: 10)"),
      background: z
        .boolean()
        .default(true)
        .describe("Run in background (true) or wait for completion (false)"),
    }),
    handler: async ({
      task,
      timeout_minutes,
      background,
    }: {
      task: string;
      timeout_minutes: number;
      background: boolean;
    }) => {
      try {
        const agent = await spawnAgent(task, {
          timeoutMinutes: timeout_minutes,
          background,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Agent spawned:\n  ID: ${agent.id}\n  PID: ${agent.pid}\n  Status: ${agent.status}\n  Timeout: ${timeout_minutes} minutes\n  Task: ${task.substring(0, 200)}${task.length > 200 ? "..." : ""}`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [
            { type: "text" as const, text: `Failed to spawn agent: ${error.message}` },
          ],
          isError: true,
        };
      }
    },
  },

  agent_status: {
    description: "Check the status and output of a running or completed agent",
    schema: z.object({
      agent_id: z.string().describe("Agent ID to check"),
    }),
    handler: async ({ agent_id }: { agent_id: string }) => {
      const agent = getAgent(agent_id);
      if (!agent) {
        return {
          content: [
            { type: "text" as const, text: `Agent not found: ${agent_id}` },
          ],
          isError: true,
        };
      }

      const elapsed = agent.completedAt
        ? `${((new Date(agent.completedAt).getTime() - new Date(agent.startedAt).getTime()) / 1000).toFixed(0)}s`
        : `${((Date.now() - new Date(agent.startedAt).getTime()) / 1000).toFixed(0)}s (running)`;

      const outputPreview = agent.output
        ? `\n\nOutput (${agent.output.length} chars):\n${agent.output.substring(0, 2000)}${agent.output.length > 2000 ? "\n...[truncated]" : ""}`
        : "\n\nNo output yet.";

      return {
        content: [
          {
            type: "text" as const,
            text: `Agent ${agent.id}:\n  Status: ${agent.status}\n  Task: ${agent.task.substring(0, 200)}\n  Started: ${agent.startedAt}\n  Elapsed: ${elapsed}\n  Exit Code: ${agent.exitCode ?? "N/A"}${outputPreview}`,
          },
        ],
      };
    },
  },

  agent_list: {
    description: "List all active and recent agents",
    schema: z.object({}),
    handler: async () => {
      const all = listAgents();
      if (all.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No agents tracked in this session." }],
        };
      }

      const lines = all.map((a) => {
        const elapsed = a.completedAt
          ? `${((new Date(a.completedAt).getTime() - new Date(a.startedAt).getTime()) / 1000).toFixed(0)}s`
          : `${((Date.now() - new Date(a.startedAt).getTime()) / 1000).toFixed(0)}s`;
        return `  ${a.id} | ${a.status} | ${elapsed} | ${a.task.substring(0, 80)}`;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Agents (${all.length}):\n${lines.join("\n")}`,
          },
        ],
      };
    },
  },

  agent_stop: {
    description: "Stop a running agent by ID",
    schema: z.object({
      agent_id: z.string().describe("Agent ID to stop"),
    }),
    handler: async ({ agent_id }: { agent_id: string }) => {
      const stopped = stopAgent(agent_id);
      if (stopped) {
        return {
          content: [{ type: "text" as const, text: `Agent ${agent_id} stopped.` }],
        };
      }
      return {
        content: [
          { type: "text" as const, text: `Cannot stop agent ${agent_id}: not found or not running.` },
        ],
        isError: true,
      };
    },
  },
};
