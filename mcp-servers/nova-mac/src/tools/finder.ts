import { z } from "zod";
import { runAppleScript, runShell } from "../utils/applescript.js";

export const finderTools = {
  mac_finder_reveal: {
    description: "Reveal a file or folder in Finder",
    schema: z.object({
      path: z.string().describe("Absolute path to the file or folder to reveal"),
    }),
    handler: async ({ path }: { path: string }) => {
      const result = await runShell("/usr/bin/open", ["-R", path]);
      if (result.success) {
        return { content: [{ type: "text" as const, text: `Revealed in Finder: ${path}` }] };
      }
      return { content: [{ type: "text" as const, text: `Failed to reveal: ${result.error}` }], isError: true };
    },
  },

  mac_finder_selected: {
    description: "Get the currently selected files in the frontmost Finder window",
    schema: z.object({}),
    handler: async () => {
      const script = `tell application "Finder"
  set selectedItems to selection
  if (count of selectedItems) is 0 then
    return "No files selected in Finder"
  end if
  set output to ""
  repeat with anItem in selectedItems
    set output to output & (POSIX path of (anItem as alias)) & linefeed
  end repeat
  return output
end tell`;

      const result = await runAppleScript(script, 10000);
      if (result.success) {
        return { content: [{ type: "text" as const, text: result.output }] };
      }
      return { content: [{ type: "text" as const, text: `Failed to get selection: ${result.error}` }], isError: true };
    },
  },
};
