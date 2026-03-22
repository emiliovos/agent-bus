#!/usr/bin/env bash
# Claude Code session lifecycle hook — sends session_start or session_end
# Usage: hook-session-event.sh <start|end>
# Env: HUB_URL (default http://localhost:4000), AGENT_BUS_AGENT, AGENT_BUS_PROJECT

HUB_URL="${HUB_URL:-http://localhost:4000}"
AGENT="${AGENT_BUS_AGENT:-$(whoami)}"
PROJECT="${AGENT_BUS_PROJECT:-$(basename "$(pwd)")}"
EVENT="${1:-session_start}"

PAYLOAD="{\"agent\":\"${AGENT}\",\"project\":\"${PROJECT}\",\"event\":\"session_${EVENT}\"}"

curl -s -m 1 -X POST "${HUB_URL}/events" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" > /dev/null 2>&1 || true
