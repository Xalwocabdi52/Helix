#!/bin/bash
# Helix Scheduled Agent: morning-briefing
# Runs at 8am daily. Generates a morning summary and saves to Apple Notes.

set -euo pipefail

export TZ='America/Los_Angeles'
export PATH="/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
LOG_DIR="$PROJECT_ROOT/agents/logs"
LOG_FILE="$LOG_DIR/$(date '+%Y-%m-%d_%H%M')_morning-briefing.md"
MAX_TIME=1200

# Source environment
if [ -f "$PROJECT_ROOT/.env" ]; then set -a; source "$PROJECT_ROOT/.env"; set +a; fi

CURRENT_DATE="$(date '+%A, %B %d, %Y at %I:%M %p %Z')"

PROMPT="Today is $CURRENT_DATE. Morning briefing:

1. Check gmail_unread — any important emails overnight?
2. Check gcal_list with days_ahead=1 — what's on the schedule today?
3. Check github_activity_summary with days_back=1 — any commits yesterday?
4. Check reminders_list — any pending tasks?
5. Read agents/messages/pending-tasks.json — list any open pending items

Then create an Apple Notes note using notes_create with:
- folder: 'helix-notes' (or your configured notes folder)
- title: 'Daily Brief — $(date '+%b %d')'
- body: structured summary with sections for Email, Calendar, GitHub, Reminders, Blockers

Do NOT send Telegram. Notes only.
Store summary in memory: memory_remember with content='Morning briefing $(date '+%Y-%m-%d'): [one-line summary]', category='briefing', tags=['morning', '$(date '+%Y-%m-%d')']"

run_with_timeout() {
  local max_time=$1; shift
  "$@" &
  local pid=$!
  ( sleep "$max_time" && kill -TERM "$pid" 2>/dev/null && sleep 5 && kill -9 "$pid" 2>/dev/null ) &
  local watchdog=$!
  wait "$pid" 2>/dev/null; local exit_code=$?
  kill "$watchdog" 2>/dev/null; wait "$watchdog" 2>/dev/null
  return $exit_code
}

mkdir -p "$LOG_DIR"
echo "Starting morning-briefing at $(date)"
run_with_timeout $MAX_TIME "$CLAUDE_BIN" --print --dangerously-skip-permissions "$PROMPT" > "$LOG_FILE" 2>&1
echo "Agent completed at $(date) with exit code $?"
