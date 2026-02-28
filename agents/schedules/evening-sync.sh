#!/bin/bash
# Helix Scheduled Agent: evening-sync
# Runs at 6pm daily. Reviews the day and previews tomorrow.

set -euo pipefail

export TZ='America/Los_Angeles'
export PATH="/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
LOG_DIR="$PROJECT_ROOT/agents/logs"
LOG_FILE="$LOG_DIR/$(date '+%Y-%m-%d_%H%M')_evening-sync.md"
MAX_TIME=1200

if [ -f "$PROJECT_ROOT/.env" ]; then set -a; source "$PROJECT_ROOT/.env"; set +a; fi

CURRENT_DATE="$(date '+%A, %B %d, %Y at %I:%M %p %Z')"

PROMPT="Today is $CURRENT_DATE. Evening sync:

1. Check screen_time_today — how was the day spent?
2. Check github_commits with days_back=1 — what got done today?
3. Check gcal_list with days_ahead=1 — what's coming up tomorrow?
4. Check gmail_unread — anything urgent before EOD?

Synthesize into a clean evening summary. Then:
- Create an Apple Notes note using notes_create with folder='helix-notes', title='Evening Sync — $(date '+%b %d')', body as the full summary
- Do NOT send Telegram. Notes only.
- memory_remember with content='Evening sync $(date '+%Y-%m-%d'): [summary]', category='briefing', tags=['evening', '$(date '+%Y-%m-%d')']"

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
echo "Starting evening-sync at $(date)"
run_with_timeout $MAX_TIME "$CLAUDE_BIN" --print --dangerously-skip-permissions "$PROMPT" > "$LOG_FILE" 2>&1
echo "Agent completed at $(date) with exit code $?"
