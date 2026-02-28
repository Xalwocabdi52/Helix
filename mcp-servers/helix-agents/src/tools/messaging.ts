import { z } from "zod";
import { writeFile, readFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";

const NOVA_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const MESSAGES_DIR = join(NOVA_ROOT, "agents", "messages");

interface AgentMessage {
  id: string;
  from: string;
  to: string;
  message: string;
  timestamp: string;
}

export const messagingTools = {
  agent_message: {
    description:
      "Send a message between agents (inter-agent communication). Messages are stored as JSON files for other agents to read.",
    schema: z.object({
      from: z.string().describe("Sender agent name or ID"),
      to: z.string().describe("Recipient agent name or 'all' for broadcast"),
      message: z.string().describe("Message content"),
    }),
    handler: async ({
      from,
      to,
      message,
    }: {
      from: string;
      to: string;
      message: string;
    }) => {
      try {
        await mkdir(MESSAGES_DIR, { recursive: true });

        const msg: AgentMessage = {
          id: `msg_${Date.now()}`,
          from,
          to,
          message,
          timestamp: new Date().toISOString(),
        };

        const filename = `${msg.id}.json`;
        await writeFile(
          join(MESSAGES_DIR, filename),
          JSON.stringify(msg, null, 2),
          "utf-8"
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Message sent from ${from} to ${to}: "${message.substring(0, 100)}"`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [
            { type: "text" as const, text: `Failed to send message: ${error.message}` },
          ],
          isError: true,
        };
      }
    },
  },
};
