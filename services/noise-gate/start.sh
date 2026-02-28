#!/bin/bash
# Start NOVA noise gate service (launchd-compatible)
# Sets BlackHole as system default input, then runs the spectral gate

SCRIPT_DIR="$(dirname "$0")"
LOG_DIR="$SCRIPT_DIR/logs"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Set BlackHole as default input (voicemode reads from system default)
SwitchAudioSource -t input -s "BlackHole 2ch" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to set BlackHole as input device" >&2
    exit 1
fi

# Check if already running (defensive - launchd should handle this)
if pgrep -f "noise_gate.py" > /dev/null; then
    echo "Noise gate already running (PID: $(pgrep -f noise_gate.py))"
    exit 0
fi

# Verify audio devices are available before starting
python3 -c "
import sounddevice as sd
devices = sd.query_devices()
if not any('BlackHole' in d['name'] for d in devices):
    import sys
    print('ERROR: BlackHole device not found', file=sys.stderr)
    sys.exit(1)
if not any('USB' in d['name'] for d in devices):
    import sys
    print('ERROR: USB mic not found', file=sys.stderr)
    sys.exit(1)
" 2>&1

if [ $? -ne 0 ]; then
    echo "ERROR: Audio devices not available" >&2
    exit 1
fi

# Start the noise gate (exec for proper signal handling with launchd)
# No backgrounding (&) - launchd handles process management
exec python3 "$SCRIPT_DIR/noise_gate.py"
