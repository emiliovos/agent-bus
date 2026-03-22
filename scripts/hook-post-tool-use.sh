#!/usr/bin/env bash
# Claude Code PostToolUse hook — fires event to agent-bus hub
# Fails silently so it never blocks Claude Code
# Env: HUB_URL (default http://localhost:4000), AGENT_BUS_AGENT, AGENT_BUS_PROJECT

HUB_URL="${HUB_URL:-http://localhost:4000}"
AGENT="${AGENT_BUS_AGENT:-$(whoami)}"
PROJECT="${AGENT_BUS_PROJECT:-$(basename "$(pwd)")}"
TOOL="${CLAUDE_TOOL_NAME:-unknown}"
FILE="${CLAUDE_FILE_PATH:-}"

# Escape double quotes in values to prevent JSON injection
escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

PAYLOAD="{\"agent\":\"$(escape "$AGENT")\",\"project\":\"$(escape "$PROJECT")\",\"event\":\"tool_use\",\"tool\":\"$(escape "$TOOL")\"}"

# Append file field only if set
if [ -n "$FILE" ]; then
  PAYLOAD="${PAYLOAD%\}},\"file\":\"$(escape "$FILE")\"}"
fi

# Build curl args — add CF auth headers if configured (for remote access via CF tunnel)
CURL_ARGS=(-s -m 1 -X POST "${HUB_URL}/events" -H "Content-Type: application/json")
if [ -n "${CF_CLIENT_ID:-}" ] && [ -n "${CF_CLIENT_SECRET:-}" ]; then
  CURL_ARGS+=(-H "CF-Access-Client-Id: ${CF_CLIENT_ID}" -H "CF-Access-Client-Secret: ${CF_CLIENT_SECRET}")
fi
CURL_ARGS+=(-d "$PAYLOAD")

# POST to hub — 1s timeout, fail silently
curl "${CURL_ARGS[@]}" > /dev/null 2>&1 || true
