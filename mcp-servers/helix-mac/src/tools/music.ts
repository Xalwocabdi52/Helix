import { z } from "zod";
import { runAppleScript } from "../utils/applescript.js";

export const musicTools = {
  mac_music_now_playing: {
    description: "Get the currently playing track in Apple Music",
    schema: z.object({}),
    handler: async () => {
      const script = `tell application "System Events"
  if not (exists process "Music") then
    return "Apple Music is not running"
  end if
end tell

tell application "Music"
  if player state is not playing then
    return "Nothing is currently playing (state: " & (player state as string) & ")"
  end if
  set trackName to name of current track
  set trackArtist to artist of current track
  set trackAlbum to album of current track
  set trackDuration to duration of current track
  set trackPosition to player position
  set mins to (trackPosition div 60) as integer
  set secs to (trackPosition mod 60) as integer
  set totalMins to (trackDuration div 60) as integer
  set totalSecs to (trackDuration mod 60) as integer
  return trackName & " by " & trackArtist & " (" & trackAlbum & ") — " & mins & ":" & (text -2 thru -1 of ("0" & secs)) & " / " & totalMins & ":" & (text -2 thru -1 of ("0" & totalSecs))
end tell`;

      const result = await runAppleScript(script, 10000);
      if (result.success) {
        return { content: [{ type: "text" as const, text: result.output }] };
      }
      return { content: [{ type: "text" as const, text: `Failed to get now playing: ${result.error}` }], isError: true };
    },
  },

  mac_music_control: {
    description: "Control Apple Music playback (play, pause, next, previous, toggle)",
    schema: z.object({
      action: z.enum(["play", "pause", "toggle", "next", "previous"]).describe("Playback action"),
    }),
    handler: async ({ action }: { action: string }) => {
      const actionMap: Record<string, string> = {
        play: "play",
        pause: "pause",
        toggle: "playpause",
        next: "next track",
        previous: "previous track",
      };

      const musicAction = actionMap[action] || action;
      const script = `tell application "Music" to ${musicAction}`;

      const result = await runAppleScript(script, 10000);
      if (result.success) {
        return { content: [{ type: "text" as const, text: `Music: ${action}` }] };
      }
      return { content: [{ type: "text" as const, text: `Failed to control music: ${result.error}` }], isError: true };
    },
  },
};
