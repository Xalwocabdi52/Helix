#!/bin/bash
# Helix Setup Script
# Installs dependencies and builds all MCP servers.
# Run once after cloning: bash scripts/setup.sh

set -euo pipefail

HELIX_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "=== Helix Setup ==="
echo "Root: $HELIX_ROOT"
echo ""

# ── Load .env ────────────────────────────────────────────────────────────────
if [ ! -f "$HELIX_ROOT/.env" ]; then
  echo "ERROR: .env not found."
  echo "  cp $HELIX_ROOT/.env.example $HELIX_ROOT/.env"
  echo "  Then edit .env with your actual paths and values."
  exit 1
fi

set -a; source "$HELIX_ROOT/.env"; set +a

# ── Verify prerequisites ─────────────────────────────────────────────────────
echo "Checking prerequisites..."

check_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "  ✓ $1"
  else
    echo "  ✗ $1 not found"
    MISSING=true
  fi
}

check_cmd node
check_cmd npm
check_cmd python3
check_cmd git

CLAUDE_CHECK="${CLAUDE_BIN:-claude}"
if [ -f "$CLAUDE_CHECK" ] || command -v "$CLAUDE_CHECK" >/dev/null 2>&1; then
  echo "  ✓ claude"
else
  echo "  ✗ claude not found at $CLAUDE_CHECK"
  echo "    Install Claude Code: https://claude.ai/claude-code"
  MISSING=true
fi

if [ "${MISSING:-false}" = true ]; then
  echo ""
  echo "Please install missing prerequisites before continuing."
  exit 1
fi

echo ""

# ── Build MCP servers ─────────────────────────────────────────────────────────
echo "Building MCP servers..."

for server in nova-mac nova-memory nova-agents nova-telegram; do
  SERVER_DIR="$HELIX_ROOT/mcp-servers/$server"
  if [ -d "$SERVER_DIR" ]; then
    echo "  Building $server..."
    cd "$SERVER_DIR"
    npm install --silent
    npm run build --silent
    echo "  ✓ $server"
  else
    echo "  ✗ $server directory not found at $SERVER_DIR"
  fi
done

cd "$HELIX_ROOT"
echo ""

# ── Create runtime directories ───────────────────────────────────────────────
echo "Creating runtime directories..."
mkdir -p "$HELIX_ROOT/memory"
mkdir -p "$HELIX_ROOT/agents/logs"
mkdir -p "$HELIX_ROOT/agents/messages"
echo "  ✓ memory/, agents/logs/, agents/messages/"
echo ""

# ── Initialize memory files ──────────────────────────────────────────────────
if [ ! -f "$HELIX_ROOT/memory/memories.json" ]; then
  echo "[]" > "$HELIX_ROOT/memory/memories.json"
  echo "  ✓ Initialized memory/memories.json"
fi

if [ ! -f "$HELIX_ROOT/agents/messages/pending-tasks.json" ]; then
  echo "[]" > "$HELIX_ROOT/agents/messages/pending-tasks.json"
  echo "  ✓ Initialized agents/messages/pending-tasks.json"
fi

# ── Configure .mcp.json ──────────────────────────────────────────────────────
echo "Configuring .mcp.json..."
NODE_BIN_PATH="${NODE_BIN:-$(which node)}"
CLAUDE_BIN_PATH="${CLAUDE_BIN:-$(which claude)}"

# Replace placeholders in .mcp.json
sed -i '' "s|PROJECT_ROOT|$HELIX_ROOT|g" "$HELIX_ROOT/.mcp.json"
sed -i '' "s|NODE_BIN|$NODE_BIN_PATH|g" "$HELIX_ROOT/.mcp.json"
sed -i '' "s|CLAUDE_BIN|$CLAUDE_BIN_PATH|g" "$HELIX_ROOT/.mcp.json"
echo "  ✓ .mcp.json configured"
echo ""

# ── Verify MCP servers with claude ──────────────────────────────────────────
echo "Verifying MCP server registration..."
MCP_LIST=$(claude mcp list 2>&1 || true)
for server in nova-mac nova-memory nova-agents nova-telegram; do
  if echo "$MCP_LIST" | grep -q "$server"; then
    echo "  ✓ $server"
  else
    echo "  ? $server (not yet verified — start claude to confirm)"
  fi
done
echo ""

# ── Make scripts executable ──────────────────────────────────────────────────
chmod +x "$HELIX_ROOT/services/"*.sh 2>/dev/null || true
chmod +x "$HELIX_ROOT/services/template-loop/"*.sh 2>/dev/null || true
chmod +x "$HELIX_ROOT/services/noise-gate/"*.sh 2>/dev/null || true
chmod +x "$HELIX_ROOT/agents/schedules/"*.sh 2>/dev/null || true
chmod +x "$HELIX_ROOT/examples/content-loop/"*.sh 2>/dev/null || true
echo "  ✓ Shell scripts made executable"
echo ""

# ── Done ─────────────────────────────────────────────────────────────────────
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit CLAUDE.md — replace {{AGENT_NAME}}, {{USER_NAME}}, {{NICKNAME}} placeholders"
echo "  2. Run: claude"
echo "  3. Verify all 4 MCP servers appear in the tools list"
echo ""
echo "Voice setup (optional): docs/VOICE-SETUP.md"
echo "Loop setup (optional): docs/LOOPS-GUIDE.md"
