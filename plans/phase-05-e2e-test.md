# Phase 5 — End-to-End Test

**Priority:** P0
**Status:** Complete
**Effort:** ~1h
**Depends on:** Phases 1-4

## Overview

Full integration test: Claude Code hook fires → event hub → Claw3D adapter → agent appears in 3D office.

## Prerequisites

- Agent bus hub running (:4000)
- Claw3D running (:3000, LaunchAgent)
- OpenClaw Gateway running (:18789, passive)
- Adapter running (connects hub → Claw3D)

## Test Script

1. **Start all services**
   ```bash
   npm run dev          # hub on :4000
   npm run adapter      # adapter connects hub → Claw3D
   ```

2. **Simulate session start**
   ```bash
   curl -X POST http://localhost:4000/events \
     -H "Content-Type: application/json" \
     -d '{"agent":"backend-dev","project":"tickets","event":"session_start"}'
   ```

3. **Verify in Claw3D**: agent "backend-dev" appears in office

4. **Simulate tool use**
   ```bash
   curl -X POST http://localhost:4000/events \
     -d '{"agent":"backend-dev","project":"tickets","event":"tool_use","tool":"Edit","file":"auth.ts"}'
   ```

5. **Verify in Claw3D**: agent shows "working" state

6. **Simulate session end**
   ```bash
   curl -X POST http://localhost:4000/events \
     -d '{"agent":"backend-dev","project":"tickets","event":"session_end"}'
   ```

7. **Verify in Claw3D**: agent returns to idle

8. **Check JSONL log**
   ```bash
   cat data/events.jsonl
   # Should have 3 lines
   ```

9. **Test replay**
   ```bash
   cli-anything-agent-bus replay --last 3 --json
   ```

## Success Criteria

- [x] Full flow: curl → hub → adapter → Claw3D → agent visible in 3D
- [x] JSONL has all 3 events logged
- [x] Replay works
- [x] No errors in any service logs
- [x] Agent lifecycle (appear → work → idle) renders correctly

## Deliverables

- [x] scripts/e2e-smoke-test.sh — starts hub, publishes 3 events, checks JSONL, checks health
- [x] 7/7 E2E checks pass
- [x] npm run test:e2e script added
