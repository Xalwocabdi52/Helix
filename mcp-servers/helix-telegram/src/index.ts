#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { startBot, stopBot, botStatus, sendToChief } from "./bot.js";

const server = new McpServer({
  name: "helix-telegram",
  version: "1.0.0",
});

server.tool(
  "telegram_bot_start",
  "Start the Telegram bot for remote access. Begins polling for messages from the Chief's Telegram.",
  {},
  async () => {
    const result = startBot();
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "telegram_bot_stop",
  "Stop the Telegram bot.",
  {},
  async () => {
    const result = stopBot();
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "telegram_bot_status",
  "Check if the Telegram bot is running and show its configuration.",
  {},
  async () => {
    const status = botStatus();
    const text = [
      `Running: ${status.running}`,
      `Allowed users: ${status.allowedUsers.join(", ") || "(none)"}`,
      `Rate limit: ${status.rateLimitPerMinute} req/min`,
    ].join("\n");
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "telegram_send",
  "Send a proactive message to the Chief's Telegram (e.g., notifications, alerts, task completions).",
  { message: z.string().describe("The message to send to the Chief") },
  async ({ message }) => {
    try {
      await sendToChief(message);
      return { content: [{ type: "text", text: "Message sent." }] };
    } catch (err) {
      return {
        content: [
          { type: "text", text: `Failed to send: ${(err as Error).message}` },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("helix-telegram MCP server running (4 tools registered)");

  // Auto-start bot polling
  const result = startBot();
  console.error(result);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
