import { z } from "zod";
import { runAppleScript } from "../utils/applescript.js";

export const imessageTools = {
  mac_imessage_send: {
    description: "Send an iMessage to a contact (phone number or email)",
    schema: z.object({
      to: z.string().describe("Recipient phone number or email address"),
      message: z.string().describe("Message text to send"),
    }),
    handler: async ({ to, message }: { to: string; message: string }) => {
      const script = `tell application "Messages"
  set targetService to 1st account whose service type = iMessage
  set targetBuddy to participant "${to}" of targetService
  send "${message.replace(/"/g, '\\"')}" to targetBuddy
end tell`;

      const result = await runAppleScript(script, 15000);
      if (result.success) {
        return { content: [{ type: "text" as const, text: `Sent iMessage to ${to}: "${message}"` }] };
      }
      return { content: [{ type: "text" as const, text: `Failed to send iMessage: ${result.error}` }], isError: true };
    },
  },

  mac_imessage_read: {
    description: "Read recent iMessages from a specific contact or all recent messages",
    schema: z.object({
      from: z.string().optional().describe("Contact phone number or email to filter by"),
      limit: z.number().default(10).describe("Number of recent messages to retrieve"),
    }),
    handler: async ({ from, limit }: { from?: string; limit: number }) => {
      // Use sqlite3 to read from the Messages database for reliable access
      const dbPath = "~/Library/Messages/chat.db";
      const whereClause = from
        ? `WHERE h.id LIKE '%${from.replace(/'/g, "''")}%'`
        : "";

      const script = `do shell script "sqlite3 ${dbPath} \\"SELECT datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as date, CASE WHEN m.is_from_me = 1 THEN 'Me' ELSE COALESCE(h.id, 'Unknown') END as sender, m.text FROM message m LEFT JOIN handle h ON m.handle_id = h.ROWID ${whereClause} WHERE m.text IS NOT NULL ORDER BY m.date DESC LIMIT ${limit};\\" 2>/dev/null"`;

      const result = await runAppleScript(script, 15000);
      if (result.success && result.output) {
        return { content: [{ type: "text" as const, text: `Recent messages:\n${result.output}` }] };
      }
      if (result.success && !result.output) {
        return { content: [{ type: "text" as const, text: "No recent messages found" }] };
      }
      return {
        content: [{
          type: "text" as const,
          text: `Failed to read messages: ${result.error}. Note: Full Disk Access may be required for Claude Code to read the Messages database.`,
        }],
        isError: true,
      };
    },
  },
};
