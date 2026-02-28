<div align="center">

# ⬡ Helix

**A personal AI OS for macOS, powered by Claude.**

*Persistent memory. System control. Local voice. Autonomous loops. All yours.*

<br/>

[![macOS](https://img.shields.io/badge/macOS-14%2B-000000?style=flat-square&logo=apple&logoColor=white)](https://www.apple.com/macos/)
[![Claude Code](https://img.shields.io/badge/Claude_Code-required-CC785C?style=flat-square)](https://claude.ai/claude-code)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License: ELv2](https://img.shields.io/badge/license-ELv2-5C6BC0?style=flat-square)](LICENSE)

</div>

---

Helix is not a chat app. It's infrastructure — an identity layer, four MCP servers, a voice pipeline, and a loop framework that lets Claude **do things** autonomously on your Mac.

You fork it, configure it, and own it. Your agent. Your rules.

---

## What It Is

Four MCP servers that plug directly into Claude Code:

| Server | What it does |
|--------|-------------|
| `nova-mac` | macOS control — apps, Chrome, Calendar, Reminders, Notes, Music, Finder |
| `nova-memory` | Persistent JSON memory with keyword search — survives across sessions |
| `nova-agents` | Spawn background Claude agents, schedule them via launchd, coordinate via messages |
| `nova-telegram` | Remote access — control your agent from your phone via Telegram |

Plus three layers on top:

- **Voice** — local Whisper (STT) + Kokoro (TTS), auto health check and recovery at every session start
- **Loops** — autonomous scheduled tasks via launchd (content posting, briefings, monitoring, anything)
- **Identity** — `CLAUDE.md` defines who your agent is, what it knows, and how it behaves

## What It's Not

> Not a cloud service. Not cross-platform. Not a UI.
>
> Helix runs entirely on your Mac, uses AppleScript and launchd natively, and you interact through the `claude` CLI. If that's not your thing, this isn't your thing.

---

## Architecture

```
You ←→ Claude Code (claude CLI)
           │
           ├── nova-mac      → macOS + Chrome
           ├── nova-memory   → Persistent state
           ├── nova-agents   → Background workers + scheduling
           └── nova-telegram → Telegram relay
                    │
              CLAUDE.md  ·  .env
```

Loops run on launchd schedules, write logs to `agents/logs/`, and surface blockers via `agents/messages/pending-tasks.json`. Voice, text, and Telegram sessions all share state through `nova-memory`.

→ [Full architecture docs](docs/ARCHITECTURE.md)

---

## Setup

### 1. Clone and configure

```bash
git clone https://github.com/JonJLevesque/Helix.git ~/Developer/Helix
cd ~/Developer/Helix
cp .env.example .env
```

Open `.env` and fill in at minimum:

```bash
PROJECT_ROOT=/Users/yourname/Developer/Helix
CLAUDE_BIN=$(which claude)
NODE_BIN=$(which node)
```

### 2. Build

```bash
bash scripts/setup.sh
```

Installs and builds all 4 MCP servers. Manual alternative:

```bash
for server in mcp-servers/nova-mac mcp-servers/nova-memory mcp-servers/nova-agents mcp-servers/nova-telegram; do
  cd $server && npm install && npm run build && cd ../..
done
```

### 3. Register MCP servers

The setup script patches `.mcp.json` automatically. To do it manually:

```bash
sed -i '' "s|PROJECT_ROOT|$PROJECT_ROOT|g" .mcp.json
sed -i '' "s|NODE_BIN|$NODE_BIN|g" .mcp.json
sed -i '' "s|CLAUDE_BIN|$CLAUDE_BIN|g" .mcp.json
```

Verify: `claude mcp list` — all four servers should appear.

### 4. Set your identity

Open `CLAUDE.md` and replace the placeholders:

| Placeholder | Replace with |
|-------------|-------------|
| `{{AGENT_NAME}}` | Your agent's name |
| `{{USER_NAME}}` | Your name |
| `{{NICKNAME}}` | What you want to be called |

### 5. Launch

```bash
claude
```

All 4 MCP tools load automatically. Test with `memory_remember`, `app_list`, or `gcal_list`.

<details>
<summary><strong>Troubleshooting</strong></summary>

**MCP server not loading** — check `claude mcp list` for errors, or run the server manually:
```bash
node mcp-servers/nova-mac/dist/index.js
```

**Telegram not responding** — verify the bot token and confirm your user ID is in `TELEGRAM_ALLOWED_USER_IDS`:
```bash
curl https://api.telegram.org/bot<TOKEN>/getMe
```

</details>

---

## Voice Mode

Local Whisper + Kokoro. No cloud. No per-word cost.

```
USB Mic → Whisper (STT) → Claude → Kokoro (TTS) → speakers
```

At session start, Claude runs a health check, greets you by voice, and listens for 6 seconds. Talk back and it stays in voice mode. Type and it silently falls back to text.

### 1. Install Whisper

Any OpenAI-compatible `/v1/audio/transcriptions` endpoint works. Easiest:

```bash
pip install faster-whisper-server
faster-whisper-server --port 2022 --model base.en
```

`curl http://localhost:2022/health` → `{"status":"ok"}`

> **Model options:** `tiny.en` (~50MB, fastest) · `base.en` (~150MB, balanced) · `small.en` (~450MB, most accurate)

### 2. Install Kokoro

```bash
pip install kokoro-onnx
kokoro-server --port 8880
```

`curl http://localhost:8880/health` → `{"status":"healthy"}`

### 3. Set audio input

```bash
brew install switchaudio-osx
SwitchAudioSource -s "USB PnP Audio Device" -t input
```

### 4. Test

```bash
bash services/voice-health-check.sh
```

All three services show ✓ → you're good. If anything fails:

```bash
bash services/voice-auto-recover.sh
```

<details>
<summary><strong>VAD tuning + running at login</strong></summary>

**Tune voice activity detection** in `~/.voicemode/voicemode.env`:

```bash
VOICEMODE_VAD_AGGRESSIVENESS=3    # 0=permissive, 3=strict
VOICEMODE_LISTEN_DURATION_MIN=2.0
VOICEMODE_SAMPLE_RATE=32000       # must match your Whisper server
```

`vad_aggressiveness=3` on USB direct correctly ignores ambient hum without a noise gate.

**Run at login** — create launchd plists for Whisper and Kokoro so they're ready before Claude starts. See `config/com.helix.template-loop.plist` for the plist structure.

</details>

---

## Loops

Loops are Claude agents that run on a schedule via launchd. Every tick: read state → execute one action → update state → exit.

```
launchd (StartInterval)
  → run.sh
  → prompt-template.sh  (builds the prompt)
  → claude --print ...
  → MCP tools execute
  → state file updated
  → exit
```

A scaffold is in `services/template-loop/`. A real anonymized example (content marketing loop) is in `examples/content-loop/`.

→ [Full loop guide](docs/LOOPS-GUIDE.md)

---

## Directory Structure

```
helix/
├── CLAUDE.md                        # Agent identity — start here
├── .env.example                     # All variables documented
├── mcp-servers/
│   ├── nova-mac/                    # macOS + Chrome control
│   ├── nova-memory/                 # Persistent JSON memory
│   ├── nova-agents/                 # Agent spawning + scheduling
│   └── nova-telegram/               # Telegram relay
├── services/
│   ├── voice-health-check.sh
│   ├── voice-auto-recover.sh
│   ├── noise-gate/                  # Optional noise reduction
│   └── template-loop/               # Loop scaffold
├── agents/
│   ├── schedules/                   # launchd-triggered scripts
│   └── messages/                    # Inter-agent queue + pending tasks
├── config/
│   ├── safety.json                  # Blocked commands + rate limits
│   ├── example-persona.md           # Persona template
│   └── com.helix.template-loop.plist
├── examples/
│   └── content-loop/                # Real-world loop, anonymized
├── docs/
│   ├── ARCHITECTURE.md
│   ├── MCP-SERVERS.md
│   ├── VOICE-SETUP.md
│   └── LOOPS-GUIDE.md
└── scripts/
    └── setup.sh
```

---

## Requirements

**Required**
- macOS 14+ (Apple Silicon recommended)
- [Claude Code](https://claude.ai/claude-code) — `claude` CLI
- Node.js 20+ (nvm recommended)

**Optional**
- Python 3.11+ — for voice services
- [faster-whisper-server](https://github.com/fedirz/faster-whisper-server) or compatible STT
- [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) TTS server
- Telegram account — for remote access

---

## License

[Elastic License 2.0 (ELv2)](LICENSE) — free to use and modify. Cannot be sold or offered as a managed service without permission.
