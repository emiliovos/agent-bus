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

### 1. Hub (`src/hub/event-hub.ts`) — PHASE 1 COMPLETE

HTTP + WebSocket event hub. 163 LOC.

**Responsibilities:**
- **POST /events**: Accepts JSON event, validates schema (required: agent, project, event), validates field lengths (max 1024 chars), broadcasts + logs
- **GET /health**: Returns hub statistics (clients, event count)
- **WebSocket :4000**: Consumers connect, receive all events in real-time (fan-out broadcast)
- **JSONL logger**: Appends every event to `data/events.jsonl` with WriteStream for atomic writes
- **Input protection**: Max body size 1 MB, field length validation, graceful error handling
- **Graceful shutdown**: 5-second timeout to close connections cleanly on SIGINT/SIGTERM

**Event processing flow:**
1. Parse + validate JSON schema
2. Check field lengths
3. Stamp timestamp if missing
4. Broadcast to all WebSocket clients
5. Append to JSONL log

### 2. Types (`src/types/agent-event.ts`) — PHASE 1 COMPLETE

Shared TypeScript interfaces and validation.

```typescript
type EventType = 'session_start' | 'session_end' | 'tool_use' | 'task_complete' | 'heartbeat'

interface AgentEvent {
  ts: number;           // Unix timestamp ms (added by hub if missing)
  agent: string;        // Agent identifier (required, max 1024 chars)
  project: string;      // Project namespace (required, max 1024 chars)
  event: EventType;     // Event type (required, validated against set)
  tool?: string;        // Tool name (optional, for tool_use events)
  file?: string;        // File path (optional, for file operations)
  message?: string;     // Human-readable description (optional)
}

function isValidEvent(data: unknown): data is AgentEvent
```

### 3. Claw3D Integration (`claw3d/`) — EMBEDDED

Claw3D visualization engine now embedded in project directory.

**Structure:**
- `claw3d/server/index.js` — Node.js WebSocket gateway, renders agents
- `claw3d/src/app/api/gateway/` — OpenClaw protocol endpoints
- `claw3d/public/office-assets/` — 3D models, textures for office environment

**Phase 2 will add:** Claw3D Adapter (`src/adapter/`) to translate agent-bus events to Claw3D WebSocket protocol.

Current Claw3D listens on `ws://localhost:3000/api/gateway/ws` for OpenClaw frames.

---

## Event Flow (Phase 1 — Hub Complete)

```
1. Producer publishes event (Claude Code hook, cron, dashboard)
   curl POST :4000/events \
     -H "Content-Type: application/json" \
     -d '{"agent":"dev","project":"tickets","event":"tool_use","tool":"Edit","file":"auth.ts"}'

2. Hub receives POST /events:
   a. Parses JSON
   b. Validates schema (agent, project, event required; event in allowed set)
   c. Validates field lengths (max 1024 chars each)
   d. Checks body size (max 1 MB)
   e. Stamps timestamp if missing: { ...event, ts: Date.now() }
   f. Increments event counter
   g. Broadcasts serialized event to ALL connected WebSocket clients
   h. Appends event + newline to data/events.jsonl (WriteStream handles concurrency)
   i. Returns 200 { ok: true, ts: number }

3. WebSocket consumers (connected via ws://0.0.0.0:4000) receive event in real-time:
   {"ts":1711065605000,"agent":"dev","project":"tickets","event":"tool_use","tool":"Edit","file":"auth.ts"}

4. JSONL log persists events for replay and audit:
   cat data/events.jsonl
   {"ts":1711065600000,"agent":"dev","project":"tickets","event":"session_start"}
   {"ts":1711065605000,"agent":"dev","project":"tickets","event":"tool_use","tool":"Edit","file":"auth.ts"}

5. Phase 2: Claw3D adapter will consume WebSocket feed and render agents in 3D office
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

## Network Topology (Phase 1)

```
Mac Mini (192.168.101.86)
├── Agent Bus Hub         :4000          ← Event hub (src/hub/)
│   ├── POST /events      (HTTP)         ← Accept events from producers
│   ├── GET /health       (HTTP)         ← Hub statistics
│   └── /                 (WebSocket)    ← Broadcast to consumers
│
├── Claw3D Next.js App    :3000          ← 3D visualization (embedded claw3d/)
│   ├── /api/gateway/ws   (WebSocket)    ← OpenClaw protocol endpoint
│   └── /office           (UI)           ← 3D office environment
│
├── OpenClaw Gateway      :18789         ← Passive mode ($0 tokens)
│   └── heartbeat ping    (999h)         ← Keep-alive
│
└── JSONL Log             data/          ← Event persistence (local filesystem)
    └── events.jsonl                     ← Append-only event stream

Remote Producers (VPS, Windows PC, anywhere)
├── Claude Code PostToolUse hook → POST http://<mac-mini-ip>:4000/events
├── Cron jobs, scripts → POST http://<mac-mini>:4000/events
└── Custom dashboards → ws://mac-mini:4000 (subscribe)

Phase 2: Claw3D Adapter
└── Connects to :4000 (WebSocket) → translates → :3000/api/gateway/ws
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
