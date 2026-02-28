#!/bin/bash
# Helix Voice System Health Check
# Checks Whisper (STT), Kokoro (TTS), and Noise Gate status.
# Exit code 0 = all systems operational. Exit code 1 = failures detected.

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
NOISE_GATE_LOG_LAUNCHD="$PROJECT_ROOT/agents/logs/noise-gate/noise-gate.log"
NOISE_GATE_LOG_SERVICE="$PROJECT_ROOT/services/noise-gate/logs/noise_gate.log"
CRASH_REPORTS_DIR="$HOME/Library/Logs/DiagnosticReports"

WHISPER_PORT="${WHISPER_PORT:-2022}"
KOKORO_PORT="${KOKORO_PORT:-8880}"

# Source .env if present
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a; source "$PROJECT_ROOT/.env"; set +a
fi

check_audio_processing() {
  local pid="$1"
  if [ -z "$pid" ]; then echo "DEAD"; return; fi

  if tail -5 "$NOISE_GATE_LOG_LAUNCHD" 2>/dev/null | grep -q "Chunks:"; then
    LAST_ACTIVITY=$(tail -1 "$NOISE_GATE_LOG_LAUNCHD" | grep -oE "Chunks: [0-9,]+ \| Rate: [0-9]+/s")
    echo "PROCESSING: $LAST_ACTIVITY"
  elif tail -5 "$NOISE_GATE_LOG_SERVICE" 2>/dev/null | grep -q "Streams started"; then
    UPTIME=$(ps -p "$pid" -o etime= 2>/dev/null | xargs)
    echo "PROCESSING (uptime: $UPTIME)"
  else
    echo "STALLED (running but not processing)"
  fi
}

check_recent_crashes() {
  RECENT_CRASHES=$(find "$CRASH_REPORTS_DIR" -name "Python*.crash" -mtime -1 2>/dev/null | wc -l | tr -d ' ')
  if [ "$RECENT_CRASHES" -gt 0 ]; then
    LATEST_CRASH=$(ls -t "$CRASH_REPORTS_DIR"/Python*.crash 2>/dev/null | head -1)
    CRASH_TIME=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$LATEST_CRASH" 2>/dev/null)
    echo "⚠️  $RECENT_CRASHES crash(es) in last 24h (latest: $CRASH_TIME)"
    CRASH_REASON=$(grep "Exception Type:" "$LATEST_CRASH" 2>/dev/null | head -1 | cut -d: -f2 | xargs)
    if [ -n "$CRASH_REASON" ]; then echo "   Reason: $CRASH_REASON"; fi
  fi
}

echo "=== Helix Voice System Health Check ==="
echo ""
echo "Services:"

# Whisper
WHISPER_STATUS=$(curl -s "http://localhost:${WHISPER_PORT}/health" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
if [ "$WHISPER_STATUS" = "ok" ]; then
  WHISPER_PID=$(lsof -ti:"$WHISPER_PORT" 2>/dev/null)
  WHISPER_MEM=$(ps -p $WHISPER_PID -o rss= 2>/dev/null | awk '{printf "%.1f MB", $1/1024}')
  echo "  ✓ Whisper: ONLINE (PID $WHISPER_PID, $WHISPER_MEM)"
else
  echo "  ✗ Whisper: OFFLINE (port $WHISPER_PORT)"
  WHISPER_OK=false
fi

# Kokoro
KOKORO_STATUS=$(curl -s "http://localhost:${KOKORO_PORT}/health" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
if [ "$KOKORO_STATUS" = "healthy" ]; then
  KOKORO_PID=$(lsof -ti:"$KOKORO_PORT" 2>/dev/null)
  KOKORO_MEM=$(ps -p $KOKORO_PID -o rss= 2>/dev/null | awk '{printf "%.1f MB", $1/1024}')
  echo "  ✓ Kokoro: ONLINE (PID $KOKORO_PID, $KOKORO_MEM)"
else
  echo "  ✗ Kokoro: OFFLINE (port $KOKORO_PORT)"
  KOKORO_OK=false
fi

# Noise Gate
NOISE_GATE_PID=$(ps aux | grep "[n]oise_gate.py" | awk '{print $2}')
AUDIO_STATUS=$(check_audio_processing "$NOISE_GATE_PID")

if [[ "$AUDIO_STATUS" == "PROCESSING:"* ]]; then
  NOISE_GATE_MEM=$(ps -p $NOISE_GATE_PID -o rss= 2>/dev/null | awk '{printf "%.1f MB", $1/1024}')
  echo "  ✓ Noise Gate: $AUDIO_STATUS"
  echo "    (PID $NOISE_GATE_PID, $NOISE_GATE_MEM)"
  NOISE_GATE_OK=true
elif [[ "$AUDIO_STATUS" == "STALLED"* ]]; then
  echo "  ⚠️  Noise Gate: $AUDIO_STATUS (may need restart)"
  NOISE_GATE_OK=false
else
  echo "  ✗ Noise Gate: OFFLINE"
  NOISE_GATE_OK=false
fi

# Audio routing
echo ""
echo "Audio Routing:"
INPUT_DEVICE=$(SwitchAudioSource -c -t input 2>/dev/null || echo "unknown")
OUTPUT_DEVICE=$(SwitchAudioSource -c -t output 2>/dev/null || echo "unknown")
echo "  Input:  $INPUT_DEVICE"
echo "  Output: $OUTPUT_DEVICE"

# Crash history
echo ""
echo "Crash History:"
check_recent_crashes

# System resources
echo ""
echo "System Resources:"
MEM_PRESSURE=$(memory_pressure 2>/dev/null | grep "System-wide memory free percentage:" | awk '{print $5}')
if [ -n "$MEM_PRESSURE" ]; then echo "  Memory free: $MEM_PRESSURE"; else echo "  Memory free: unknown"; fi

# Result
if [ "$WHISPER_STATUS" = "ok" ] && [ "$KOKORO_STATUS" = "healthy" ] && [ "${NOISE_GATE_OK:-false}" = true ]; then
  echo ""
  echo "Status: ALL SYSTEMS OPERATIONAL"
  exit 0
else
  echo ""
  echo "Status: FAILURES DETECTED"
  exit 1
fi
