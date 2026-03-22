#!/usr/bin/env bash
# E2E smoke test — validates the full event pipeline
# Starts hub, publishes events, checks JSONL log, tests CLI replay
# Usage: bash scripts/e2e-smoke-test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HUB_PORT=4444
HUB_URL="http://localhost:${HUB_PORT}"
LOG_DIR="$(mktemp -d)"
LOG_FILE="${LOG_DIR}/events.jsonl"
PASS=0
FAIL=0

cleanup() {
  if [ -n "${HUB_PID:-}" ]; then
    kill "$HUB_PID" 2>/dev/null || true
    wait "$HUB_PID" 2>/dev/null || true
  fi
  rm -rf "$LOG_DIR"
}
trap cleanup EXIT

ok() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ✗ $1"; }

echo "=== Agent Bus E2E Smoke Test ==="
echo ""

# 1. Start hub
echo "[1/6] Starting hub on :${HUB_PORT}..."
PORT=$HUB_PORT LOG_DIR="$LOG_DIR" npx tsx "$PROJECT_DIR/src/index.ts" &
HUB_PID=$!
sleep 1

# Check hub is running
if curl -s "${HUB_URL}/health" > /dev/null 2>&1; then
  ok "Hub started"
else
  fail "Hub failed to start"
  exit 1
fi

# 2. Publish session_start
echo "[2/6] Publishing session_start..."
RESP=$(curl -s -X POST "${HUB_URL}/events" \
  -H "Content-Type: application/json" \
  -d '{"agent":"e2e-test","project":"smoke","event":"session_start"}')
if echo "$RESP" | grep -q '"ok":true'; then
  ok "session_start published"
else
  fail "session_start failed: $RESP"
fi

# 3. Publish tool_use
echo "[3/6] Publishing tool_use..."
RESP=$(curl -s -X POST "${HUB_URL}/events" \
  -H "Content-Type: application/json" \
  -d '{"agent":"e2e-test","project":"smoke","event":"tool_use","tool":"Edit","file":"auth.ts"}')
if echo "$RESP" | grep -q '"ok":true'; then
  ok "tool_use published"
else
  fail "tool_use failed: $RESP"
fi

# 4. Publish session_end
echo "[4/6] Publishing session_end..."
RESP=$(curl -s -X POST "${HUB_URL}/events" \
  -H "Content-Type: application/json" \
  -d '{"agent":"e2e-test","project":"smoke","event":"session_end"}')
if echo "$RESP" | grep -q '"ok":true'; then
  ok "session_end published"
else
  fail "session_end failed: $RESP"
fi

# 5. Check JSONL log
echo "[5/6] Checking JSONL log..."
sleep 0.5  # Let writes flush
if [ -f "$LOG_FILE" ]; then
  LINE_COUNT=$(wc -l < "$LOG_FILE" | tr -d ' ')
  if [ "$LINE_COUNT" -eq 3 ]; then
    ok "JSONL has 3 events"
  else
    fail "JSONL has $LINE_COUNT events (expected 3)"
  fi

  # Verify event types
  if grep -q '"session_start"' "$LOG_FILE" && \
     grep -q '"tool_use"' "$LOG_FILE" && \
     grep -q '"session_end"' "$LOG_FILE"; then
    ok "All event types logged"
  else
    fail "Missing event types in log"
  fi
else
  fail "JSONL log not found at $LOG_FILE"
fi

# 6. Check health endpoint
echo "[6/6] Checking health..."
HEALTH=$(curl -s "${HUB_URL}/health")
EVENTS=$(echo "$HEALTH" | grep -o '"events":[0-9]*' | cut -d: -f2)
if [ "$EVENTS" -eq 3 ]; then
  ok "Health reports 3 events"
else
  fail "Health reports $EVENTS events (expected 3)"
fi

# Summary
echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
echo "All checks passed!"
