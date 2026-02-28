import { z } from "zod";
import { runAppleScript } from "../utils/applescript.js";

export const notificationTools = {
  mac_notification_send: {
    description: "Send a macOS notification (banner/alert)",
    schema: z.object({
      title: z.string().describe("Notification title"),
      message: z.string().describe("Notification body text"),
      subtitle: z.string().optional().describe("Optional subtitle"),
      sound: z.string().default("default").describe("Notification sound name (e.g., 'default', 'Basso', 'Blow', 'Bottle', 'Frog', 'Funk', 'Glass', 'Hero', 'Morse', 'Ping', 'Pop', 'Purr', 'Sosumi', 'Submarine', 'Tink')"),
    }),
    handler: async ({
      title,
      message,
      subtitle,
      sound,
    }: {
      title: string;
      message: string;
      subtitle?: string;
      sound: string;
    }) => {
      const subtitlePart = subtitle
        ? `subtitle "${subtitle.replace(/"/g, '\\"')}"`
        : "";
      const soundPart = sound ? `sound name "${sound}"` : "";

      const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}" ${subtitlePart} ${soundPart}`;

      const result = await runAppleScript(script);
      if (result.success) {
        return {
          content: [
            { type: "text" as const, text: `Notification sent: "${title}"` },
          ],
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to send notification: ${result.error}`,
          },
        ],
        isError: true,
      };
    },
  },
};
