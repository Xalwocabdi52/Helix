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
| `helix-mac` | macOS control — apps, Chrome, Calendar, Reminders, Notes, Music, Finder |
| `helix-memory` | Persistent JSON memory with keyword search — survives across sessions |
| `helix-agents` | Spawn background Claude agents, schedule them via launchd, coordinate via messages |
| `helix-telegram` | Remote access — control your agent from your phone via Telegram |

Plus three layers on top:

- **Voice** — local Whisper (STT) + Kokoro (TTS), auto health check and recovery at every session start
- **Loops** — autonomous scheduled tasks via launchd (content posting, briefings, monitoring, anything)
- **Identity** — `CLAUDE.md` defines who your agent is, what it knows, and how it behaves

## What It's Not

> Not a cloud service. Not cross-platform. Not a UI.
>
> Helix runs entirely on your Mac, uses AppleScript and launchd natively, and you interact through the `claude` CLI. If that's not your thing, this isn't your thing.

---

## Built to Stay Inside the Lines

Helix is the macOS-native alternative to frameworks like OpenClawd — built from the start for **control, security, and long-term scalability**, without touching Anthropic's Terms of Service.

**How it stays compliant:**

- **Official tooling only.** Helix runs Claude Code's `claude` CLI — the same tool you use interactively, just called headlessly via `claude --print`. This is an explicitly documented and supported use case. No unofficial API access, no session hijacking, no key scraping.
- **No third-party AI.** Every inference call goes through your own Claude subscription. No OpenAI, no Gemini, no model proxies. One model, one account, your control.
- **MCP is the sanctioned extension layer.** Anthropic built and maintains the Model Context Protocol specifically so developers can extend Claude with custom tools. Helix uses it exactly as designed.
- **Agentic use is documented.** Multi-agent orchestration, background `claude` processes, scheduled tasks — all of these are first-party patterns that appear in Anthropic's own Claude Code documentation with examples.
- **Nothing leaves your machine.** Memory is local JSON. Voice runs on local Whisper and Kokoro servers. Logs stay on disk. Your data doesn't touch a cloud you don't control.

**What this means for you:** Helix can run autonomously, indefinitely, without the risk of your account being flagged or your access cut off because a framework was doing something it shouldn't. Build on a foundation that's designed to last.

> **Note on loops:** The framework itself is TOS-safe. What your loops *do* is your responsibility — check the terms of any platform you interact with, use official APIs where they exist, and disclose AI involvement where required.

---

## Architecture

```
You ←→ Claude Code (claude CLI)
           │
           ├── helix-mac      → macOS + Chrome
           ├── helix-memory   → Persistent state
           ├── helix-agents   → Background workers + scheduling
           └── helix-telegram → Telegram relay
                    │
              CLAUDE.md  ·  .env
```

Loops run on launchd schedules, write logs to `agents/logs/`, and surface blockers via `agents/messages/pending-tasks.json`. Voice, text, and Telegram sessions all share state through `helix-memory`.

→ [Full architecture docs](docs/ARCHITECTURE.md)

---

## Setup

### 1. Clone and configure

```bash
git clone https://github.com/JonJLevesque/Helix.git ~/Developer/Helix
cd ~/Developer/Helix
cp .env.example .env
```

Open `.env` in any text editor. You need to fill in three values. Here's exactly how to find each one — open Terminal and run these commands:

**`PROJECT_ROOT`** — the folder you just cloned. Run this, then copy the result:
```bash
echo $HOME/Developer/Helix
```

**`CLAUDE_BIN`** — where the `claude` command lives on your machine. Run this, then copy the result:
```bash
which claude
```
It'll look something like `/Users/yourname/.local/bin/claude`

**`NODE_BIN`** — where Node.js lives. Run this, then copy the result:
```bash
which node
```
It'll look something like `/Users/yourname/.nvm/versions/node/v20.0.0/bin/node`

> If `which node` returns nothing, you need to install Node.js first:
> ```bash
> curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
> source ~/.zshrc
> nvm install 20
> ```
> Then run `which node` again.

Your finished `.env` should look something like this:
```bash
PROJECT_ROOT=/Users/janedoe/Developer/Helix
CLAUDE_BIN=/Users/janedoe/.local/bin/claude
NODE_BIN=/Users/janedoe/.nvm/versions/node/v20.15.0/bin/node
```

### 2. Install and build

Run this one command — it installs everything and compiles all 4 MCP servers:

```bash
bash scripts/setup.sh
```

This will take a minute. You'll see npm output scrolling by. That's normal. When it finishes you'll see "Setup complete."

### 3. Point the MCP servers at your machine

The setup script does this automatically. If it didn't work, run these three lines manually (with your `.env` already filled in):

```bash
source .env
sed -i '' "s|PROJECT_ROOT|$PROJECT_ROOT|g" .mcp.json
sed -i '' "s|NODE_BIN|$NODE_BIN|g" .mcp.json
sed -i '' "s|CLAUDE_BIN|$CLAUDE_BIN|g" .mcp.json
```

To confirm it worked, run `claude mcp list` — you should see all four servers listed: `helix-mac`, `helix-memory`, `helix-agents`, `helix-telegram`.

### 4. Give your agent a name

Open `CLAUDE.md` in a text editor. Near the top, find these three placeholders and replace them with whatever you want:

| Find this | Replace with |
|-----------|-------------|
| `{{AGENT_NAME}}` | What you want to call your AI (e.g. "Aria", "Max", "Nova") |
| `{{USER_NAME}}` | Your name |
| `{{NICKNAME}}` | What you want it to call you (e.g. "Boss", "Chief", your first name) |

### 5. Start it up

```bash
claude
```

That's it. Your agent starts, loads all 4 tool servers, and is ready. Try asking it to remember something, check your calendar, or open an app. It can do all of that now.

<details>
<summary><strong>Something not working?</strong></summary>

**"helix-mac not found" or similar** — run `claude mcp list` to see what's loaded. If a server is missing, check that the path in `.mcp.json` points to a real file. Run `ls mcp-servers/helix-mac/dist/` to confirm it was built.

**MCP server crashes on startup** — run it directly to see the error:
```bash
node mcp-servers/helix-mac/dist/index.js
```

**Telegram not responding** — verify your bot token is valid:
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
│   ├── helix-mac/                    # macOS + Chrome control
│   ├── helix-memory/                 # Persistent JSON memory
│   ├── helix-agents/                 # Agent spawning + scheduling
│   └── helix-telegram/               # Telegram relay
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
