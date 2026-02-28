import { z } from "zod";
import { runAppleScript } from "../utils/applescript.js";

export const calendarTools = {
  mac_calendar_list: {
    description: "List upcoming calendar events within a time range",
    schema: z.object({
      days: z.number().default(1).describe("Number of days to look ahead (default: 1 = today)"),
    }),
    handler: async ({ days }: { days: number }) => {
      const script = `
set now to current date
set endDate to now + (${days} * days)

tell application "Calendar"
  set eventList to ""
  set allCalendars to every calendar
  repeat with aCalendar in allCalendars
    try
      set theEvents to every event of aCalendar whose start date >= now and start date < endDate
      repeat with anEvent in theEvents
        set eventTime to start date of anEvent
        set eventEnd to end date of anEvent
        set eventTitle to summary of anEvent
        set calName to name of aCalendar
        set eventLoc to ""
        try
          set eventLoc to location of anEvent
        end try
        set eventList to eventList & (eventTime as string) & " - " & (eventEnd as string) & " | " & eventTitle & " (" & calName & ")"
        if eventLoc is not "" and eventLoc is not missing value then
          set eventList to eventList & " @ " & eventLoc
        end if
        set eventList to eventList & linefeed
      end repeat
    on error
      -- Skip inaccessible calendars
    end try
  end repeat
  if eventList is "" then return "No events in the next ${days} day(s)"
  return eventList
end tell`;

      const result = await runAppleScript(script, 30000);
      if (result.success) {
        return { content: [{ type: "text" as const, text: result.output }] };
      }
      return { content: [{ type: "text" as const, text: `Failed to list events: ${result.error}` }], isError: true };
    },
  },

  mac_calendar_create: {
    description: "Create a new calendar event",
    schema: z.object({
      title: z.string().describe("Event title"),
      start_date: z.string().describe("Start date/time (e.g., 'February 10, 2026 at 2:00 PM')"),
      end_date: z.string().describe("End date/time (e.g., 'February 10, 2026 at 3:00 PM')"),
      calendar_name: z.string().default("Home").describe("Calendar to add event to"),
      location: z.string().optional().describe("Event location"),
      notes: z.string().optional().describe("Event notes/description"),
    }),
    handler: async ({
      title,
      start_date,
      end_date,
      calendar_name,
      location,
      notes,
    }: {
      title: string;
      start_date: string;
      end_date: string;
      calendar_name: string;
      location?: string;
      notes?: string;
    }) => {
      let extraProps = "";
      if (location) extraProps += `\n        set location of newEvent to "${location.replace(/"/g, '\\"')}"`;
      if (notes) extraProps += `\n        set description of newEvent to "${notes.replace(/"/g, '\\"')}"`;

      const script = `tell application "Calendar"
  tell calendar "${calendar_name}"
    set newEvent to make new event with properties {summary:"${title.replace(/"/g, '\\"')}", start date:date "${start_date}", end date:date "${end_date}"}${extraProps}
  end tell
  return "Created event: ${title.replace(/"/g, '\\"')}"
end tell`;

      const result = await runAppleScript(script, 15000);
      if (result.success) {
        return { content: [{ type: "text" as const, text: result.output }] };
      }
      return { content: [{ type: "text" as const, text: `Failed to create event: ${result.error}` }], isError: true };
    },
  },
};
