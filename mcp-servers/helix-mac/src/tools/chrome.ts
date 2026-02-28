import { z } from "zod";
import { runAppleScript } from "../utils/applescript.js";
import { requireTier } from "../utils/tier-check.js";

export const chromeTools = {
  chrome_open_url: {
    description: "Open a URL in Google Chrome (new tab or current tab)",
    schema: z.object({
      url: z.string().describe("URL to open"),
      new_tab: z.boolean().default(true).describe("Open in a new tab (true) or current tab (false)"),
    }),
    handler: async ({ url, new_tab }: { url: string; new_tab: boolean }) => {
      // Tier check: only orchestrator and telegram can navigate Chrome
      requireTier("navigate Chrome", ["orchestrator", "telegram"]);

      const script = new_tab
        ? `tell application "Google Chrome"
  activate
  open location "${url}"
end tell`
        : `tell application "Google Chrome"
  activate
  set URL of active tab of front window to "${url}"
end tell`;

      const result = await runAppleScript(script);
      if (result.success) {
        return { content: [{ type: "text" as const, text: `Opened ${url} in Chrome${new_tab ? " (new tab)" : ""}` }] };
      }
      return { content: [{ type: "text" as const, text: `Failed to open URL: ${result.error}` }], isError: true };
    },
  },

  chrome_tabs_list: {
    description: "List all open tabs in Google Chrome with their titles and URLs",
    schema: z.object({}),
    handler: async () => {
      const script = `tell application "Google Chrome"
  set output to ""
  set windowCount to count of windows
  repeat with w from 1 to windowCount
    set tabCount to count of tabs of window w
    repeat with t from 1 to tabCount
      set tabTitle to title of tab t of window w
      set tabURL to URL of tab t of window w
      set output to output & "W" & w & "/T" & t & ": " & tabTitle & " | " & tabURL & linefeed
    end repeat
  end repeat
  return output
end tell`;

      const result = await runAppleScript(script, 20000);
      if (result.success) {
        return { content: [{ type: "text" as const, text: result.output || "No tabs open" }] };
      }
      return { content: [{ type: "text" as const, text: `Failed to list tabs: ${result.error}` }], isError: true };
    },
  },

  chrome_tab_activate: {
    description: "Switch to a specific Chrome tab by window and tab index, or search by title",
    schema: z.object({
      window_index: z.number().optional().describe("Window number (1-based)"),
      tab_index: z.number().optional().describe("Tab number within window (1-based)"),
      title_search: z.string().optional().describe("Search for tab by title (partial match)"),
    }),
    handler: async ({
      window_index,
      tab_index,
      title_search,
    }: {
      window_index?: number;
      tab_index?: number;
      title_search?: string;
    }) => {
      // Tier check: only orchestrator and telegram can activate tabs
      requireTier("activate Chrome tabs", ["orchestrator", "telegram"]);

      if (title_search) {
        const script = `tell application "Google Chrome"
  set searchTitle to "${title_search.replace(/"/g, '\\"')}"
  set found to false
  repeat with w from 1 to count of windows
    repeat with t from 1 to count of tabs of window w
      if (title of tab t of window w) contains searchTitle then
        set active tab index of window w to t
        set index of window w to 1
        activate
        return "Switched to: " & title of tab t of window w
      end if
    end repeat
  end repeat
  return "No tab found matching: " & searchTitle
end tell`;
        const result = await runAppleScript(script);
        return { content: [{ type: "text" as const, text: result.success ? result.output : `Error: ${result.error}` }] };
      }

      if (window_index && tab_index) {
        const script = `tell application "Google Chrome"
  activate
  set active tab index of window ${window_index} to ${tab_index}
  set index of window ${window_index} to 1
  return "Switched to tab " & ${tab_index} & " in window " & ${window_index}
end tell`;
        const result = await runAppleScript(script);
        return { content: [{ type: "text" as const, text: result.success ? result.output : `Error: ${result.error}` }] };
      }

      return { content: [{ type: "text" as const, text: "Provide either window_index+tab_index or title_search" }], isError: true };
    },
  },

  chrome_tab_close: {
    description: "Close a Chrome tab by window and tab index",
    schema: z.object({
      window_index: z.number().default(1).describe("Window number (1-based)"),
      tab_index: z.number().describe("Tab number within window (1-based)"),
    }),
    handler: async ({ window_index, tab_index }: { window_index: number; tab_index: number }) => {
      // Tier check: only orchestrator and telegram can close tabs
      requireTier("close Chrome tabs", ["orchestrator", "telegram"]);

      const script = `tell application "Google Chrome"
  close tab ${tab_index} of window ${window_index}
  return "Closed tab ${tab_index} in window ${window_index}"
end tell`;
      const result = await runAppleScript(script);
      return { content: [{ type: "text" as const, text: result.success ? result.output : `Error: ${result.error}` }] };
    },
  },

  chrome_navigate: {
    description: "Navigate the active Chrome tab to a new URL",
    schema: z.object({
      url: z.string().describe("URL to navigate to"),
    }),
    handler: async ({ url }: { url: string }) => {
      // Tier check: only orchestrator and telegram can navigate Chrome
      requireTier("navigate Chrome", ["orchestrator", "telegram"]);

      const script = `tell application "Google Chrome"
  set URL of active tab of front window to "${url}"
  return "Navigated to ${url}"
end tell`;
      const result = await runAppleScript(script);
      return { content: [{ type: "text" as const, text: result.success ? result.output : `Error: ${result.error}` }] };
    },
  },

  chrome_read_page: {
    description: "Extract the text content of the current Chrome page via CDP. Requires Chrome with --remote-debugging-port=9222",
    schema: z.object({
      selector: z.string().default("body").describe("CSS selector to extract text from (default: body)"),
    }),
    handler: async ({ selector }: { selector: string }) => {
      try {
        const { getCDPClient } = await import("../utils/cdp.js");
        const cdp = await getCDPClient();
        const { Runtime } = cdp;
        const safeSelector = JSON.stringify(selector);
        const result = await Runtime.evaluate({
          expression: `document.querySelector(${safeSelector})?.innerText || 'Element not found'`,
          returnByValue: true,
        });
        const text = String(result.result.value ?? "No content found");
        const truncated = text.length > 10000 ? text.slice(0, 10000) + "\n...[truncated]" : text;
        return { content: [{ type: "text" as const, text: truncated }] };
      } catch (err: unknown) {
        const error = err as Error;
        return { content: [{ type: "text" as const, text: `CDP error: ${error.message}` }], isError: true };
      }
    },
  },

  chrome_screenshot: {
    description: "Take a screenshot of the current Chrome page via CDP. Returns base64-encoded PNG",
    schema: z.object({
      full_page: z.boolean().default(false).describe("Capture full scrollable page"),
    }),
    handler: async ({ full_page }: { full_page: boolean }) => {
      try {
        const { getCDPClient } = await import("../utils/cdp.js");
        const cdp = await getCDPClient();
        const { Page } = cdp;

        if (full_page) {
          // Get full page dimensions
          const { Runtime } = cdp;
          const dims = await Runtime.evaluate({
            expression: `JSON.stringify({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })`,
            returnByValue: true,
          });
          const { width, height } = JSON.parse(String(dims.result.value ?? '{"width":1920,"height":1080}'));
          await Page.setDeviceMetricsOverride({ width, height, deviceScaleFactor: 1, mobile: false });
        }

        const { data } = await Page.captureScreenshot({ format: "png" });

        if (full_page) {
          await Page.clearDeviceMetricsOverride();
        }

        return {
          content: [{ type: "image" as const, data, mimeType: "image/png" }],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return { content: [{ type: "text" as const, text: `CDP screenshot error: ${error.message}` }], isError: true };
      }
    },
  },

  chrome_click: {
    description: "Click an element on the current Chrome page by CSS selector via CDP",
    schema: z.object({
      selector: z.string().describe("CSS selector of the element to click"),
    }),
    handler: async ({ selector }: { selector: string }) => {
      try {
        const { getCDPClient } = await import("../utils/cdp.js");
        const cdp = await getCDPClient();
        const { Runtime } = cdp;
        const safeSelector = JSON.stringify(selector);
        const result = await Runtime.evaluate({
          expression: `(function() {
            var el = document.querySelector(${safeSelector});
            if (!el) return 'Element not found: ' + ${safeSelector};
            el.click();
            return 'Clicked: ' + (el.textContent || el.tagName).substring(0, 100);
          })()`,
          returnByValue: true,
        });
        return { content: [{ type: "text" as const, text: String(result.result.value ?? "Click completed") }] };
      } catch (err: unknown) {
        const error = err as Error;
        return { content: [{ type: "text" as const, text: `CDP click error: ${error.message}` }], isError: true };
      }
    },
  },

  chrome_fill: {
    description: "Fill a form field on the current Chrome page via CDP",
    schema: z.object({
      selector: z.string().describe("CSS selector of the input element"),
      value: z.string().describe("Value to fill in"),
    }),
    handler: async ({ selector, value }: { selector: string; value: string }) => {
      try {
        const { getCDPClient } = await import("../utils/cdp.js");
        const cdp = await getCDPClient();
        const { Runtime } = cdp;
        const safeSelector = JSON.stringify(selector);
        const safeValue = JSON.stringify(value);
        const result = await Runtime.evaluate({
          expression: `(function() {
            var el = document.querySelector(${safeSelector});
            if (!el) return 'Element not found: ' + ${safeSelector};
            el.focus();
            el.value = ${safeValue};
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return 'Filled ' + el.tagName + ' with: ' + ${safeValue}.substring(0, 50);
          })()`,
          returnByValue: true,
        });
        return { content: [{ type: "text" as const, text: String(result.result.value ?? "Fill completed") }] };
      } catch (err: unknown) {
        const error = err as Error;
        return { content: [{ type: "text" as const, text: `CDP fill error: ${error.message}` }], isError: true };
      }
    },
  },

  chrome_search: {
    description: "Open a Google search in Chrome for the given query",
    schema: z.object({
      query: z.string().describe("Search query"),
    }),
    handler: async ({ query }: { query: string }) => {
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      const script = `tell application "Google Chrome"
  activate
  open location "${url}"
end tell`;
      const result = await runAppleScript(script);
      if (result.success) {
        return { content: [{ type: "text" as const, text: `Searching Google for: ${query}` }] };
      }
      return { content: [{ type: "text" as const, text: `Failed to search: ${result.error}` }], isError: true };
    },
  },

  chrome_execute_js: {
    description: "Execute JavaScript on the current Chrome page via CDP and return the result",
    schema: z.object({
      script: z.string().describe("JavaScript code to execute"),
    }),
    handler: async ({ script }: { script: string }) => {
      try {
        const { getCDPClient } = await import("../utils/cdp.js");
        const cdp = await getCDPClient();
        const { Runtime } = cdp;
        const result = await Runtime.evaluate({
          expression: script,
          returnByValue: true,
          awaitPromise: true,
        });
        if (result.exceptionDetails) {
          return {
            content: [{ type: "text" as const, text: `JS Error: ${result.exceptionDetails.text}` }],
            isError: true,
          };
        }
        const value = result.result.value;
        const text = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "undefined");
        return { content: [{ type: "text" as const, text }] };
      } catch (err: unknown) {
        const error = err as Error;
        return { content: [{ type: "text" as const, text: `CDP error: ${error.message}` }], isError: true };
      }
    },
  },
};
