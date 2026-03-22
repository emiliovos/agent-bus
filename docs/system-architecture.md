# System Architecture

**Date:** 2026-03-21

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────────┐
│  Producers (any machine)                                 │
│                                                          │
│  Claude Code ──→ PostToolUse hook ──→ curl POST :4000   │
│  Gemini CLI  ──→ hook/script ───────→ curl POST :4000   │
│  Cron job    ──→ script ────────────→ curl POST :4000   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP POST /events
                       ▼
┌──────────────────────────────────────────────────────────┐
│  Agent Bus Hub (localhost:4000)                           │
│                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ HTTP server  │  │ WS broadcast │  │ JSONL logger   │  │
│  │ POST /events │→│ fan-out to   │  │ append to      │  │
│  │              │  │ all clients  │  │ events.jsonl   │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
└──────────────────────┬──────────────────────────────────┘
                       │ WebSocket events
                       ▼
┌──────────────────────────────────────────────────────────┐
│  Consumers                                                │
│                                                           │
│  Claw3D Adapter ──→ ws://localhost:3000/api/gateway/ws   │
│  Dashboard      ──→ custom UI                            │
│  CLI subscriber ──→ cli-anything-agent-bus subscribe      │
└──────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Hub (`src/hub/`)

WebSocket + HTTP server. ~100 LOC.

- **POST /events**: Accepts JSON event, validates schema, broadcasts + logs
- **WebSocket :4000**: Consumers connect, receive all events in real-time
- **JSONL logger**: Appends every event to `data/events.jsonl`

### 2. Claw3D Adapter (`src/adapter/`)

Translates agent-bus events into Claw3D WebSocket protocol.

- Connects to `ws://localhost:3000/api/gateway/ws`
- Sends connect frame with OpenClaw gateway token
- Maps agent-bus events to Claw3D frames:
  - `session_start` → agent lifecycle `phase: "start"`
  - `tool_use` → agent runtime `stream: "assistant"` delta
  - `session_end` → agent lifecycle `phase: "end"`

### 3. Types (`src/types/`)

Shared TypeScript interfaces for events.

```typescript
interface AgentEvent {
  ts: number;           // Unix timestamp ms
  agent: string;        // Agent identifier
  project: string;      // Project namespace
  event: string;        // Event type: tool_use, session_start, session_end, task_complete
  tool?: string;        // Tool name (for tool_use events)
  file?: string;        // File path (for file operations)
  message?: string;     // Human-readable description
}
```

---

## Event Flow

```
1. Claude Code runs Edit tool on auth.ts
2. PostToolUse hook fires:
   curl POST :4000/events -d '{"agent":"dev","project":"tickets","event":"tool_use","tool":"Edit","file":"auth.ts"}'
3. Hub receives POST:
   a. Validates JSON schema
   b. Adds timestamp if missing
   c. Appends to data/events.jsonl
   d. Broadcasts to all WS consumers
4. Claw3D adapter (WS consumer) receives event:
   a. Maps to Claw3D frame: { type: "event", event: "agent", payload: { ... } }
   b. Sends frame to ws://localhost:3000/api/gateway/ws
5. Claw3D renders: "dev" agent animates at desk, working state
```

---

## Claw3D Protocol Reference

### Connect (required first frame)

```json
{
  "type": "req",
  "method": "connect",
  "id": "unique-uuid",
  "params": {
    "minProtocol": 1,
    "maxProtocol": 1,
    "client": "agent-bus-adapter",
    "auth": { "token": "<openclaw-gateway-token>" }
  }
}
```

### Agent Lifecycle Event

```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "run-uuid",
    "sessionKey": "agent:<id>:main",
    "stream": "lifecycle",
    "data": { "phase": "start" }
  }
}
```

### Agent Chat/Activity Event

```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "runId": "run-uuid",
    "sessionKey": "agent:<id>:main",
    "state": "delta",
    "message": "Editing auth.ts — fixing login validation"
  }
}
```

---

## Network Topology

```
Mac Mini (192.168.101.86)
├── Agent Bus Hub         :4000
├── Claw3D Studio         :3000
├── OpenClaw Gateway      :18789
└── Claw3D Adapter        (connects to :3000 internally)

VPS (remote)
└── Claude Code hooks → POST http://<mac-mini-tailscale>:4000/events

Windows PC (192.168.101.152)
└── Claude Code hooks → POST http://192.168.101.86:4000/events
```

---

## Data Persistence

### JSONL Log (`data/events.jsonl`)

One JSON object per line. Append-only.

```jsonl
{"ts":1711065600000,"agent":"dev","project":"tickets","event":"session_start"}
{"ts":1711065601000,"agent":"dev","project":"tickets","event":"tool_use","tool":"Read","file":"package.json"}
{"ts":1711065605000,"agent":"dev","project":"tickets","event":"tool_use","tool":"Edit","file":"auth.ts"}
{"ts":1711065700000,"agent":"dev","project":"tickets","event":"session_end"}
```

Replay: `cat data/events.jsonl | cli-anything-agent-bus replay --speed 2x`
