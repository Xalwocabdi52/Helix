import { z } from "zod";
import { queryMemories } from "../store/chromadb.js";

export const recallTools = {
  memory_recall: {
    description:
      "Search NOVA's persistent memory using semantic similarity. Returns the most relevant stored memories matching the query.",
    schema: z.object({
      query: z.string().describe("What to search for (natural language)"),
      category: z
        .enum(["conversation", "preference", "pattern", "fact"])
        .optional()
        .describe("Optional: filter by memory category"),
      limit: z.number().default(5).describe("Maximum number of results to return"),
    }),
    handler: async ({
      query,
      category,
      limit,
    }: {
      query: string;
      category?: string;
      limit: number;
    }) => {
      try {
        const results = await queryMemories(query, { category, limit });

        if (results.ids.length === 0) {
          return {
            content: [
              { type: "text" as const, text: "No matching memories found." },
            ],
          };
        }

        const formatted = results.ids.map((id, i) => {
          const doc = results.documents[i] || "(empty)";
          const dist = results.distances[i];
          const meta = results.metadatas[i] as Record<string, string> | null;
          const similarity = dist !== null ? (1 - dist).toFixed(3) : "?";
          const cat = meta?.category || "unknown";
          const ts = meta?.timestamp || "";
          return `[${i + 1}] (${cat}, relevance: ${similarity})\n  ${doc}\n  ID: ${id} | ${ts}`;
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${results.ids.length} memories:\n\n${formatted.join("\n\n")}`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [
            { type: "text" as const, text: `Failed to recall memories: ${error.message}` },
          ],
          isError: true,
        };
      }
    },
  },
};
