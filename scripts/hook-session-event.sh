#!/usr/bin/env bash
# Claude Code session lifecycle hook — sends session_start or session_end
# Usage: hook-session-event.sh <start|end>
# Env: HUB_URL (default http://localhost:4000), AGENT_BUS_AGENT, AGENT_BUS_PROJECT

HUB_URL="${HUB_URL:-http://localhost:4000}"
AGENT="${AGENT_BUS_AGENT:-$(whoami)}"
PROJECT="${AGENT_BUS_PROJECT:-$(basename "$(pwd)")}"

# Only allow "start" or "end" — prevent arbitrary event injection
case "${1:-start}" in
  start|end) EVENT="session_${1:-start}" ;;
  *) exit 0 ;;
esac

# Escape double quotes in values to prevent JSON injection
escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

PAYLOAD="{\"agent\":\"$(escape "$AGENT")\",\"project\":\"$(escape "$PROJECT")\",\"event\":\"${EVENT}\"}"

# Build curl args — add CF auth headers if configured
CURL_ARGS=(-s -m 1 -X POST "${HUB_URL}/events" -H "Content-Type: application/json")
if [ -n "${CF_CLIENT_ID:-}" ] && [ -n "${CF_CLIENT_SECRET:-}" ]; then
  CURL_ARGS+=(-H "CF-Access-Client-Id: ${CF_CLIENT_ID}" -H "CF-Access-Client-Secret: ${CF_CLIENT_SECRET}")
fi
CURL_ARGS+=(-d "$PAYLOAD")

curl "${CURL_ARGS[@]}" > /dev/null 2>&1 || true
