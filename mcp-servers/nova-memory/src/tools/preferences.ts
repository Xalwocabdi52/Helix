import { z } from "zod";
import { StructuredStore } from "../store/structured.js";
import { join } from "node:path";

const NOVA_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const prefsStore = new StructuredStore(join(NOVA_ROOT, "memory", "preferences.json"));

export const preferencesTools = {
  memory_preferences_get: {
    description: "Read the Chief's stored preferences (all or by key)",
    schema: z.object({
      key: z.string().optional().describe("Specific preference key to read (omit for all)"),
    }),
    handler: async ({ key }: { key?: string }) => {
      try {
        if (key) {
          const value = await prefsStore.get(key);
          if (value === undefined) {
            return {
              content: [
                { type: "text" as const, text: `No preference found for key: ${key}` },
              ],
            };
          }
          return {
            content: [
              {
                type: "text" as const,
                text: `${key}: ${typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}`,
              },
            ],
          };
        }

        const all = await prefsStore.read();
        if (Object.keys(all).length === 0) {
          return {
            content: [
              { type: "text" as const, text: "No preferences stored yet." },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Chief's preferences:\n${JSON.stringify(all, null, 2)}`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [
            { type: "text" as const, text: `Failed to read preferences: ${error.message}` },
          ],
          isError: true,
        };
      }
    },
  },

  memory_preferences_set: {
    description: "Store or update one of the Chief's preferences",
    schema: z.object({
      key: z.string().describe("Preference key (e.g., 'theme', 'work_hours', 'communication_style')"),
      value: z.any().describe("Preference value (string, number, boolean, or object)"),
    }),
    handler: async ({ key, value }: { key: string; value: unknown }) => {
      try {
        await prefsStore.set(key, value);
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated preference: ${key} = ${typeof value === "object" ? JSON.stringify(value) : String(value)}`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [
            { type: "text" as const, text: `Failed to set preference: ${error.message}` },
          ],
          isError: true,
        };
      }
    },
  },
};
