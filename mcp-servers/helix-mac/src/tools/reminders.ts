import { z } from "zod";
import { runAppleScript } from "../utils/applescript.js";

export const remindersTools = {
  mac_reminders_list: {
    description: "List incomplete reminders, optionally filtered by list name",
    schema: z.object({
      list_name: z.string().optional().describe("Specific reminders list to show (omit for all lists)"),
    }),
    handler: async ({ list_name }: { list_name?: string }) => {
      const script = list_name
        ? `tell application "Reminders"
  set output to ""
  tell list "${list_name}"
    set theReminders to every reminder whose completed is false
    repeat with aReminder in theReminders
      set rName to name of aReminder
      set rDate to ""
      try
        set rDate to " (due: " & (due date of aReminder as string) & ")"
      end try
      set output to output & "- " & rName & rDate & linefeed
    end repeat
  end tell
  if output is "" then return "No incomplete reminders in ${list_name}"
  return output
end tell`
        : `tell application "Reminders"
  set output to ""
  repeat with aList in lists
    set listName to name of aList
    tell aList
      set theReminders to every reminder whose completed is false
      if (count of theReminders) > 0 then
        set output to output & "[" & listName & "]" & linefeed
        repeat with aReminder in theReminders
          set rName to name of aReminder
          set rDate to ""
          try
            set rDate to " (due: " & (due date of aReminder as string) & ")"
          end try
          set output to output & "  - " & rName & rDate & linefeed
        end repeat
      end if
    end tell
  end repeat
  if output is "" then return "No incomplete reminders"
  return output
end tell`;

      const result = await runAppleScript(script, 30000);
      if (result.success) {
        return { content: [{ type: "text" as const, text: result.output }] };
      }
      return { content: [{ type: "text" as const, text: `Failed to list reminders: ${result.error}` }], isError: true };
    },
  },

  mac_reminders_create: {
    description: "Create a new reminder",
    schema: z.object({
      text: z.string().describe("Reminder text"),
      list_name: z.string().default("Reminders").describe("Reminders list to add to"),
      due_date: z.string().optional().describe("Due date (e.g., 'February 10, 2026 at 3:00 PM')"),
      priority: z.enum(["high", "medium", "low", "none"]).default("none").describe("Priority level"),
    }),
    handler: async ({
      text,
      list_name,
      due_date,
      priority,
    }: {
      text: string;
      list_name: string;
      due_date?: string;
      priority: string;
    }) => {
      const priorityMap: Record<string, number> = { high: 1, medium: 5, low: 9, none: 0 };
      const priNum = priorityMap[priority] || 0;

      let extraProps = "";
      if (due_date) extraProps += `\n    set due date of newReminder to date "${due_date}"`;
      if (priNum > 0) extraProps += `\n    set priority of newReminder to ${priNum}`;

      const script = `tell application "Reminders"
  tell list "${list_name}"
    set newReminder to make new reminder with properties {name:"${text.replace(/"/g, '\\"')}"}${extraProps}
  end tell
  return "Created reminder: ${text.replace(/"/g, '\\"')}"
end tell`;

      const result = await runAppleScript(script, 15000);
      if (result.success) {
        return { content: [{ type: "text" as const, text: result.output }] };
      }
      return { content: [{ type: "text" as const, text: `Failed to create reminder: ${result.error}` }], isError: true };
    },
  },
};
