import { z } from "zod";
import { queryMemories } from "../store/chromadb.js";
import { StructuredStore } from "../store/structured.js";
import { join } from "node:path";

const NOVA_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const profileStore = new StructuredStore(join(NOVA_ROOT, "memory", "chief_profile.json"));

export const contextTools = {
  memory_context: {
    description:
      "Get session context: recent interactions summary, Chief's profile, and relevant recent memories",
    schema: z.object({
      topic: z.string().optional().describe("Optional topic to focus the context retrieval on"),
    }),
    handler: async ({ topic }: { topic?: string }) => {
      try {
        const sections: string[] = [];

        // Chief's profile
        const profile = await profileStore.read();
        if (Object.keys(profile).length > 0) {
          sections.push(`Chief's Profile:\n${JSON.stringify(profile, null, 2)}`);
        }

        // Recent memories
        const query = topic || "recent activity and context";
        const recent = await queryMemories(query, { limit: 5 });
        if (recent.ids.length > 0) {
          const items = recent.ids.map((id, i) => {
            const doc = recent.documents[i] || "";
            const meta = recent.metadatas[i] as Record<string, string> | null;
            return `- [${meta?.category || "?"}] ${doc.substring(0, 200)}`;
          });
          sections.push(`Recent Memories:\n${items.join("\n")}`);
        }

        if (sections.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No context available yet. This is a fresh session.",
              },
            ],
          };
        }

        return {
          content: [
            { type: "text" as const, text: sections.join("\n\n---\n\n") },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [
            { type: "text" as const, text: `Failed to get context: ${error.message}` },
          ],
          isError: true,
        };
      }
    },
  },
};
