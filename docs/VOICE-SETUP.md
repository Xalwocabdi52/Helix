# Voice Setup Guide

Local voice mode — Whisper (STT) + Kokoro (TTS). No cloud. No API costs per word.

---

## How It Works

```
You speak → USB Mic → Whisper → transcript → Claude → response text → Kokoro → you hear
```

Voice mode is optional. Helix works fine without it. But if you want to talk to your agent instead of type, this is how.

---

## Requirements

- USB microphone (recommended — more reliable than built-in)
- Python 3.11+
- `uvx` (comes with uv) — for running voicemode
- A compatible Whisper server
- A compatible Kokoro server

---

## Step 1 — Install Whisper (STT)

Any OpenAI-compatible `/v1/audio/transcriptions` endpoint works. Recommended: **faster-whisper-server**.

```bash
pip install faster-whisper-server
faster-whisper-server --port 2022 --model base.en
```

Or use the uvx approach:
```bash
uvx faster-whisper-server --port 2022 --model base.en
```

Verify: `curl http://localhost:2022/health` → `{"status":"ok"}`

**Model selection:**
- `tiny.en` — fastest, less accurate (~50MB)
- `base.en` — good balance (~150MB)
- `small.en` — more accurate, slower (~450MB)

---

## Step 2 — Install Kokoro (TTS)

Kokoro is a high-quality local TTS. Recommended: **kokoro-onnx**.

```bash
pip install kokoro-onnx
# Download a voice model first — see kokoro-onnx docs
kokoro-server --port 8880
```

Verify: `curl http://localhost:8880/health` → `{"status":"healthy"}`

---

## Step 3 — Configure voicemode

voicemode is the MCP plugin that connects Claude Code to Whisper and Kokoro.

```bash
# Install via uvx
uvx voicemode

# Or add to your ~/.voicemode/voicemode.env:
VOICEMODE_STT_URL=http://localhost:2022
VOICEMODE_TTS_URL=http://localhost:8880
VOICEMODE_SAMPLE_RATE=32000
```

---

## Step 4 — Configure Audio

Set your **system input** to your USB microphone:

```bash
# macOS: use SwitchAudioSource (install via brew)
brew install switchaudio-osx
SwitchAudioSource -s "USB PnP Audio Device" -t input
```

---

## Step 5 — Test

Run the health check:
```bash
bash services/voice-health-check.sh
```

All three services should show ✓. Then start Claude — it will run the boot sequence and greet you.

If something fails, run auto-recovery:
```bash
bash services/voice-auto-recover.sh
```

---

## Running as Background Services

For voice to work at session start, Whisper and Kokoro need to be running before you start Claude. Options:

### Option A — launchd (recommended)

Create plist files that start Whisper and Kokoro at login. Basic template:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.helix.whisper</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/faster-whisper-server</string>
        <string>--port</string>
        <string>2022</string>
        <string>--model</string>
        <string>base.en</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Save to `~/Library/LaunchAgents/com.helix.whisper.plist` and `launchctl load` it.

### Option B — Manual start scripts

```bash
# whisper-start.sh
faster-whisper-server --port 2022 --model base.en &
disown

# kokoro-start.sh
kokoro-server --port 8880 &
disown
```

---

## VAD Tuning

Voice Activity Detection (VAD) controls when recording stops. If Claude cuts you off too early or waits too long:

In `~/.voicemode/voicemode.env`:
```bash
VOICEMODE_VAD_AGGRESSIVENESS=3  # 0=permissive, 3=strict
VOICEMODE_LISTEN_DURATION_MIN=2.0  # min seconds before silence detection
VOICEMODE_LISTEN_DURATION_MAX=30   # max seconds to listen
```

**Recommended for USB direct (no noise gate):** `vad_aggressiveness=3` — strict mode correctly ignores ambient hum.

---

## Noise Gate (Optional)

`services/noise-gate/` contains a Python spectral noise gate that processes audio before it reaches Whisper. Useful if you have loud HVAC or fan noise.

**Current status:** The noise gate runs via `services/noise-gate/start.sh` and routes through BlackHole 2ch (a virtual audio device). It's optional — strict VAD on USB direct works without it.

**If you want to use it:**
1. Install BlackHole: `brew install blackhole-2ch`
2. Install deps: `pip install sounddevice numpy scipy`
3. Start: `bash services/noise-gate/start.sh`
4. Set system input to "BlackHole 2ch"

---

## Sample Rate

If you get audio corruption or VAD issues, match the sample rate between your Whisper server and voicemode:

```bash
# In .env or voicemode.env
VOICEMODE_SAMPLE_RATE=32000  # must match whisper server's sample rate
```

---

## Troubleshooting

**"No speech detected" every time:**
- Check system input is set to your USB mic (not built-in)
- Try `vad_aggressiveness=1` temporarily to confirm audio is getting through
- Verify Whisper is actually processing: `curl -s http://localhost:2022/health`

**TTS playing but distorted:**
- Sample rate mismatch — set `VOICEMODE_SAMPLE_RATE` to match Whisper's rate
- Kokoro may need a different output sample rate — check its docs

**Voice works once then stops:**
- Classic sample rate mismatch bug — after first call, stream gets corrupted
- Fix: ensure `VOICEMODE_SAMPLE_RATE` is consistent

**Long silence before recording starts:**
- The boot sequence greets with `listen_duration_max=6` — just checking if you're there
- Normal calls use `listen_duration_max=30`
