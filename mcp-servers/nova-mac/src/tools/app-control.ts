import { z } from "zod";
import { runAppleScript, runShell } from "../utils/applescript.js";
import { requireTier } from "../utils/tier-check.js";

export const appControlTools = {
  mac_app_launch: {
    description: "Launch a macOS application by name",
    schema: z.object({
      app_name: z.string().describe("Name of the application to launch (e.g., 'Safari', 'Finder')"),
    }),
    handler: async ({ app_name }: { app_name: string }) => {
      // Tier check: only orchestrator and telegram can launch apps
      requireTier("launch applications", ["orchestrator", "telegram"]);

      // Try AppleScript first, fall back to `open -a`
      const result = await runAppleScript(
        `tell application "${app_name}" to activate`
      );
      if (result.success) {
        return { content: [{ type: "text" as const, text: `Launched ${app_name}` }] };
      }
      // Fallback
      const fallback = await runShell("/usr/bin/open", ["-a", app_name]);
      if (fallback.success) {
        return { content: [{ type: "text" as const, text: `Launched ${app_name}` }] };
      }
      return {
        content: [{ type: "text" as const, text: `Failed to launch ${app_name}: ${fallback.error}` }],
        isError: true,
      };
    },
  },

  mac_app_quit: {
    description: "Quit a running macOS application",
    schema: z.object({
      app_name: z.string().describe("Name of the application to quit"),
    }),
    handler: async ({ app_name }: { app_name: string }) => {
      // Tier check: only orchestrator and telegram can quit apps
      requireTier("quit applications", ["orchestrator", "telegram"]);

      const result = await runAppleScript(
        `tell application "${app_name}" to quit`
      );
      if (result.success) {
        return { content: [{ type: "text" as const, text: `Quit ${app_name}` }] };
      }
      return {
        content: [{ type: "text" as const, text: `Failed to quit ${app_name}: ${result.error}` }],
        isError: true,
      };
    },
  },

  mac_app_activate: {
    description: "Bring a running application to the foreground",
    schema: z.object({
      app_name: z.string().describe("Name of the application to activate"),
    }),
    handler: async ({ app_name }: { app_name: string }) => {
      const result = await runAppleScript(
        `tell application "${app_name}" to activate`
      );
      if (result.success) {
        return { content: [{ type: "text" as const, text: `Activated ${app_name}` }] };
      }
      return {
        content: [{ type: "text" as const, text: `Failed to activate ${app_name}: ${result.error}` }],
        isError: true,
      };
    },
  },

  mac_app_list: {
    description: "List all currently running applications (excluding background-only processes)",
    schema: z.object({}),
    handler: async () => {
      const result = await runAppleScript(
        `tell application "System Events" to get name of every process whose background only is false`
      );
      if (result.success) {
        const apps = result.output.split(", ").sort();
        return {
          content: [{ type: "text" as const, text: `Running applications (${apps.length}):\n${apps.join("\n")}` }],
        };
      }
      return {
        content: [{ type: "text" as const, text: `Failed to list apps: ${result.error}` }],
        isError: true,
      };
    },
  },

  mac_window_info: {
    description: "Get information about the frontmost window (title, position, size, owning application)",
    schema: z.object({}),
    handler: async () => {
      const result = await runAppleScript(`
tell application "System Events"
  set frontApp to name of first application process whose frontmost is true
  tell process frontApp
    set windowTitle to name of front window
    set windowPos to position of front window
    set windowSize to size of front window
  end tell
  return frontApp & "|||" & windowTitle & "|||" & (item 1 of windowPos as text) & "," & (item 2 of windowPos as text) & "|||" & (item 1 of windowSize as text) & "," & (item 2 of windowSize as text)
end tell`);
      if (result.success) {
        const parts = result.output.split("|||");
        const info = {
          application: parts[0],
          title: parts[1],
          position: parts[2],
          size: parts[3],
        };
        return {
          content: [{
            type: "text" as const,
            text: `Active window:\n  App: ${info.application}\n  Title: ${info.title}\n  Position: ${info.position}\n  Size: ${info.size}`,
          }],
        };
      }
      return {
        content: [{ type: "text" as const, text: `Failed to get window info: ${result.error}` }],
        isError: true,
      };
    },
  },
};
