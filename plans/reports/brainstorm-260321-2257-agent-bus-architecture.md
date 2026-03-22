# Agent Bus Architecture — CLI-Anything + Claw3D Bridge

**Date:** 2026-03-21
**Status:** Plan phase — not implemented
**Scope:** Connect Claude Code sessions to Claw3D visualization without OpenClaw inference costs

---

## Problem

Claude Code sessions (local + VPS) are invisible to Claw3D. OpenClaw Gateway only shows its own agents. No bridge exists to visualize external Claude Code activity in 3D.

## Constraint

- $0 API token cost beyond Claude Max subscription
- OpenClaw stays as passive router (heartbeat=999h)
- No new LLM inference — bridge is data pipe only

## Architecture

```
Claude Code (Max sub, VPS or local)
    │ hooks: PostToolUse, Stop, Notification
    ▼
cli-anything-agent-bus publish (generated CLI)
    │ writes to JSONL activity log + sends to WS hub
    ▼
agent-bus (minimal Node.js WebSocket hub, ~100 LOC)
    │ broadcasts events
    ▼
Claw3D adapter (translates events → Claw3D protocol)
    │ WebSocket to ws://localhost:3000/api/gateway/ws
    ▼
Claw3D renders agent in 3D office
```

## Components

### 1. agent-bus (build first, ~100 LOC)
- WebSocket server on port 4000
- POST /events endpoint for producers
- Broadcasts to all WS consumers
- JSONL file logging for persistence/replay
- No LLM, no inference, just routing

### 2. CLI-Anything generates CLIs
Run CLI-Anything on agent-bus → auto-generates:
- `cli-anything-agent-bus publish --agent X --event Y --json`
- `cli-anything-agent-bus subscribe --json`
- `cli-anything-agent-bus replay --last N --json`
- Skill.md for auto-discovery by any LLM
- Tests (unit + E2E)

### 3. Claude Code hooks (producer)
```json
// .claude/settings.json on VPS
{
  "hooks": {
    "PostToolUse": [{
      "command": "cli-anything-agent-bus publish --agent backend-dev --event tool_use --tool $TOOL_NAME --json"
    }]
  }
}
```

### 4. Claw3D adapter (consumer)
Subscribes to agent-bus, translates to Claw3D WebSocket protocol:
- Connect frame: `{ type: "req", method: "connect", id: "uuid", params: { auth: { token } } }`
- Agent event: `{ type: "event", event: "agent", payload: { runId, stream: "lifecycle", data: { phase: "start"|"end" } } }`
- Chat event: `{ type: "event", event: "chat", payload: { runId, sessionKey, state: "delta"|"final", message } }`

No Claw3D modifications needed — uses standard protocol.

## Phased rollout

| Phase | What | Effort |
|-------|------|--------|
| 1 | Build agent-bus (WS hub + JSONL) | 2h |
| 2 | Run CLI-Anything on agent-bus | 1h |
| 3 | Claude Code hooks → agent-bus | 30min |
| 4 | Claw3D adapter (event translator) | 2h |
| 5 | Test: verify agent appears in 3D office | 1h |

## Event schema (JSONL)

```json
{"ts":1711065600,"agent":"backend-dev","project":"tickets","event":"tool_use","tool":"Edit","file":"auth-controller.ts"}
{"ts":1711065605,"agent":"backend-dev","project":"tickets","event":"task_complete","task":"fix auth bug"}
{"ts":1711065610,"agent":"qa","project":"tickets","event":"session_start"}
```

## Multi-project isolation

Each project gets a subject prefix:
```
agent-bus publish --project brainstorm --agent ceo --event heartbeat
agent-bus publish --project tickets --agent backend --event tool_use
```

Claw3D adapter filters by project → maps to correct gateway/office.

## Dependencies

- CLI-Anything: Claude Code plugin (`/plugin install cli-anything`)
- Node.js (already installed)
- Claw3D (already running as LaunchAgent)
- OpenClaw Gateway (already running, passive mode)

## Unresolved questions

1. Should agent-bus be a separate repo or part of brainstorm?
2. WebSocket MVP vs JSONL-only for phase 1?
3. How to handle VPS → Mac Mini transport (Tailscale? SSH tunnel? Direct WS?)
4. Claw3D adapter: standalone process or integrated into agent-bus?
