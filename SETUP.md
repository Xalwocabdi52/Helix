# Helix Setup Guide

Zero to a working Claude session with all 4 MCP servers, voice mode, and a running loop.

---

## Prerequisites

- macOS 14+ (Apple Silicon recommended)
- `git`, `node` (v20+), `python3` (3.11+), `npm`
- [Claude Code](https://claude.ai/claude-code) installed — verify with `claude --version`

---

## Step 1 — Clone & Configure

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

---

## Step 2 — Install Dependencies

```bash
bash scripts/setup.sh
```

This installs npm packages across all 4 MCP servers and builds TypeScript.

If you prefer manual:

```bash
for server in mcp-servers/nova-mac mcp-servers/nova-memory mcp-servers/nova-agents mcp-servers/nova-telegram; do
  cd $server && npm install && npm run build && cd ../..
done
```

---

## Step 3 — Configure MCP Servers

Helix includes a `.mcp.json` that registers all 4 servers with Claude Code. Before using it, update the paths:

```bash
# Replace placeholder paths in .mcp.json with your actual paths
sed -i '' "s|PROJECT_ROOT|$PROJECT_ROOT|g" .mcp.json
sed -i '' "s|NODE_BIN|$NODE_BIN|g" .mcp.json
```

Or edit `.mcp.json` manually — it's just JSON.

Then verify Claude can see the servers:

```bash
claude mcp list
```

You should see: `nova-mac`, `nova-memory`, `nova-agents`, `nova-telegram`.

---

## Step 4 — Configure Identity

Open `CLAUDE.md` and replace the placeholders:

| Placeholder | Replace with |
|-------------|-------------|
| `{{AGENT_NAME}}` | Your agent's name (e.g., "Aria", "Max", "NOVA") |
| `{{USER_NAME}}` | Your name |
| `{{NICKNAME}}` | What you want to be called (e.g., "Chief", "Boss", your name) |
| `PROJECT_ROOT` | Your actual project path |

---

## Step 5 — Test the Core Session

```bash
claude
```

You should see all 4 MCP servers load in the tool list. Try:

- `memory_remember` — store something
- `memory_recall` — retrieve it
- `app_list` — list running apps
- `gcal_list` — your Google Calendar (if authorized)

If a server fails to load, check `claude mcp list` and verify the path in `.mcp.json`.

---

## Step 6 — Voice Mode (Optional)

Voice requires a local Whisper server and Kokoro TTS server. See [docs/VOICE-SETUP.md](docs/VOICE-SETUP.md) for full instructions.

Once running, test:

```bash
bash services/voice-health-check.sh
```

All three services should show ✓. Then start Claude — it will greet you by voice.

---

## Step 7 — Set Up a Scheduled Loop (Optional)

The template loop in `services/template-loop/` is a scaffold for any recurring autonomous task.

See [docs/LOOPS-GUIDE.md](docs/LOOPS-GUIDE.md) for how to configure and load it into launchd.

A real-world anonymized example is in `examples/content-loop/`.

---

## Step 8 — Telegram Remote Access (Optional)

1. Create a bot via [@BotFather](https://t.me/BotFather) — save the token
2. Get your user ID via [@userinfobot](https://t.me/userinfobot)
3. Add both to `.env`:
   ```
   TELEGRAM_BOT_TOKEN=your-token
   TELEGRAM_ALLOWED_USER_IDS=your-id
   ```
4. The `nova-telegram` MCP server starts the bot when Claude starts
5. Message your bot — it relays commands to Claude

---

## Troubleshooting

**MCP server not loading:**
- Check `claude mcp list` for error messages
- Verify NODE_BIN in `.mcp.json` points to a real node binary
- Run `node mcp-servers/nova-mac/dist/index.js` manually to see startup errors

**Voice not working:**
- Run `bash services/voice-health-check.sh` — read the output
- `bash services/voice-auto-recover.sh` to attempt auto-fix
- Full guide: [docs/VOICE-SETUP.md](docs/VOICE-SETUP.md)

**Telegram not responding:**
- Confirm bot token is valid: `curl https://api.telegram.org/bot<TOKEN>/getMe`
- Confirm your user ID is in `TELEGRAM_ALLOWED_USER_IDS`
- Check Claude session is active (bot relays to running Claude session)
