import { z } from "zod";
import {
  createSchedule,
  listSchedules,
  deleteSchedule,
} from "../utils/launchd.js";

export const scheduleTools = {
  agent_schedule_create: {
    description:
      "Create a recurring scheduled task using macOS launchd. The task will run Claude Code with the given prompt at the specified time.",
    schema: z.object({
      name: z
        .string()
        .describe("Unique name for the schedule (e.g., 'morning-briefing', 'daily-review')"),
      prompt: z
        .string()
        .describe("The task prompt that Claude Code will execute"),
      hour: z.number().min(0).max(23).describe("Hour to run (0-23)"),
      minute: z.number().min(0).max(59).default(0).describe("Minute to run (0-59)"),
      weekday: z
        .number()
        .min(0)
        .max(6)
        .optional()
        .describe("Day of week (0=Sunday, 1=Monday, ..., 6=Saturday). Omit for daily."),
      enabled: z
        .boolean()
        .default(true)
        .describe("Whether to activate the schedule immediately"),
    }),
    handler: async ({
      name,
      prompt,
      hour,
      minute,
      weekday,
      enabled,
    }: {
      name: string;
      prompt: string;
      hour: number;
      minute: number;
      weekday?: number;
      enabled: boolean;
    }) => {
      try {
        const label = await createSchedule({
          name,
          prompt,
          hour,
          minute,
          weekday,
          enabled,
        });

        const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        const dayStr = weekday !== undefined
          ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday]
          : "daily";

        return {
          content: [
            {
              type: "text" as const,
              text: `Schedule created:\n  Name: ${name}\n  Label: ${label}\n  Time: ${timeStr} (${dayStr})\n  Enabled: ${enabled}\n  Prompt: ${prompt.substring(0, 200)}`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [
            { type: "text" as const, text: `Failed to create schedule: ${error.message}` },
          ],
          isError: true,
        };
      }
    },
  },

  agent_schedule_list: {
    description: "List all scheduled NOVA agent tasks",
    schema: z.object({}),
    handler: async () => {
      try {
        const schedules = await listSchedules();
        if (schedules.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No scheduled tasks." }],
          };
        }

        const lines = schedules.map((s) => {
          const timeStr = `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`;
          const dayStr = s.weekday !== undefined
            ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][s.weekday]
            : "daily";
          return `  ${s.name} | ${timeStr} ${dayStr} | ${s.enabled ? "enabled" : "disabled"} | ${s.prompt.substring(0, 80)}`;
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Scheduled tasks (${schedules.length}):\n${lines.join("\n")}`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [
            { type: "text" as const, text: `Failed to list schedules: ${error.message}` },
          ],
          isError: true,
        };
      }
    },
  },

  agent_schedule_delete: {
    description: "Delete a scheduled task by name",
    schema: z.object({
      name: z.string().describe("Name of the schedule to delete"),
    }),
    handler: async ({ name }: { name: string }) => {
      try {
        const deleted = await deleteSchedule(name);
        if (deleted) {
          return {
            content: [
              { type: "text" as const, text: `Deleted schedule: ${name}` },
            ],
          };
        }
        return {
          content: [
            { type: "text" as const, text: `Schedule not found: ${name}` },
          ],
          isError: true,
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [
            { type: "text" as const, text: `Failed to delete schedule: ${error.message}` },
          ],
          isError: true,
        };
      }
    },
  },
};
