#!/usr/bin/env bash
# Claude Code PostToolUse hook — fires event to agent-bus hub
# Fails silently so it never blocks Claude Code
# Env: HUB_URL (default http://localhost:4000), AGENT_BUS_AGENT, AGENT_BUS_PROJECT

HUB_URL="${HUB_URL:-http://localhost:4000}"
AGENT="${AGENT_BUS_AGENT:-$(whoami)}"
PROJECT="${AGENT_BUS_PROJECT:-$(basename "$(pwd)")}"
TOOL="${CLAUDE_TOOL_NAME:-unknown}"
FILE="${CLAUDE_FILE_PATH:-}"

# Build JSON payload
if [ -n "$FILE" ]; then
  PAYLOAD="{\"agent\":\"${AGENT}\",\"project\":\"${PROJECT}\",\"event\":\"tool_use\",\"tool\":\"${TOOL}\",\"file\":\"${FILE}\"}"
else
  PAYLOAD="{\"agent\":\"${AGENT}\",\"project\":\"${PROJECT}\",\"event\":\"tool_use\",\"tool\":\"${TOOL}\"}"
fi

# POST to hub — 1s timeout, fail silently
curl -s -m 1 -X POST "${HUB_URL}/events" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" > /dev/null 2>&1 || true
