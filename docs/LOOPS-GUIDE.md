# Loops Guide

How to build autonomous scheduled Claude agents with Helix.

---

## What Is a Loop?

A loop is a Claude agent that runs on a schedule, does one thing per tick, updates its own state, and exits. No interface. No interaction needed.

You define what it does in a prompt. launchd fires it on a timer. It reads state, acts, updates state, logs, exits. Next tick, same thing.

**Good uses for loops:**
- Content marketing (post comments, draft newsletter issues)
- Monitoring (check email/calendar/GitHub, alert on important stuff)
- Data collection (scrape prices, track metrics)
- Briefings (morning summary, weekly review)
- Administrative work (triage inbox, update trackers)

**Bad uses for loops:**
- Anything that needs real-time judgment
- High-stakes actions (purchases, deletions, sends) — require human approval step
- Tasks where failure is invisible and costly

---

## Anatomy of a Loop

Every loop has three files:

| File | Purpose |
|------|---------|
| `run.sh` | Entry point. Handles locking, logging, timeout. Calls `claude`. |
| `prompt-template.sh` | Builds the prompt. This is where you define the loop's behavior. |
| State file | The loop's working memory. Read and updated every tick. |

Plus a launchd plist to schedule it.

---

## The State File

The state file is what makes loops coherent over time. Without it, every tick starts from scratch and the agent has no memory of what it did.

Structure (customize for your loop):

```markdown
# My Loop State

## Loop State
- Last run: 2026-03-01 09:30 PST
- Last action: Posted comment in r/freelance about scope creep
- Last result: success
- Mode: SOCIAL

## Task Queue
- [ ] Research r/webdev for threads about pricing
- [x] Post comment in r/freelance (done 2026-03-01)

## Cooldowns
- r/freelance: last comment 2026-03-01 09:30 — next eligible 2026-03-01 13:30

## Backlog
- Test posting in r/smallbusiness once karma > 50
```

The loop agent reads this file, figures out what to do, does it, and rewrites the relevant fields. You can add new fields anytime — the agent adapts.

---

## Building Your First Loop

### 1. Copy the template

```bash
cp -r services/template-loop services/my-loop
```

### 2. Edit `prompt-template.sh`

This is the most important file. Define:
- **What the loop does** — be specific. Vague prompts produce vague behavior.
- **Hard limits** — rate limits, daily caps, cooldowns. The agent will push limits if you don't set them.
- **State format** — what fields to update after each action.
- **Escalation path** — what to do when blocked (log to `pending-tasks.json`, never block the tick).

Example structure:

```bash
read -r -d '' LOOP_PROMPT << 'PROMPT_EOF' || true
Today is $NOW. Mode: $TIME_MODE.

You are [description of what this agent does].

CURRENT STATE:
$STATE_CONTENT

YOUR TASK THIS TICK:
1. Read the state above.
2. Pick the HIGHEST PRIORITY unchecked item.
3. Execute ONE action.
4. Update state: last_run, last_action, last_result.

RULES:
- One action per tick.
- [Any hard limits specific to this loop]
- If blocked: log to agents/messages/pending-tasks.json, note in state, exit.
PROMPT_EOF
```

### 3. Initialize state

Create your state file with the initial state. Something to work from:

```bash
cat > agents/messages/my-loop-state.json << 'EOF'
{
  "loop": "my-loop",
  "last_run": null,
  "last_action": "initialized",
  "task_queue": ["do first thing", "do second thing"]
}
EOF
```

Or use a Markdown file if your state is more narrative.

### 4. Test manually

Before scheduling, run the loop manually:

```bash
bash services/my-loop/run.sh
```

Watch the log output. Did it do what you expected? Did it update state correctly?

### 5. Create a launchd plist

Copy `config/com.helix.template-loop.plist`, rename it, and edit:

```xml
<key>Label</key>
<string>com.helix.my-loop</string>

<key>ProgramArguments</key>
<array>
    <string>/bin/bash</string>
    <string>/path/to/helix/services/my-loop/run.sh</string>
</array>

<key>EnvironmentVariables</key>
<dict>
    <key>PROJECT_ROOT</key>
    <string>/path/to/helix</string>
    <key>CLAUDE_BIN</key>
    <string>/path/to/claude</string>
    <key>CLAUDECODE</key>
    <string></string>
</dict>

<key>StartInterval</key>
<integer>1800</integer>  <!-- seconds between ticks -->
```

**Critical:** Set `CLAUDECODE` to empty string. This prevents the child Claude process from inheriting the parent session context, which causes nesting issues.

### 6. Load it

```bash
cp config/com.helix.my-loop.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.helix.my-loop.plist
launchctl list | grep helix
```

---

## Monitoring Loops

**See what a loop did:**
```bash
ls -lt agents/logs/ | head -10
cat agents/logs/2026-03-01_0930_my-loop.md
```

**Ask Claude in-session:**
> "What did my-loop do in the last 3 ticks?"

Claude will read the logs and summarize.

**Check pending blockers:**
```bash
cat agents/messages/pending-tasks.json
```

These are items the loop couldn't handle and flagged for you.

---

## Loop Design Patterns

### Pattern 1: Queue Drain

Loop reads a queue of tasks, does one per tick, marks it done.

```
Queue: [task1, task2, task3]
Tick 1: do task1 → mark done
Tick 2: do task2 → mark done
Tick 3: do task3 → mark done
Tick 4: queue empty → update state, exit
```

Good for: processing a backlog of content, sending a series of emails, publishing a drip sequence.

### Pattern 2: Scout and Act

Loop searches for opportunities, picks the best one, acts.

```
Tick 1: search for relevant threads → pick best → post comment
Tick 2: search for relevant threads → pick best → post comment
...
```

Good for: content marketing, community engagement, monitoring for keywords.

### Pattern 3: Condition Monitor

Loop checks a condition, takes action if triggered, else logs and exits.

```
Tick: check condition
  → if triggered: take action, notify
  → if not triggered: log "no action needed", exit
```

Good for: price alerts, email monitoring, system health checks.

### Pattern 4: Build and Publish

Loop alternates between building (drafting content, researching) and publishing (posting, sending).

```
Time mode: ACTIVE (daytime) → post/publish
Time mode: BUILD (nighttime) → draft/research
```

Good for: content loops where you want to batch-create during off-hours and distribute during peak hours.

---

## Rate Limiting

Always set explicit limits in your prompt. Without them, the agent will do as much as possible.

```
DAILY LIMITS:
- Comments: max 7/day
- Posts: max 1/day

COOLDOWNS:
- Same subreddit: 4 hours between comments
- Track cooldowns in state file

NEVER act if today's count is already at the limit.
```

The agent tracks these in the state file if you ask it to.

---

## Handling Blockers

Some actions require human input. Don't let them block the loop.

The pattern:
1. If action requires human: log to `agents/messages/pending-tasks.json`
2. Note in state: "waiting for human on [item]"
3. Move on to next action or exit

```json
// agents/messages/pending-tasks.json
[
  {
    "id": "task-001",
    "status": "pending",
    "loop": "my-loop",
    "message": "Need approval to post to r/newsubreddit — first post there",
    "created_at": "2026-03-01T09:30:00Z"
  }
]
```

You check `pending-tasks.json` in-session. Claude surfaces it in morning briefings.

---

## Common Pitfalls

**Loop does nothing every tick**
- State file doesn't exist → loop can't read context
- Prompt too vague → agent doesn't know what to prioritize
- All queue items are done → loop runs out of work. Add new items.

**Loop does too much / too fast**
- Missing rate limits in the prompt
- One action per tick rule not enforced
- Add explicit daily caps and cooldown tracking to state

**Duplicate actions**
- Loop not tracking what it already did
- Add "already completed" tracking to state — log IDs or URLs of things done
- Add "NEVER act on something already in the done list" rule to prompt

**Stale state**
- State file hasn't been updated in ticks → something is failing silently
- Check logs: `cat agents/logs/$(ls agents/logs/ | tail -1)`
- Common cause: prompt error, tool failure, timeout

---

## Example

See `examples/content-loop/` — a full production example of a Reddit content loop, anonymized for reuse.
