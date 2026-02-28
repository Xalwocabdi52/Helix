# Template Loop

A scaffold for building autonomous scheduled Claude agents.

## What a Loop Is

A loop is a Claude agent that runs on a timer (via launchd), executes one focused task per tick, updates its own state, and exits. No UI, no interaction required.

Each tick:
1. Read state file (`agents/messages/loop-state.json`)
2. Pick the highest-priority action
3. Execute it
4. Update state
5. Exit cleanly

The loop agent has access to all Helix MCP tools — system control, memory, browser, file system.

---

## Files

| File | Purpose |
|------|---------|
| `run.sh` | Entry point — called by launchd. Handles locking, logging, timeout. |
| `prompt-template.sh` | Builds `$LOOP_PROMPT`. **Customize this** to define what your loop does. |
| `README.md` | This file |

---

## Customizing

### 1. Define your loop's job in `prompt-template.sh`

Open `prompt-template.sh` and edit the `LOOP_PROMPT` section. Be specific about:
- What state to read (roadmap, queue, API data, etc.)
- What the loop's options are each tick
- Hard limits (rate limits, cooldowns, daily caps)
- How to update state after each action

### 2. Initialize state

Create an initial `agents/messages/loop-state.json`:

```json
{
  "loop": "my-loop",
  "last_run": null,
  "last_action": null,
  "last_result": null,
  "task_queue": []
}
```

### 3. Load into launchd

Copy `config/com.helix.template-loop.plist` and customize:
- Change `com.helix.template-loop` to your loop name
- Set `StartInterval` (seconds between ticks — 1800 = 30 min)
- Update paths to your `run.sh`

Load it:
```bash
cp config/com.helix.template-loop.plist ~/Library/LaunchAgents/com.helix.my-loop.plist
launchctl load ~/Library/LaunchAgents/com.helix.my-loop.plist
```

Verify it's loaded:
```bash
launchctl list | grep helix
```

---

## Real-World Example

See `examples/content-loop/` — an anonymized version of a real content marketing loop that posts to Reddit on a schedule.

Full guide → [docs/LOOPS-GUIDE.md](../../docs/LOOPS-GUIDE.md)
