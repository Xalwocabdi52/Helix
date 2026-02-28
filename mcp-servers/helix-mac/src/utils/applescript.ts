import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface AppleScriptResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Execute an AppleScript command via osascript.
 */
export async function runAppleScript(
  script: string,
  timeout = 15000
): Promise<AppleScriptResult> {
  try {
    const { stdout, stderr } = await execFileAsync("osascript", ["-e", script], {
      timeout,
      maxBuffer: 1024 * 1024,
    });
    return {
      success: true,
      output: stdout.trim(),
      error: stderr.trim() || undefined,
    };
  } catch (err: unknown) {
    const error = err as Error & { stderr?: string; code?: string };
    return {
      success: false,
      output: "",
      error: error.stderr?.trim() || error.message,
    };
  }
}

/**
 * Execute a JXA (JavaScript for Automation) script via osascript.
 */
export async function runJXA(
  script: string,
  timeout = 15000
): Promise<AppleScriptResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "osascript",
      ["-l", "JavaScript", "-e", script],
      { timeout, maxBuffer: 1024 * 1024 }
    );
    return {
      success: true,
      output: stdout.trim(),
      error: stderr.trim() || undefined,
    };
  } catch (err: unknown) {
    const error = err as Error & { stderr?: string; code?: string };
    return {
      success: false,
      output: "",
      error: error.stderr?.trim() || error.message,
    };
  }
}

/**
 * Execute a shell command and return output.
 */
export async function runShell(
  command: string,
  args: string[] = [],
  timeout = 15000
): Promise<AppleScriptResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout,
      maxBuffer: 1024 * 1024,
    });
    return {
      success: true,
      output: stdout.trim(),
      error: stderr.trim() || undefined,
    };
  } catch (err: unknown) {
    const error = err as Error & { stderr?: string; code?: string };
    return {
      success: false,
      output: "",
      error: error.stderr?.trim() || error.message,
    };
  }
}
