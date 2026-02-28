import { z } from "zod";
import { addMemory } from "../store/chromadb.js";
import { randomUUID } from "node:crypto";
import { requireTier } from "../utils/tier-check.js";

export const rememberTools = {
  memory_remember: {
    description:
      "Store a piece of information in NOVA's persistent memory with semantic embedding for later recall",
    schema: z.object({
      content: z.string().describe("The information to remember"),
      category: z
        .enum(["conversation", "preference", "pattern", "fact"])
        .describe("Category of memory: conversation (chat context), preference (Chief's preferences), pattern (behavioral patterns), fact (general knowledge)"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Optional tags for additional filtering"),
    }),
    handler: async ({
      content,
      category,
      tags,
    }: {
      content: string;
      category: string;
      tags?: string[];
    }) => {
      // Tier check: background tier cannot write to memory
      requireTier("write to memory", ["orchestrator", "telegram", "scheduled"]);

      const id = `mem_${Date.now()}_${randomUUID().slice(0, 8)}`;
      const timestamp = new Date().toISOString();

      try {
        await addMemory({
          id,
          content,
          category,
          timestamp,
          metadata: tags ? { tags: tags.join(",") } : undefined,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Remembered (${category}): "${content.substring(0, 100)}${content.length > 100 ? "..." : ""}" [id: ${id}]`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [
            { type: "text" as const, text: `Failed to store memory: ${error.message}` },
          ],
          isError: true,
        };
      }
    },
  },
};
