#!/bin/bash
# Stop NOVA noise gate and restore USB mic as default input
pkill -f noise_gate.py 2>/dev/null
SwitchAudioSource -t input -s "USB PnP Audio Device" 2>/dev/null
echo "Noise gate stopped, input restored to USB mic"
