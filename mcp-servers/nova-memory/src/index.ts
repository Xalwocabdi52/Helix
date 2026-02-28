#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { rememberTools } from "./tools/remember.js";
import { recallTools } from "./tools/recall.js";
import { preferencesTools } from "./tools/preferences.js";
import { contextTools } from "./tools/context.js";
import { forgetTools } from "./tools/forget.js";

const server = new McpServer({
  name: "nova-memory",
  version: "1.0.0",
});

const allTools = {
  ...rememberTools,
  ...recallTools,
  ...preferencesTools,
  ...contextTools,
  ...forgetTools,
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
  console.error(`nova-memory MCP server running (${Object.keys(allTools).length} tools registered)`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
