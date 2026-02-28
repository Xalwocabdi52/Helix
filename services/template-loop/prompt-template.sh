#!/bin/bash
# Helix Loop — Prompt Template
# Customize this to define what your loop does each tick.
# Usage: source this file to get $LOOP_PROMPT and $TIME_MODE

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
STATE_FILE="$PROJECT_ROOT/agents/messages/loop-state.json"
NOW="$(date '+%A, %B %d, %Y at %I:%M %p %Z')"

# Source .env for any API keys or config your loop needs
if [ -f "$PROJECT_ROOT/.env" ]; then set -a; source "$PROJECT_ROOT/.env"; set +a; fi

# ── Time-of-day mode ────────────────────────────────────────────────────────
# Example: only allow posting during daytime hours
HOUR=$(TZ='America/Los_Angeles' date '+%-H')  # 0–23
if [ "$HOUR" -ge 8 ] && [ "$HOUR" -lt 22 ]; then
  TIME_MODE="ACTIVE"
else
  TIME_MODE="BUILD"
fi
CURRENT_TIME=$(TZ='America/Los_Angeles' date '+%I:%M %p %Z')

# ── Read current state ───────────────────────────────────────────────────────
STATE_CONTENT="$(cat "$STATE_FILE" 2>/dev/null || echo '{}')"

read -r -d '' LOOP_PROMPT << 'PROMPT_EOF' || true
Today is NOW_PLACEHOLDER.
Current time: CURRENT_TIME_PLACEHOLDER
Mode: TIME_MODE_PLACEHOLDER

You are an autonomous loop agent. Your job this tick:
1. Read the current state
2. Pick ONE highest-priority task
3. Execute it
4. Update state
5. Exit cleanly

CURRENT STATE:
STATE_PLACEHOLDER

YOUR TASK THIS TICK:
- Look at the state above. What is the highest-priority thing to do right now?
- Execute exactly ONE action. Do not try to do everything.
- After executing, update the state file at $PROJECT_ROOT/agents/messages/loop-state.json.
  Update these fields:
  - last_run: ISO timestamp
  - last_action: one-line description of what you did
  - last_result: "success", "skipped", or "blocked" with brief reason

RULES:
- One action per tick. Quality over quantity.
- If nothing is actionable: update state with reason, exit. Do not force.
- For tasks requiring human approval: log to $PROJECT_ROOT/agents/messages/pending-tasks.json and note in state. Do not block.
- The state is yours to evolve. Add new fields, reprioritize, adapt. Own it.
PROMPT_EOF

# Substitute actual values
LOOP_PROMPT="${LOOP_PROMPT//NOW_PLACEHOLDER/$NOW}"
LOOP_PROMPT="${LOOP_PROMPT//CURRENT_TIME_PLACEHOLDER/$CURRENT_TIME}"
LOOP_PROMPT="${LOOP_PROMPT//TIME_MODE_PLACEHOLDER/$TIME_MODE}"
LOOP_PROMPT="${LOOP_PROMPT//STATE_PLACEHOLDER/$STATE_CONTENT}"

export LOOP_PROMPT
export TIME_MODE
