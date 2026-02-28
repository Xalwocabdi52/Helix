#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawnTools } from "./tools/spawn.js";
import { scheduleTools } from "./tools/schedule.js";
import { messagingTools } from "./tools/messaging.js";
import { logsTools } from "./tools/logs.js";
import { recoverTools } from "./tools/recover.js";

const server = new McpServer({
  name: "helix-agents",
  version: "1.0.0",
});

const allTools = {
  ...spawnTools,
  ...scheduleTools,
  ...messagingTools,
  ...logsTools,
  ...recoverTools,
};

for (const [name, tool] of Object.entries(allTools)) {
  const { description, schema, handler } = tool as {
    description: string;
    schema: import("zod").ZodObject<any>;
    handler: (args: any) => Promise<any>;
  };
  server.tool(name, description, schema.shape, handler);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`helix-agents MCP server running (${Object.keys(allTools).length} tools registered)`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
