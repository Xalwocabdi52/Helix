#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { appControlTools } from "./tools/app-control.js";
import { systemInfoTools } from "./tools/system-info.js";
import { clipboardTools } from "./tools/clipboard.js";
import { notificationTools } from "./tools/notifications.js";
import { chromeTools } from "./tools/chrome.js";
import { calendarTools } from "./tools/calendar.js";
import { remindersTools } from "./tools/reminders.js";
import { notesTools } from "./tools/notes.js";
import { imessageTools } from "./tools/imessage.js";
import { musicTools } from "./tools/music.js";
import { finderTools } from "./tools/finder.js";
import { shortcutsTools } from "./tools/shortcuts.js";

const server = new McpServer({
  name: "helix-mac",
  version: "1.0.0",
});

// Collect all tool modules
const allTools = {
  ...appControlTools,
  ...systemInfoTools,
  ...clipboardTools,
  ...notificationTools,
  ...chromeTools,
  ...calendarTools,
  ...remindersTools,
  ...notesTools,
  ...imessageTools,
  ...musicTools,
  ...finderTools,
  ...shortcutsTools,
};

// Register each tool with the MCP server
for (const [name, tool] of Object.entries(allTools)) {
  const { description, schema, handler } = tool as {
    description: string;
    schema: import("zod").ZodObject<any>;
    handler: (args: any) => Promise<any>;
  };
  server.tool(name, description, schema.shape, handler);
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`helix-mac MCP server running (${Object.keys(allTools).length} tools registered)`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
