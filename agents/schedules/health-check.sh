#!/bin/bash
# Helix Scheduled Agent: health-check
# Runs periodically. Checks agent status, memory, and system health.
# Log issues to Apple Notes; do nothing if all is well.

set -euo pipefail

export TZ='America/Los_Angeles'
export PATH="/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
LOG_DIR="$PROJECT_ROOT/agents/logs"
LOG_FILE="$LOG_DIR/$(date '+%Y-%m-%d_%H%M')_health-check.md"
MAX_TIME=600

if [ -f "$PROJECT_ROOT/.env" ]; then set -a; source "$PROJECT_ROOT/.env"; set +a; fi

CURRENT_DATE="$(date '+%A, %B %d, %Y at %I:%M %p %Z')"

PROMPT="Today is $CURRENT_DATE. System health check:

1. Check agent_list — any stuck agents?
2. Verify system responsive (quick memory recall test)
3. Check for any errors in recent agent logs under $PROJECT_ROOT/agents/logs/

If issues found: create an Apple Notes note using notes_create with folder='helix-notes', title='Health Alert — $(date '+%Y-%m-%d %H:%M')', body summarizing the issue.
If all clear: memory_remember with content='Health check $(date '+%Y-%m-%d %H:%M'): OK', category='health', tags=['check']

Do NOT send Telegram."

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
echo "Starting health-check at $(date)"
run_with_timeout $MAX_TIME "$CLAUDE_BIN" --print --dangerously-skip-permissions "$PROMPT" > "$LOG_FILE" 2>&1
echo "Agent completed at $(date) with exit code $?"
