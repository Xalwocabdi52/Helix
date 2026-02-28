import { z } from "zod";
import { deleteMemory, getMemoryById } from "../store/chromadb.js";

export const forgetTools = {
  memory_forget: {
    description: "Remove a specific memory by its ID",
    schema: z.object({
      id: z.string().describe("Memory ID to remove (from memory_recall results)"),
    }),
    handler: async ({ id }: { id: string }) => {
      try {
        const existing = await getMemoryById(id);
        if (!existing) {
          return {
            content: [
              { type: "text" as const, text: `Memory not found: ${id}` },
            ],
          };
        }

        await deleteMemory(id);
        return {
          content: [
            {
              type: "text" as const,
              text: `Forgotten: "${existing.content.substring(0, 100)}..." [${id}]`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [
            { type: "text" as const, text: `Failed to forget memory: ${error.message}` },
          ],
          isError: true,
        };
      }
    },
  },
};
