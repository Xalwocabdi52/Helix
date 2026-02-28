import { z } from "zod";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const NOVA_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const LOGS_DIR = join(NOVA_ROOT, "agents", "logs");
const MESSAGES_DIR = join(NOVA_ROOT, "agents", "messages");

export const logsTools = {
  agent_logs: {
    description: "Read agent execution logs. Returns recent logs or logs for a specific agent/date.",
    schema: z.object({
      agent_id: z.string().optional().describe("Specific agent ID to get logs for"),
      date: z.string().optional().describe("Date filter (YYYY-MM-DD)"),
      limit: z.number().default(5).describe("Maximum number of log files to return"),
    }),
    handler: async ({
      agent_id,
      date,
      limit,
    }: {
      agent_id?: string;
      date?: string;
      limit: number;
    }) => {
      try {
        const files = await readdir(LOGS_DIR).catch(() => []);
        let mdFiles = files
          .filter((f) => f.endsWith(".md"))
          .sort()
          .reverse();

        if (agent_id) {
          mdFiles = mdFiles.filter((f) => f.includes(agent_id));
        }
        if (date) {
          mdFiles = mdFiles.filter((f) => f.startsWith(date));
        }

        mdFiles = mdFiles.slice(0, limit);

        if (mdFiles.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No agent logs found." }],
          };
        }

        const logContents: string[] = [];
        for (const file of mdFiles) {
          const content = await readFile(join(LOGS_DIR, file), "utf-8");
          const preview = content.length > 2000
            ? content.substring(0, 2000) + "\n...[truncated]"
            : content;
          logContents.push(`--- ${file} ---\n${preview}`);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Agent logs (${mdFiles.length} files):\n\n${logContents.join("\n\n")}`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [
            { type: "text" as const, text: `Failed to read logs: ${error.message}` },
          ],
          isError: true,
        };
      }
    },
  },
};
