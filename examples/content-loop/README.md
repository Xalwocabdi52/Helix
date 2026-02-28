# Example: Content Loop

An anonymized real-world example of an autonomous content marketing loop built on Helix.

## What It Does

This loop runs every 30 minutes and:
- Posts helpful, genuine comments on Reddit as a persona representing your business
- Tracks karma and engagement metrics
- Respects daily rate limits and subreddit cooldowns
- Switches between SOCIAL mode (posting 8am–10pm) and BUILD mode (research, drafting)
- Optionally tracks Gumroad revenue and publishes Beehiiv newsletter drafts

This is the pattern used in production. Anonymized for reuse.

---

## Files

| File | Purpose |
|------|---------|
| `prompt-template.sh` | Loop prompt — reads state, defines rules, runs the agent |
| `persona.md` | The voice and persona your Reddit account uses — create this yourself |
| `state.md` | Current state: queue, karma, last actions, backlog |
| `run.sh` | Entry point (symlink to or copy `services/template-loop/run.sh`) |
| `README.md` | This file |

---

## Setup

### 1. Configure `.env`

```bash
REDDIT_USERNAME=your_reddit_username
REDDIT_PASSWORD=your_reddit_password
BUSINESS_URL=https://yourbusiness.com
GUMROAD_PRODUCT_URL=https://yourstore.gumroad.com/l/your-product
NEWSLETTER_URL=https://yournewsletter.beehiiv.com/subscribe

# Optional — remove if not using
GUMROAD_ACCESS_TOKEN=your_token
BEEHIIV_API_KEY=your_key
BEEHIIV_PUB_ID=your_pub_id
```

### 2. Write your persona

Create `examples/content-loop/persona.md`. This is the character your Reddit account plays. It should include:
- Name and backstory (real enough to be credible, generic enough to protect privacy)
- Expertise and experience
- Voice and tone guidelines
- Topics to engage with
- Topics to avoid

See `config/example-persona.md` for a template.

### 3. Initialize state

Create `examples/content-loop/state.md`:

```markdown
# Content Loop State

## Loop State
- Last run: [never]
- Last action: [none]
- Last result: [none]
- Mode: SOCIAL
- Comments today: 0 (resets midnight PST)
- Posts today: 0 (resets midnight PST)
- Karma: [check manually]

## Active Queue
- [ ] Find 3 active threads in r/[your-niche] about [your-topic]
- [ ] Draft comment for r/[your-niche] thread: [topic]

## Subreddit Cooldowns
(none yet)

## Self-Extension Ideas
- Expand to r/[new-subreddit] once karma > 50
```

### 4. Load the loop

Copy the template plist and customize:

```bash
cp config/com.helix.template-loop.plist ~/Library/LaunchAgents/com.helix.content-loop.plist
```

Edit the plist — change `template-loop` to `content-loop`, update paths, set `StartInterval` to `1800` (30 minutes).

```bash
launchctl load ~/Library/LaunchAgents/com.helix.content-loop.plist
launchctl list | grep helix
```

---

## How It Runs

Each tick:
1. launchd fires `run.sh`
2. `run.sh` sources `prompt-template.sh` → builds `$LOOP_PROMPT`
3. Calls `claude --print --dangerously-skip-permissions "$LOOP_PROMPT"`
4. Claude reads state, picks one action, executes it via MCP tools, updates state
5. Writes log to `agents/logs/`, exits

You check in on it via logs or by asking Claude in-session: "what did the content loop do last tick?"

---

## Tips from Production

- **Karma is the bottleneck early on.** Focus on 2-3 subreddits where you can add genuine value. Comments on rising posts (sorted by NEW) compound fastest.
- **One action per tick.** The agent gets distracted if you ask it to do too much. Strict single-action rule prevents this.
- **State file is sacred.** The loop reads it every tick to understand what's been done. Keep it clean and up to date.
- **4-hour subreddit cooldown is real.** Reddit will shadowban fast if you comment in the same sub repeatedly. The cooldown tracking in state.md prevents this.
- **BUILD mode is underrated.** Night ticks where it can't post? Perfect time to draft 3 comments for the queue, research new subreddits, or write a newsletter draft.
