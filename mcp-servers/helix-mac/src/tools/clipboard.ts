import { z } from "zod";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const clipboardTools = {
  mac_clipboard_get: {
    description: "Read the current contents of the macOS clipboard (pasteboard)",
    schema: z.object({}),
    handler: async () => {
      try {
        const { stdout } = await execFileAsync("pbpaste", [], {
          timeout: 5000,
          maxBuffer: 1024 * 1024,
        });
        if (stdout.length === 0) {
          return {
            content: [{ type: "text" as const, text: "Clipboard is empty" }],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Clipboard contents (${stdout.length} chars):\n${stdout}`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [
            { type: "text" as const, text: `Failed to read clipboard: ${error.message}` },
          ],
          isError: true,
        };
      }
    },
  },

  mac_clipboard_set: {
    description: "Write text to the macOS clipboard (pasteboard)",
    schema: z.object({
      text: z.string().describe("Text to copy to the clipboard"),
    }),
    handler: async ({ text }: { text: string }) => {
      try {
        const proc = spawn("pbcopy");
        proc.stdin.write(text);
        proc.stdin.end();
        await new Promise<void>((resolve, reject) => {
          proc.on("close", (code: number) => {
            if (code === 0) resolve();
            else reject(new Error(`pbcopy exited with code ${code}`));
          });
          proc.on("error", reject);
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Copied ${text.length} characters to clipboard`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [
            { type: "text" as const, text: `Failed to set clipboard: ${error.message}` },
          ],
          isError: true,
        };
      }
    },
  },
};
