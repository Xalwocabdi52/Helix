# Helix

**A personal AI OS for macOS, powered by Claude.**

Helix is not a chat app. It's an infrastructure layer that gives Claude a home — persistent memory, system control, a voice, a Telegram relay, and the ability to run autonomous background loops while you sleep.

You fork it, configure it, and own it. Your agent. Your rules.

---

## What It Is

Four MCP servers that plug into Claude Code:

| Server | What it does |
|--------|-------------|
| `nova-mac` | macOS control — apps, Chrome, Calendar, Reminders, Notes, Music, Finder |
| `nova-memory` | Persistent JSON memory with keyword search — survives across sessions |
| `nova-agents` | Spawn background Claude agents, schedule them via launchd, coordinate via messages |
| `nova-telegram` | Remote access — control your agent from your phone via Telegram |

Plus:
- **Voice mode** — local Whisper (STT) + Kokoro (TTS), auto health check and recovery
- **Loop framework** — autonomous scheduled tasks via launchd (content posting, briefings, monitoring)
- **Identity layer** — CLAUDE.md defines who your agent is, what it knows, and how it behaves

---

## What It's Not

- Not a cloud service. Runs entirely on your Mac.
- Not cross-platform. macOS only — uses AppleScript, launchd, and CoreAudio.
- Not a UI. It's infrastructure. You interact through Claude Code in your terminal.

---

## Who It's For

macOS developers and power users who want their AI to **do things** — not just answer questions.

If you've ever wished Claude could remember context between sessions, run tasks while you're away, or pick up the phone when you message it from your couch — this is that.

---

## Architecture

```
You ←→ Claude Code (claude CLI)
           │
           ├── nova-mac     → macOS + Chrome
           ├── nova-memory  → Persistent state
           ├── nova-agents  → Background workers + scheduling
           └── nova-telegram → Telegram relay
                    │
              CLAUDE.md (identity + behavior rules)
              .env (secrets + paths)
```

Loops run on launchd schedules, write logs to `agents/logs/`, and surface blockers via `agents/messages/pending-tasks.json`. Voice sessions and Telegram sessions share state through `nova-memory`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full picture.

---

## Quick Start

```bash
git clone https://github.com/JonJLevesque/Helix.git
cd Helix
cp .env.example .env
# Edit .env — fill in PROJECT_ROOT, CLAUDE_BIN, NODE_BIN
bash scripts/setup.sh
```

Full walkthrough → [SETUP.md](SETUP.md)

---

## Voice Mode

Local Whisper + Kokoro. No cloud. No latency spikes.

Once configured, `claude` greets you by voice at session start, listens for 6 seconds, and stays in voice mode as long as you talk back. Falls back to text silently.

Setup guide → [docs/VOICE-SETUP.md](docs/VOICE-SETUP.md)

---

## Loops

Loops are scheduled Claude agents that run autonomously via launchd. Every tick: read state, execute one action, update state, exit.

A template loop scaffold is in `services/template-loop/`. A real example (anonymized content marketing loop) is in `examples/content-loop/`.

Loop guide → [docs/LOOPS-GUIDE.md](docs/LOOPS-GUIDE.md)

---

## Directory Structure

```
helix/
├── CLAUDE.md              # Agent identity — customize this first
├── .env.example           # All variables documented
├── mcp-servers/
│   ├── nova-mac/          # macOS system control
│   ├── nova-memory/       # Persistent JSON memory
│   ├── nova-agents/       # Agent spawning + scheduling
│   └── nova-telegram/     # Telegram relay
├── services/
│   ├── voice-health-check.sh
│   ├── voice-auto-recover.sh
│   ├── noise-gate/        # Optional noise reduction
│   └── template-loop/     # Scaffold for your own loop
├── agents/
│   ├── schedules/         # launchd-triggered agent scripts
│   └── messages/          # Inter-agent + pending task queue
├── config/
│   ├── safety.json        # Blocked commands + rate limits
│   ├── example-persona.md # Persona template
│   └── com.helix.template-loop.plist  # launchd template
├── examples/
│   └── content-loop/      # Anonymized real-world loop example
├── docs/
│   ├── ARCHITECTURE.md
│   ├── MCP-SERVERS.md
│   ├── VOICE-SETUP.md
│   └── LOOPS-GUIDE.md
└── scripts/
    └── setup.sh           # First-run installer
```

---

## Requirements

- macOS 14+ (Apple Silicon recommended)
- [Claude Code](https://claude.ai/claude-code) installed (`claude` CLI)
- Node.js 20+ (via nvm recommended)
- Python 3.11+ (for voice services)

Optional:
- [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) or compatible STT server — for voice
- [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) TTS server — for voice
- Telegram account — for remote access

---

## License

MIT — fork it, own it, ship it.
