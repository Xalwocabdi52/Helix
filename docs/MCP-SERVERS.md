# MCP Servers Reference

Complete tool reference for all four Helix MCP servers.

---

## helix-mac — macOS System Control

### App Control

| Tool | Description |
|------|-------------|
| `app_open(name)` | Open an application by name |
| `app_quit(name)` | Quit an application |
| `app_list()` | List all running applications |
| `app_focus(name)` | Bring app to foreground |

### System Info

| Tool | Description |
|------|-------------|
| `system_info()` | CPU, memory, disk, uptime |
| `screen_time_today()` | App usage for today |
| `clipboard_get()` | Read clipboard content |
| `clipboard_set(text)` | Write to clipboard |
| `notification_send(title, message)` | macOS notification |

### Chrome (CDP)

| Tool | Description |
|------|-------------|
| `chrome_tabs_list()` | List all open tabs |
| `chrome_tab_open(url)` | Open a new tab |
| `chrome_tab_close(id)` | Close a tab by ID |
| `chrome_navigate(url, tab_id)` | Navigate a tab to URL |
| `chrome_read_page(tab_id)` | Get full page text content |
| `chrome_execute_js(script, tab_id)` | Execute JavaScript in tab |
| `chrome_screenshot(tab_id)` | Capture tab screenshot |
| `chrome_find_element(selector, tab_id)` | Find DOM element |
| `chrome_click(selector, tab_id)` | Click an element |
| `chrome_type(selector, text, tab_id)` | Type text into element |
| `chrome_get_active_tab()` | Get currently active tab |
| `chrome_set_active_tab(id)` | Set active tab |

### Apple Apps

| Tool | Description |
|------|-------------|
| `gcal_list(days_ahead)` | List upcoming calendar events |
| `gcal_create(title, date, time, duration, notes)` | Create calendar event |
| `gmail_unread(max)` | Get unread email summary |
| `reminders_list(list_name)` | List reminders |
| `reminders_create(title, notes, due_date)` | Create a reminder |
| `reminders_complete(id)` | Mark reminder complete |
| `notes_create(folder, title, body)` | Create a note |
| `notes_list(folder)` | List notes in folder |
| `music_play(query)` | Play music by query |
| `music_pause()` | Pause music |
| `music_next()` | Skip to next track |
| `finder_open(path)` | Open path in Finder |

---

## helix-memory — Persistent Memory

### Core Operations

| Tool | Description |
|------|-------------|
| `memory_remember(content, category, tags, metadata)` | Store a memory |
| `memory_recall(query, category, limit)` | Search memories by keyword |
| `memory_forget(id)` | Delete a memory by ID |
| `memory_list(category, limit)` | List memories by category |
| `memory_get(id)` | Get a specific memory by ID |

### Categories (conventional, not enforced)

| Category | Use for |
|----------|---------|
| `conversation` | Session summaries, handoffs |
| `briefing` | Morning briefs, evening syncs, weekly reviews |
| `preference` | User preferences learned over time |
| `agent` | Agent outputs and results |
| `health` | System health check records |
| `loop` | Loop state and results |

### Storage

All memories are stored in `memory/memories.json` — a flat JSON array, keyword-searchable. No vector database, no server dependencies.

---

## helix-agents — Agent Orchestration

### Spawning

| Tool | Description |
|------|-------------|
| `agent_spawn(prompt, name, tools, tier)` | Start a background Claude agent |
| `agent_list()` | List all agents + status (running/done/failed) |
| `agent_stop(id)` | Send SIGTERM to a running agent |
| `agent_logs(name, lines)` | Tail output from a named agent |
| `agent_output(id)` | Get full output of a completed agent |

### Scheduling

| Tool | Description |
|------|-------------|
| `agent_schedule_create(name, prompt, schedule)` | Create a launchd recurring job |
| `agent_schedule_list()` | List all scheduled jobs |
| `agent_schedule_delete(name)` | Remove a scheduled job |
| `agent_schedule_trigger(name)` | Run a scheduled job immediately |

### Messaging

| Tool | Description |
|------|-------------|
| `agent_message(to, content, metadata)` | Send a message to another agent |
| `agent_messages_list(agent_name)` | List messages for an agent |

### Shell

| Tool | Description |
|------|-------------|
| `run_shell(command, args, env)` | Run a shell command (safety-filtered) |

**Safety filtering:** Commands are checked against `config/safety.json`. Blocked patterns (rm -rf /, sudo, etc.) are rejected.

---

## helix-telegram — Remote Access

### Bot Behavior

The bot starts automatically when Claude starts. It listens for messages and relays them to the active Claude session.

### Commands

| Command | Description |
|---------|-------------|
| `/start` | Initialize or reset the session |
| `/help` | Show available commands |
| `/status` | Show session status and recent activity |
| `/new` | Start a fresh Claude session |
| `/task <description>` | Run a task in the background, get result when done |
| `/tasks` | List background tasks and their status |
| `/handoff` | Save current session context to memory |
| `/catchup` | Recall the most recent handoff |

### Regular Messages

Any non-command message is forwarded to Claude as a regular prompt. Claude responds in Telegram.

### Configuration

```bash
# .env
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_ALLOWED_USER_IDS=123456789,987654321  # comma-separated
```

Only user IDs in the allowlist can interact with the bot.

### Session Continuity

The bot tracks session IDs and uses `claude --resume <session-id>` to maintain context across messages. You don't start fresh on every message.

---

## Cross-Server Patterns

### Pattern: Background agent with result notification

```
1. agent_spawn("analyze this codebase and find security issues", "security-audit")
2. [... continue other work ...]
3. agent_list()  → check when it's done
4. agent_output("security-audit")  → read results
5. memory_remember(results, category="agent")  → store for later
```

### Pattern: Persistent memory bridge between sessions

```
Session A (voice):
  memory_remember("Working on auth refactor. Need to convert session tokens to JWTs.", category="conversation", tags=["handoff"])

Session B (next day, text):
  memory_recall("auth refactor")  → picks up context
```

### Pattern: Loop + pending tasks

```
Loop tick:
  → can't do X without human input
  → write to agents/messages/pending-tasks.json
  → continue with next action

Morning briefing:
  → reads pending-tasks.json
  → surfaces in daily note
  → human addresses it in-session
```
