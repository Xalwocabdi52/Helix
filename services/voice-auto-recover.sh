#!/bin/bash
# Helix Voice Auto-Recovery
# Checks each voice service and attempts restart if down.
# Exit code 0 = no recovery needed. Exit code 1 = recovery actions taken.

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
NOISE_GATE_LOG="$PROJECT_ROOT/agents/logs/noise-gate/noise-gate.error.log"
CRASH_REPORTS_DIR="$HOME/Library/Logs/DiagnosticReports"

WHISPER_PORT="${WHISPER_PORT:-2022}"
KOKORO_PORT="${KOKORO_PORT:-8880}"

# Source .env if present
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a; source "$PROJECT_ROOT/.env"; set +a
fi

echo "=== Helix Voice Auto-Recovery ==="
echo ""

RECOVERY_NEEDED=false

diagnose_noise_gate_crash() {
  LATEST_CRASH=$(ls -t "$CRASH_REPORTS_DIR"/Python*.crash 2>/dev/null | head -1)
  if [ -n "$LATEST_CRASH" ]; then
    CRASH_AGE=$(( $(date +%s) - $(stat -f "%m" "$LATEST_CRASH") ))
    if [ "$CRASH_AGE" -lt 300 ]; then
      echo "Crash analysis (last 5 minutes):"
      CRASH_REASON=$(grep "Exception Type:" "$LATEST_CRASH" 2>/dev/null | head -1 | cut -d: -f2 | xargs)
      echo "  Type: $CRASH_REASON"
      if grep -q "sounddevice" "$LATEST_CRASH" 2>/dev/null; then
        echo "  Likely cause: Audio device disconnection"
      elif grep -q "numpy\|scipy" "$LATEST_CRASH" 2>/dev/null; then
        echo "  Likely cause: Math library error"
      elif grep -q "queue.Full\|queue.Empty" "$LATEST_CRASH" 2>/dev/null; then
        echo "  Likely cause: Audio buffer overrun (system overload?)"
      else
        echo "  See: $LATEST_CRASH"
      fi
    fi
  fi
}

# Whisper
if ! curl -s "http://localhost:${WHISPER_PORT}/health" >/dev/null 2>&1; then
  echo "⚠️  Whisper is down."
  echo "  Use MCP tool: service('whisper', 'restart')"
  RECOVERY_NEEDED=true
else
  echo "✓ Whisper healthy"
fi

# Kokoro
if ! curl -s "http://localhost:${KOKORO_PORT}/health" >/dev/null 2>&1; then
  echo "⚠️  Kokoro is down."
  echo "  Use MCP tool: service('kokoro', 'restart')"
  RECOVERY_NEEDED=true
else
  echo "✓ Kokoro healthy"
fi

# Noise Gate
if ! ps aux | grep -q "[n]oise_gate.py"; then
  echo "⚠️  Noise Gate is down."
  diagnose_noise_gate_crash
  echo ""
  echo "Attempting recovery..."

  # Verify audio devices
  python3 -c "
import sounddevice as sd
devices = sd.query_devices()
usb = [d for d in devices if 'USB' in d['name'] or 'Microphone' in d['name']]
if not usb:
    print('WARNING: No USB mic found — check audio device connection')
else:
    print(f'Audio device found: {usb[0][\"name\"]}')
" 2>&1

  # Try launchd restart first, then manual
  LAUNCHD_LABEL="com.helix.noise-gate"
  if launchctl list 2>/dev/null | grep -q "$LAUNCHD_LABEL"; then
    echo "  Restarting via launchctl..."
    launchctl kickstart -k "gui/$(id -u)/$LAUNCHD_LABEL"
  else
    NOISE_GATE_START="$PROJECT_ROOT/services/noise-gate/start.sh"
    if [ -f "$NOISE_GATE_START" ]; then
      echo "  Starting manually..."
      bash "$NOISE_GATE_START"
    else
      echo "  No start script found at $NOISE_GATE_START"
    fi
  fi

  sleep 3
  if ps aux | grep -q "[n]oise_gate.py"; then
    echo "  ✓ Noise gate restarted"
  else
    echo "  ✗ Noise gate failed to start (check logs)"
  fi

  RECOVERY_NEEDED=true
else
  # Check for stall
  NOISE_GATE_LOG_STDOUT="$PROJECT_ROOT/agents/logs/noise-gate/noise-gate.log"
  if [ -f "$NOISE_GATE_LOG_STDOUT" ] && ! tail -5 "$NOISE_GATE_LOG_STDOUT" 2>/dev/null | grep -q "Chunks:"; then
    echo "⚠️  Noise Gate is stalled (running but not processing audio)"
    echo "  Restarting stalled process..."
    pkill -f noise_gate.py
    sleep 1
    LAUNCHD_LABEL="com.helix.noise-gate"
    if launchctl list 2>/dev/null | grep -q "$LAUNCHD_LABEL"; then
      launchctl kickstart "gui/$(id -u)/$LAUNCHD_LABEL"
    elif [ -f "$PROJECT_ROOT/services/noise-gate/start.sh" ]; then
      bash "$PROJECT_ROOT/services/noise-gate/start.sh"
    fi
    RECOVERY_NEEDED=true
  else
    echo "✓ Noise Gate healthy"
  fi
fi

echo ""
if [ "$RECOVERY_NEEDED" = true ]; then
  echo "Recovery actions completed."
  echo "Run health check to verify: bash services/voice-health-check.sh"
  exit 1
else
  echo "No recovery needed. All systems operational."
  exit 0
fi
