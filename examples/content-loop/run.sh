#!/bin/bash
# Helix Content Loop — runs every 30 minutes via launchd
# Reads the roadmap, executes one task, updates roadmap, exits.
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
LOG_DIR="$NOVA_ROOT/agents/logs"
LOCK_FILE="/tmp/helix-content-loop.lock"
MAX_RUNTIME=1800  # 30 minutes hard cap

# ── Lockfile: skip if already running ──────────────────────────────────────
if [ -f "$LOCK_FILE" ]; then
  EXISTING_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
  if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "[content-loop] Already running (PID $EXISTING_PID). Skipping tick."
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi

echo $$ > "$LOCK_FILE"
trap "rm -f '$LOCK_FILE'" EXIT

# ── Environment ─────────────────────────────────────────────────────────────
export TZ='America/Toronto'
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="${HOME:-$(eval echo ~$(whoami))}"
export NOVA_SESSION_TIER="scheduled"
export NOVA_AGENT_DEPTH="0"

if [ -f "$NOVA_ROOT/.env" ]; then
  set -a
  source "$NOVA_ROOT/.env"
  set +a
fi

# ── Log file ────────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$(date '+%Y-%m-%d_%H%M')_content-loop.md"

echo "---" >> "$LOG_FILE"
echo "tick: $(date '+%Y-%m-%d %H:%M:%S %Z')" >> "$LOG_FILE"
echo "pid: $$" >> "$LOG_FILE"
echo "---" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# ── Build prompt ─────────────────────────────────────────────────────────────
source "$NOVA_ROOT/examples/content-loop/prompt-template.sh"

echo "mode: $TIME_MODE" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# ── Run NOVA with timeout watchdog ──────────────────────────────────────────
echo "[content-loop] Tick starting at $(date) — mode: $TIME_MODE"

(
  sleep "$MAX_RUNTIME"
  echo "[content-loop] Timeout reached after ${MAX_RUNTIME}s. Killing."
  kill -TERM $$ 2>/dev/null
) &
WATCHDOG_PID=$!

"$CLAUDE_BIN" \
  --print \
  --dangerously-skip-permissions \
  "$LOOP_PROMPT" \
  >> "$LOG_FILE" 2>&1

EXIT_CODE=$?

kill "$WATCHDOG_PID" 2>/dev/null || true
wait "$WATCHDOG_PID" 2>/dev/null || true

echo "" >> "$LOG_FILE"
echo "--- exit: $EXIT_CODE at $(date '+%Y-%m-%d %H:%M:%S %Z') ---" >> "$LOG_FILE"
echo "[content-loop] Tick complete. Exit: $EXIT_CODE. Log: $LOG_FILE"
