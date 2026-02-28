import { writeFile, readFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";

const execFileAsync = promisify(execFile);

const NOVA_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const SCHEDULES_DIR = join(NOVA_ROOT, "agents", "schedules");
const LAUNCH_AGENTS_DIR = join(homedir(), "Library", "LaunchAgents");

export interface ScheduleConfig {
  name: string;
  prompt: string;
  hour: number;
  minute: number;
  weekday?: number; // 0=Sunday, 1=Monday, etc. Omit for daily
  enabled: boolean;
}

function toPlistLabel(name: string): string {
  return `com.nova.agent.${name.replace(/[^a-zA-Z0-9-]/g, "-")}`;
}

/**
 * Generate a launchd plist XML for a scheduled NOVA agent task.
 */
function generatePlist(config: ScheduleConfig): string {
  const label = toPlistLabel(config.name);
  const novaRoot = NOVA_ROOT;
  const logPath = join(novaRoot, "agents", "logs", `launchd-${config.name}.log`);

  // The run script that Claude Code will execute
  const runScript = join(novaRoot, "agents", "schedules", `${config.name}.sh`);

  let calendarInterval = `      <dict>
        <key>Hour</key>
        <integer>${config.hour}</integer>
        <key>Minute</key>
        <integer>${config.minute}</integer>`;

  if (config.weekday !== undefined) {
    calendarInterval += `
        <key>Weekday</key>
        <integer>${config.weekday}</integer>`;
  }

  calendarInterval += `
      </dict>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${runScript}</string>
  </array>
  <key>StartCalendarInterval</key>
  ${calendarInterval}
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
  <key>WorkingDirectory</key>
  <string>${novaRoot}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>
</dict>
</plist>`;
}

/**
 * Generate the shell script that runs the agent.
 */
function generateRunScript(config: ScheduleConfig): string {
  const novaRoot = NOVA_ROOT;
  const date = "$(date '+%Y-%m-%d')";
  const time = "$(date '+%H%M')";
  const logFile = `${novaRoot}/agents/logs/${date}_${time}_${config.name}.md`;
  const maxTime = 1200; // 20 minutes

  return `#!/bin/bash
# NOVA Scheduled Agent: ${config.name}
# Generated: ${new Date().toISOString()}

set -euo pipefail

export TZ='America/Los_Angeles'
export PATH="/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"
export NOVA_SESSION_TIER=scheduled
export NOVA_AGENT_DEPTH=0

NOVA_ROOT="${novaRoot}"
LOG_FILE="${logFile}"
MAX_TIME=${maxTime}

# Source environment if available
if [ -f "$NOVA_ROOT/.env" ]; then
  set -a
  source "$NOVA_ROOT/.env"
  set +a
fi

CURRENT_DATE="$(date '+%A, %B %d, %Y at %I:%M %p %Z')"

PROMPT="Today is $CURRENT_DATE. ${config.prompt.replace(/"/g, '\\"')}"

# Run with timeout watchdog
run_with_timeout() {
  local max_time=$1
  shift
  "$@" &
  local pid=$!
  ( sleep "$max_time" && kill -TERM "$pid" 2>/dev/null && sleep 5 && kill -9 "$pid" 2>/dev/null ) &
  local watchdog=$!
  wait "$pid" 2>/dev/null
  local exit_code=$?
  kill "$watchdog" 2>/dev/null
  wait "$watchdog" 2>/dev/null
  return $exit_code
}

echo "Starting agent: ${config.name} at $(date)"
run_with_timeout $MAX_TIME claude --print --dangerously-skip-permissions "$PROMPT" > "$LOG_FILE" 2>&1
echo "Agent completed at $(date) with exit code $?"
`;
}

/**
 * Create a scheduled task.
 */
export async function createSchedule(config: ScheduleConfig): Promise<string> {
  const label = toPlistLabel(config.name);
  const plistPath = join(LAUNCH_AGENTS_DIR, `${label}.plist`);
  const scriptPath = join(SCHEDULES_DIR, `${config.name}.sh`);

  // Generate and write files
  const plist = generatePlist(config);
  const script = generateRunScript(config);

  await writeFile(plistPath, plist, "utf-8");
  await writeFile(scriptPath, script, { mode: 0o755 });

  // Save config
  await writeFile(
    join(SCHEDULES_DIR, `${config.name}.json`),
    JSON.stringify(config, null, 2),
    "utf-8"
  );

  if (config.enabled) {
    await loadSchedule(label, plistPath);
  }

  return label;
}

/**
 * Load/reload a launchd schedule.
 */
async function loadSchedule(label: string, plistPath: string): Promise<void> {
  // Unload first (ignore errors if not loaded)
  try {
    await execFileAsync("launchctl", ["unload", plistPath]);
  } catch {}
  await execFileAsync("launchctl", ["load", plistPath]);
}

/**
 * List all NOVA scheduled tasks.
 */
export async function listSchedules(): Promise<ScheduleConfig[]> {
  const configs: ScheduleConfig[] = [];
  try {
    const files = await readdir(SCHEDULES_DIR);
    for (const file of files) {
      if (file.endsWith(".json")) {
        const data = await readFile(join(SCHEDULES_DIR, file), "utf-8");
        configs.push(JSON.parse(data));
      }
    }
  } catch {}
  return configs;
}

/**
 * Delete a scheduled task.
 */
export async function deleteSchedule(name: string): Promise<boolean> {
  const label = toPlistLabel(name);
  const plistPath = join(LAUNCH_AGENTS_DIR, `${label}.plist`);

  try {
    await execFileAsync("launchctl", ["unload", plistPath]).catch(() => {});
    await unlink(plistPath).catch(() => {});
    await unlink(join(SCHEDULES_DIR, `${name}.sh`)).catch(() => {});
    await unlink(join(SCHEDULES_DIR, `${name}.json`)).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
