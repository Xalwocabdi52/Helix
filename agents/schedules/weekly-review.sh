#!/bin/bash
# Helix Scheduled Agent: weekly-review
# Runs Friday evening. Generates a productivity report for the week.

set -euo pipefail

export TZ='America/Los_Angeles'
export PATH="/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
LOG_DIR="$PROJECT_ROOT/agents/logs"
LOG_FILE="$LOG_DIR/$(date '+%Y-%m-%d_%H%M')_weekly-review.md"
MAX_TIME=1800

if [ -f "$PROJECT_ROOT/.env" ]; then set -a; source "$PROJECT_ROOT/.env"; set +a; fi

CURRENT_DATE="$(date '+%A, %B %d, %Y at %I:%M %p %Z')"

PROMPT="Today is $CURRENT_DATE. Weekly review:

1. Check screen_time for the past 7 days — overall patterns?
2. Check github_commits with days_back=7 — what shipped this week?
3. Check gcal_list for the past week — how was time spent?
4. Review notes for the week — any decisions made, lessons learned?
5. Check memory for the week — what did we work on?

Synthesize into a weekly review note:
- What got done
- What got blocked or carried over
- Patterns worth noting
- One or two intentions for next week

Create an Apple Notes note using notes_create with folder='helix-notes', title='Weekly Review — Week of $(date '+%b %d')', body as the full review.
memory_remember with content='Weekly review $(date '+%Y-%m-%d'): [summary]', category='review', tags=['weekly', '$(date '+%Y-W%V')']"

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
echo "Starting weekly-review at $(date)"
run_with_timeout $MAX_TIME "$CLAUDE_BIN" --print --dangerously-skip-permissions "$PROMPT" > "$LOG_FILE" 2>&1
echo "Agent completed at $(date) with exit code $?"
