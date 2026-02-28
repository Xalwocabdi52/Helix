import { z } from "zod";
import { runShell } from "../utils/applescript.js";

export const shortcutsTools = {
  mac_shortcuts_run: {
    description: "Run an Apple Shortcut by name",
    schema: z.object({
      name: z.string().describe("Name of the Apple Shortcut to run"),
      input: z.string().optional().describe("Optional input text to pass to the shortcut"),
    }),
    handler: async ({ name, input }: { name: string; input?: string }) => {
      const args = ["/usr/bin/shortcuts", "run", name];
      if (input) {
        args.push("-i", input);
      }

      const result = await runShell(args[0], args.slice(1), 60000);
      if (result.success) {
        const output = result.output ? `\nOutput: ${result.output}` : "";
        return { content: [{ type: "text" as const, text: `Ran shortcut "${name}"${output}` }] };
      }
      return { content: [{ type: "text" as const, text: `Failed to run shortcut "${name}": ${result.error}` }], isError: true };
    },
  },
};
