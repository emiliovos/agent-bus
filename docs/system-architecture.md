# System Architecture

**Date:** 2026-03-21

---

## High-Level Overview

```
┌────────────────────────────────────────────────────────────────────┐
│  Producers (any machine)                                            │
│                                                                     │
│  Claude Code ──→ PostToolUse hook ──→ scripts/hook-post-tool-use.sh
│                                    ──→ curl POST :4000/events │     │
│  Gemini CLI  ──→ hook/script ───────────────────→ curl POST :4000   │
│  Cron job    ──→ script ────────────────────────→ curl POST :4000   │
│  CLI-Anything CLI ──→ cli-anything-agent-bus publish ──→ POST :4000 │
└──────────────────────┬──────────────────────────────────────────────┘
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
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Claw3D Adapter (src/adapter/) [PHASE 2]             │ │
│  │ Dual WS bridge: hub ↔ Claw3D                        │ │
│  │ Translates events, manages auth                     │ │
│  └──────────────────────────┬───────────────────────────┘ │
│                             │ OpenClaw frames            │
│                             ▼                            │
│  Claw3D 3D Office ──→ ws://localhost:3000/api/gateway/ws  │
│  Dashboard ──────────→ custom UI                         │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ CLI-Anything CLI Subscriber [PHASE 4]               │ │
│  │ Commands: publish, subscribe, replay, status         │ │
│  └──────────────────────┬───────────────────────────────┘ │
│                         │ cli-anything-agent-bus subscribe │
│                         │ Event stream + JSONL replay     │
└──────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Hub (`src/hub/event-hub.ts`) — Phase 1 Complete

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

### 2. Types (`src/types/agent-event.ts`) — Phase 1 Complete

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

### 3. Claw3D Adapter (`src/adapter/`) — PHASE 2 COMPLETE

Bridges agent-bus hub events to Claw3D's WebSocket protocol. Three modules:

**event-translator.ts (110 LOC):**
- Derives deterministic runId (SHA256 hash of agent:project, 12-char prefix)
- Formats sessionKey as `agent:<project>-<agent>:main`
- Maps AgentEvent → Claw3dEventFrame:
  - `session_start` → agent lifecycle event (phase: start)
  - `tool_use` → chat event (state: delta, message: tool + file)
  - `task_complete` → chat event (state: final, message)
  - `session_end` → agent lifecycle event (phase: end)
  - `heartbeat` → filtered (returns null)

**claw3d-adapter.ts (120 LOC):**
- Dual WebSocket bridge:
  - Connects to hub (ws://localhost:4000)
  - Connects to Claw3D (ws://localhost:3000/api/gateway/ws)
- Auth flow:
  1. On Claw3D open → send connect frame with OpenClaw token
  2. Wait for response { type: 'res', ok: true } to confirm authenticated
  3. Start forwarding events (only when claw3dConnected=true)
- Resilience:
  - Auto-reconnect on hub disconnect (3s delay, configurable)
  - Auto-reconnect on Claw3D disconnect (3s delay)
  - Input validation via isValidEvent type guard
- Error handling: Logs errors, ignores non-JSON frames from Claw3D

**index.ts (24 LOC):**
- Reads env: HUB_URL, CLAW3D_URL, CLAW3D_TOKEN (required)
- Instantiates adapter with config
- SIGINT/SIGTERM handlers for clean shutdown
- Exits with error if token missing

### 4. Claw3D Integration (`claw3d/`) — EMBEDDED

Claw3D visualization engine embedded in project directory.

**Structure:**
- `claw3d/server/index.js` — Node.js WebSocket gateway, renders agents
- `claw3d/src/app/api/gateway/` — OpenClaw protocol endpoints
- `claw3d/public/office-assets/` — 3D models, textures for office environment

Claw3D listens on `ws://localhost:3000/api/gateway/ws` for OpenClaw frames (now fed by adapter).

---

## Event Flow (Phase 1 + 2 — Hub + Adapter Complete)

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

5. Phase 2: Claw3D adapter consumes WebSocket feed, translates events, authenticates with Claw3D, and renders agents in 3D office
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

## Network Topology (Phase 1 + 2)

```
Mac Mini (192.168.101.86)
├── Agent Bus Hub         :4000          ← Event hub (src/hub/)
│   ├── POST /events      (HTTP)         ← Accept events from producers
│   ├── GET /health       (HTTP)         ← Hub statistics
│   └── /                 (WebSocket)    ← Broadcast to consumers
│
├── Claw3D Adapter        (src/adapter/) ← [Phase 2] Dual WS bridge
│   ├── ◄─ ws://localhost:4000          ← Consume hub events
│   ├── ─► ws://localhost:3000/api/gateway/ws ← Send Claw3D frames
│   └── Auto-reconnect on disconnect (3s)
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

---

## Phase 3 — Claude Code Hook Integration

### Hook Architecture

Claude Code fires hooks on lifecycle events. Agent Bus provides two hooks:

**PostToolUse Hook** (`scripts/hook-post-tool-use.sh`)
- Fires after any tool use (Edit, Read, Bash, Write, etc.)
- Environment: `HUB_URL`, `AGENT_BUS_AGENT`, `AGENT_BUS_PROJECT`
- Payload: `{ agent, project, event: "tool_use", tool, file? }`
- Timeout: 1s, fails silently (never blocks Claude Code)
- Example: Hook on Edit tool → POST /events with tool=Edit, file=auth.ts

**Session Event Hook** (`scripts/hook-session-event.sh`)
- Fires on `Stop` hook (session end)
- Payload: `{ agent, project, event: "session_end" }`
- Optional: merge with Start hook for `session_start`

### Integration Setup

1. Copy or reference hook scripts
2. Set environment variables:
   ```bash
   export AGENT_BUS_AGENT="my-agent"
   export AGENT_BUS_PROJECT="my-project"
   export HUB_URL="http://localhost:4000"  # or remote Tailscale IP
   ```
3. Merge `scripts/claude-settings-template.json` into `.claude/settings.json`

---

## Phase 4 — CLI-Anything Harness

### CLI Commands

**publish** — Emit event to hub
```bash
cli-anything-agent-bus publish \
  --agent backend-dev \
  --project tickets \
  --event tool_use \
  --tool Edit \
  --file auth.ts
```

**subscribe** — Real-time event stream
```bash
cli-anything-agent-bus subscribe \
  --project tickets \
  --json
```

**replay** — Playback from JSONL log
```bash
cli-anything-agent-bus replay \
  --last 20 \
  --json
```

**status** — Hub health
```bash
cli-anything-agent-bus status --json
```

### Discovery

CLI is discoverable via `/cli-anything:cli-anything ./` command in Claude Code. Zero deployment friction — metadata in `SKILL.md`.

---

## Phase 5 — E2E Smoke Tests

### Test Coverage (7 checks, all passing)

```bash
npm run test:e2e
```

Validates full pipeline:
1. Hub startup on ephemeral port (4444)
2. POST /events session_start → 200 OK
3. POST /events tool_use → 200 OK
4. POST /events session_end → 200 OK
5. JSONL log has exactly 3 events
6. All event types (session_start, tool_use, session_end) logged
7. GET /health reports 3 events

Uses `set -euo pipefail` for strict error handling. Cleans up temp directory on exit.
