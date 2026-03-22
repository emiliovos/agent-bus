# Phase 5 — End-to-End Test

**Priority:** P0
**Status:** Not started
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

- [ ] Full flow: curl → hub → adapter → Claw3D → agent visible in 3D
- [ ] JSONL has all 3 events logged
- [ ] Replay works
- [ ] No errors in any service logs
- [ ] Agent lifecycle (appear → work → idle) renders correctly

## Todo

- [ ] Write smoke test script (`scripts/e2e-smoke.sh`)
- [ ] Run full flow manually
- [ ] Document any protocol mismatches found
- [ ] Screenshot/record Claw3D showing the agent
