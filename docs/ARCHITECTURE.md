# Helix Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        You (the user)                       │
└───────────────┬─────────────────────────────────────────────┘
                │ terminal / voice / Telegram
                ▼
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code (claude CLI)                  │
│                                                             │
│  Context: CLAUDE.md (identity, behavior, rules)             │
│  Tools: 4 MCP servers + built-in Task/Bash/Read/etc.        │
└────────┬──────────┬──────────┬──────────┬───────────────────┘
         │          │          │          │
    nova-mac   nova-memory  nova-agents  nova-telegram
         │          │          │          │
    macOS +    JSON store   launchd +   Telegram bot
    Chrome                  spawning
```

---

## The Four MCP Servers

### nova-mac — macOS System Control

Exposes macOS capabilities to Claude via AppleScript and CDP:

- **App control:** open, quit, focus apps
- **Chrome:** open tabs, navigate, read page content, inject JS, CDP
- **Calendar:** list events, create events (Google Calendar via AppleScript)
- **Reminders:** read, create, complete reminders
- **Notes:** create notes in iCloud Notes folders
- **Music:** play/pause, set playlist
- **Finder:** open files and folders
- **System info:** CPU, memory, disk, uptime

**When to use:** Any task that touches the OS or browser.

---

### nova-memory — Persistent JSON Memory

A lightweight JSON-based memory store that survives across Claude sessions:

```
memory/
├── memories.json      # Main store — keyword-searchable
├── preferences.json   # User preferences
└── chief_profile.json # User profile
```

Key operations:
- `memory_remember(content, category, tags, metadata)` — store
- `memory_recall(query, category, limit)` — keyword search
- `memory_forget(id)` — delete by ID
- `memory_list(category)` — list by category

**Cross-session bridge:** All Claude sessions (voice, text, Telegram) read and write the same `memories.json`. This is how context persists.

**When to use:** Any time you want Claude to remember something beyond the current session.

---

### nova-agents — Background Agent Orchestration

Spawns and manages background Claude processes:

```
agents/
├── schedules/     # launchd-triggered scripts
├── messages/      # Inter-agent communication + pending tasks
└── logs/          # Per-tick output from all loops
```

Key operations:
- `agent_spawn(prompt, name, tools)` — start a background Claude process
- `agent_list()` — see running agents + status
- `agent_logs(name, lines)` — tail agent output
- `agent_message(to, content)` — send a message to another agent
- `agent_schedule_create(name, prompt, schedule)` — create a launchd job
- `agent_schedule_list()` — see all scheduled jobs
- `agent_schedule_delete(name)` — remove a scheduled job

**When to use:** Tasks that should run in the background, on a timer, or need to be delegated.

---

### nova-telegram — Remote Access

A grammY-based Telegram bot that relays commands to Claude:

- Runs as a persistent bot in the background
- Commands: `/start`, `/status`, `/task`, `/tasks`, `/handoff`, `/catchup`
- Session continuity: resumes previous Claude session via `--resume`
- Background tasks: runs tasks asynchronously, sends result when done
- Allowlist: only responds to configured user IDs

**Cross-session handoffs:**
- `/handoff` → stores session context in nova-memory
- `/catchup` → retrieves latest handoff from nova-memory
- Works from any channel (voice, text, Telegram)

**When to use:** Remote access when away from the Mac.

---

## Loop Architecture

Loops are the autonomous side of Helix — scheduled Claude agents that run without interaction.

```
launchd
  ↓ (StartInterval)
run.sh
  ↓ sources
prompt-template.sh → builds $LOOP_PROMPT
  ↓
claude --print --dangerously-skip-permissions "$LOOP_PROMPT"
  ↓
Claude executes via MCP tools
  ↓
Updates state file + logs
  ↓
Exits
```

**Key design principles:**
- **One action per tick** — prevents runaway spending and keeps logs readable
- **Lockfile** — prevents overlapping ticks if a tick runs long
- **Timeout watchdog** — hard cap on max runtime per tick
- **State file** — the loop's working memory, read and written every tick
- **Pending tasks** — blockers that require human input go to `agents/messages/pending-tasks.json`

---

## Voice Architecture

```
USB Mic
  ↓
Whisper (STT) server — port 2022
  ↓ transcript
Claude (voicemode MCP)
  ↓ response text
Kokoro (TTS) server — port 8880
  ↓
Audio output (speakers)
```

**Health monitoring:**
- `services/voice-health-check.sh` — checks all three services
- `services/voice-auto-recover.sh` — restarts failed services
- Boot sequence runs at every session start

---

## Data Flow

```
User input
  ↓
CLAUDE.md shapes behavior
  ↓
Claude reasons + picks tools
  ↓
MCP tools execute
  ↓
Results back to Claude
  ↓
Response to user
  + memory written (if significant)
  + state updated (if in a loop)
```

---

## File Layout

```
helix/
├── CLAUDE.md              # Identity + behavior rules
├── .env                   # Secrets + paths (gitignored)
├── mcp-servers/           # The four MCP servers (TypeScript)
├── services/              # Voice + loop scripts
├── agents/
│   ├── schedules/         # launchd scripts (one per job)
│   ├── messages/          # Inter-agent + pending tasks
│   └── logs/              # Per-tick agent output
├── config/
│   ├── safety.json        # Blocked commands + rate limits
│   ├── example-persona.md # Persona template
│   └── *.plist            # launchd job definitions
├── examples/              # Real-world loop examples
├── docs/                  # This directory
├── memory/                # Runtime memory (gitignored)
└── scripts/               # First-run + maintenance scripts
```
