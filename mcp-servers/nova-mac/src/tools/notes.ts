import { z } from "zod";
import { runAppleScript } from "../utils/applescript.js";

const DEFAULT_NOTES_FOLDER = "macmininovanotes";

export const notesTools = {
  mac_notes_list: {
    description: "List recent Apple Notes",
    schema: z.object({
      limit: z.number().default(10).describe("Maximum number of notes to return"),
      folder: z.string().default(DEFAULT_NOTES_FOLDER).describe("Folder to list notes from"),
    }),
    handler: async ({ limit, folder }: { limit: number; folder: string }) => {
      const script = `tell application "Notes"
  set output to ""
  try
    set targetFolder to folder "${folder}"
    set notesList to notes of targetFolder
    set maxNotes to count of notesList
    if maxNotes > ${limit} then set maxNotes to ${limit}
    repeat with i from 1 to maxNotes
      set aNote to item i of notesList
      set noteName to name of aNote
      set noteDate to modification date of aNote
      set output to output & (noteDate as string) & " | " & noteName & linefeed
    end repeat
  on error errMsg
    return "Error: " & errMsg
  end try
  if output is "" then return "No notes in folder '${folder}'"
  return output
end tell`;

      const result = await runAppleScript(script, 20000);
      if (result.success) {
        return { content: [{ type: "text" as const, text: result.output || "No notes found" }] };
      }
      return { content: [{ type: "text" as const, text: `Failed to list notes: ${result.error}` }], isError: true };
    },
  },

  mac_notes_create: {
    description: "Create a new Apple Note",
    schema: z.object({
      title: z.string().describe("Note title"),
      content: z.string().describe("Note body content (plain text or HTML)"),
      folder: z.string().default(DEFAULT_NOTES_FOLDER).describe("Folder to create the note in"),
    }),
    handler: async ({ title, content, folder }: { title: string; content: string; folder: string }) => {
      const escapedContent = content.replace(/"/g, '\\"').replace(/\n/g, "\\n");
      const escapedTitle = title.replace(/"/g, '\\"');

      const script = `tell application "Notes"
  try
    set targetFolder to folder "${folder}"
  on error
    make new folder with properties {name:"${folder}"}
    set targetFolder to folder "${folder}"
  end try
  tell targetFolder
    make new note with properties {name:"${escapedTitle}", body:"<h1>${escapedTitle}</h1><br>${escapedContent}"}
  end tell
  return "Created note: ${escapedTitle} in ${folder}"
end tell`;

      const result = await runAppleScript(script, 15000);
      if (result.success) {
        return { content: [{ type: "text" as const, text: result.output }] };
      }
      return { content: [{ type: "text" as const, text: `Failed to create note: ${result.error}` }], isError: true };
    },
  },

  mac_notes_search: {
    description: "Search Apple Notes by keyword",
    schema: z.object({
      query: z.string().describe("Search query"),
      folder: z.string().default(DEFAULT_NOTES_FOLDER).describe("Folder to search in"),
    }),
    handler: async ({ query, folder }: { query: string; folder: string }) => {
      const escapedQuery = query.replace(/"/g, '\\"');
      const script = `tell application "Notes"
  set output to ""
  try
    set targetFolder to folder "${folder}"
    set allNotes to notes of targetFolder
    repeat with aNote in allNotes
      set noteName to name of aNote
      if noteName contains "${escapedQuery}" then
        set noteDate to modification date of aNote
        set output to output & (noteDate as string) & " | " & noteName & linefeed
      end if
    end repeat
  on error errMsg
    return "Error: " & errMsg
  end try
  if output is "" then return "No notes matching '${query.replace(/'/g, "")}' in folder '${folder}'"
  return output
end tell`;

      const result = await runAppleScript(script, 20000);
      if (result.success) {
        return { content: [{ type: "text" as const, text: result.output }] };
      }
      return { content: [{ type: "text" as const, text: `Failed to search notes: ${result.error}` }], isError: true };
    },
  },
};
