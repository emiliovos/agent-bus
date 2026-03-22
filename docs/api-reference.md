# API Reference

Complete documentation of Agent Bus public APIs.

---

## Hub API (:4000)

### POST /events

Publish an event to the hub. Broadcasts to all connected WebSocket clients and logs to JSONL.

**Request:**
```bash
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "backend-dev",
    "project": "tickets",
    "event": "tool_use",
    "tool": "Edit",
    "file": "src/auth.ts"
  }'
```

**Request Body:**
```typescript
{
  agent: string;           // Required. Agent identifier (max 1024 chars)
  project: string;         // Required. Project namespace (max 1024 chars)
  event: EventType;        // Required. One of: session_start, session_end, tool_use, task_complete, heartbeat
  tool?: string;           // Optional. Tool name for tool_use events (max 1024 chars)
  file?: string;           // Optional. File path (max 1024 chars)
  message?: string;        // Optional. Human-readable description (max 1024 chars)
  ts?: number;             // Optional. Unix timestamp ms (hub adds if missing)
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "ts": 1711065605000
}
```

**Error Responses:**
| Code | Condition |
|------|-----------|
| 400 | Invalid JSON or missing required fields (agent, project, event) |
| 400 | Invalid event type (not in allowed set) |
| 400 | String field exceeds 1024 characters |
| 413 | Payload exceeds 1 MB |

**Example Errors:**
```json
// Invalid JSON
{"error": "Invalid JSON"}

// Missing required field
{"error": "Invalid event schema"}

// Oversized payload
{"error": "Payload too large"}
```

---

### GET /health

Query hub statistics and client count.

**Request:**
```bash
curl http://localhost:4000/health
```

**Response (200 OK):**
```json
{
  "ok": true,
  "clients": 3,
  "events": 247
}
```

**Fields:**
- `ok` (boolean) — Hub is healthy
- `clients` (number) — Connected WebSocket consumers
- `events` (number) — Total events published since startup

---

### WebSocket /

Subscribe to real-time event stream.

**Connection:**
```javascript
const ws = new WebSocket('ws://localhost:4000');

ws.onopen = () => {
  console.log('Connected');
};

ws.onmessage = (msg) => {
  const event = JSON.parse(msg.data);
  console.log('Event:', event);
};

ws.onerror = (err) => {
  console.error('Connection error:', err);
};

ws.onclose = () => {
  console.log('Disconnected');
};
```

**Message Format:**

Every message is a JSON-encoded AgentEvent:
```json
{
  "ts": 1711065605000,
  "agent": "backend-dev",
  "project": "tickets",
  "event": "tool_use",
  "tool": "Edit",
  "file": "src/auth.ts"
}
```

**Broadcast Behavior:**
- Client connects → immediately receives no backlog (only new events)
- Hub receives event → broadcasts to ALL connected clients
- Client sends data → ignored (read-only stream)
- Client disconnects → hub removes from broadcast list

---

## Gateway API (:18789)

OpenClaw-compatible WebSocket RPC interface. Used by Claw3D visualization.

### Connection

**Connect Frame (Client → Gateway):**
```json
{
  "type": "req",
  "id": "unique-uuid-1",
  "method": "connect",
  "params": {
    "minProtocol": 1,
    "maxProtocol": 1,
    "client": "claw3d-browser",
    "auth": {
      "token": "optional-auth-token"
    }
  }
}
```

**Response (Gateway → Client):**
```json
{
  "type": "res",
  "id": "unique-uuid-1",
  "ok": true,
  "payload": {
    "type": "hello-ok",
    "protocol": 2,
    "server": {
      "version": "agent-bus-1.0",
      "connId": "conn-abc123"
    },
    "features": {
      "methods": [
        "connect", "health", "agents.list", "config.get", "sessions.list",
        "sessions.preview", "status", "exec.approvals.get", "chat.send", "chat.abort"
      ],
      "events": ["agent", "chat", "presence", "tick"]
    },
    "snapshot": {
      "presence": [
        {
          "instanceId": "backend-dev",
          "host": "agent-bus",
          "version": "1.0",
          "mode": "cli",
          "reason": "connect",
          "ts": 1711065605000
        }
      ],
      "health": {
        "agents": [
          { "agentId": "backend-dev", "name": "Backend Dev", "isDefault": false }
        ],
        "defaultAgentId": "backend-dev"
      },
      "sessionDefaults": { "mainKey": "main" },
      "stateVersion": 42,
      "uptimeMs": 125000
    },
    "policy": {
      "maxPayload": 1048576,
      "maxBufferedBytes": 1048576,
      "tickIntervalMs": 30000
    }
  }
}
```

---

### RPC Methods

#### health

Check gateway health.

**Request:**
```json
{ "type": "req", "id": "uuid-2", "method": "health" }
```

**Response:**
```json
{
  "type": "res",
  "id": "uuid-2",
  "ok": true,
  "payload": { "ok": true }
}
```

---

#### agents.list

List all registered agents with identity.

**Request:**
```json
{ "type": "req", "id": "uuid-3", "method": "agents.list" }
```

**Response:**
```json
{
  "type": "res",
  "id": "uuid-3",
  "ok": true,
  "payload": {
    "defaultId": "backend-dev",
    "mainKey": "main",
    "agents": [
      {
        "id": "backend-dev",
        "name": "Backend Dev",
        "identity": {
          "name": "Backend Dev",
          "emoji": "🚀",
          "theme": "blue"
        }
      },
      {
        "id": "qa-agent",
        "name": "QA Agent",
        "identity": {
          "name": "QA Agent",
          "emoji": "🧪",
          "theme": "green"
        }
      }
    ]
  }
}
```

**Fields:**
- `id` (string) — Agent identifier (e.g., "backend-dev")
- `name` (string) — Display name (derived from id, with kebab→title conversion)
- `identity.emoji` (string) — Deterministic emoji (hash-based)
- `identity.theme` (string) — Theme color (hard-coded per agent)

---

#### config.get

Retrieve full configuration for client hydration.

**Request:**
```json
{ "type": "req", "id": "uuid-4", "method": "config.get" }
```

**Response:**
```json
{
  "type": "res",
  "id": "uuid-4",
  "ok": true,
  "payload": {
    "config": {
      "agents": {
        "list": [
          {
            "id": "backend-dev",
            "identity": {
              "name": "Backend Dev",
              "emoji": "🚀",
              "theme": "blue"
            }
          }
        ]
      }
    },
    "hash": "",
    "exists": true,
    "path": ""
  }
}
```

---

#### sessions.list

List sessions, optionally filtered by agent or search term.

**Request:**
```json
{
  "type": "req",
  "id": "uuid-5",
  "method": "sessions.list",
  "params": {
    "agentId": "backend-dev",
    "search": "auth",
    "limit": 10,
    "offset": 0
  }
}
```

**Response:**
```json
{
  "type": "res",
  "id": "uuid-5",
  "ok": true,
  "payload": {
    "sessions": [
      {
        "key": "backend-dev:main",
        "agentId": "backend-dev",
        "project": "tickets",
        "startedAt": 1711065600000,
        "messages": [
          {
            "role": "user",
            "content": "Fix login validation",
            "ts": 1711065605000
          },
          {
            "role": "assistant",
            "content": "Editing src/auth.ts",
            "ts": 1711065610000
          }
        ]
      }
    ],
    "total": 1
  }
}
```

---

#### sessions.preview

Batch preview of sessions or single session chat history.

**Request (Batch):**
```json
{
  "type": "req",
  "id": "uuid-6",
  "method": "sessions.preview",
  "params": {
    "keys": ["backend-dev:main", "qa-agent:main"]
  }
}
```

**Request (Single):**
```json
{
  "type": "req",
  "id": "uuid-6",
  "method": "sessions.preview",
  "params": {
    "key": "backend-dev:main"
  }
}
```

**Response:**
```json
{
  "type": "res",
  "id": "uuid-6",
  "ok": true,
  "payload": {
    "sessions": {
      "backend-dev:main": {
        "messages": [
          {
            "role": "user",
            "content": "Fix login validation",
            "ts": 1711065605000
          },
          {
            "role": "assistant",
            "content": "Editing src/auth.ts",
            "ts": 1711065610000
          }
        ]
      }
    }
  }
}
```

---

#### status

Get current status and metadata for an agent.

**Request:**
```json
{
  "type": "req",
  "id": "uuid-7",
  "method": "status",
  "params": {
    "agentId": "backend-dev"
  }
}
```

**Response:**
```json
{
  "type": "res",
  "id": "uuid-7",
  "ok": true,
  "payload": {
    "agentId": "backend-dev",
    "status": "active",
    "lastSeen": 1711065610000,
    "project": "tickets",
    "sessionKey": "backend-dev:main"
  }
}
```

---

#### exec.approvals.get

Get pending approvals (always empty — read-only gateway).

**Request:**
```json
{ "type": "req", "id": "uuid-8", "method": "exec.approvals.get" }
```

**Response:**
```json
{
  "type": "res",
  "id": "uuid-8",
  "ok": true,
  "payload": { "approvals": [] }
}
```

---

#### chat.send

Send a message (not routed — logged but not delivered).

**Request:**
```json
{
  "type": "req",
  "id": "uuid-9",
  "method": "chat.send",
  "params": {
    "sessionKey": "backend-dev:main",
    "message": "What are we working on?"
  }
}
```

**Response:**
```json
{
  "type": "res",
  "id": "uuid-9",
  "ok": true,
  "payload": { "ack": true }
}
```

---

#### chat.abort

Abort a running task (not routed — logged but not delivered).

**Request:**
```json
{
  "type": "req",
  "id": "uuid-10",
  "method": "chat.abort",
  "params": {
    "sessionKey": "backend-dev:main"
  }
}
```

**Response:**
```json
{
  "type": "res",
  "id": "uuid-10",
  "ok": true,
  "payload": { "ack": true }
}
```

---

### Gateway Events

Gateway broadcasts these event frames to all connected clients.

#### agent — Lifecycle Event

Agent started or ended a session.

```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "run-uuid-123",
    "sessionKey": "backend-dev:main",
    "stream": "lifecycle",
    "data": {
      "phase": "start"
    }
  }
}
```

---

#### chat — Activity Event

Agent used a tool or completed a task.

```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "runId": "run-uuid-123",
    "sessionKey": "backend-dev:main",
    "state": "delta",
    "message": "Editing src/auth.ts — fixing login validation"
  }
}
```

---

#### presence — Agent Registry Change

Agent list changed (new agent, agent offline, etc.).

```json
{
  "type": "event",
  "event": "presence",
  "payload": {
    "agents": [
      {
        "id": "backend-dev",
        "name": "Backend Dev",
        "identity": {
          "name": "Backend Dev",
          "emoji": "🚀",
          "theme": "blue"
        },
        "status": "active",
        "lastSeen": 1711065610000
      }
    ],
    "stateVersion": 43
  }
}
```

---

#### tick — Keepalive

Sent every 30 seconds. Maintains connection health.

```json
{
  "type": "event",
  "event": "tick",
  "payload": {
    "ts": 1711065640000
  }
}
```

---

## Common Error Responses

**Invalid RPC (malformed request):**
```json
{
  "type": "res",
  "id": "uuid",
  "ok": false,
  "error": {
    "code": "invalid_request",
    "message": "Missing or invalid id/method"
  }
}
```

**Method not found:**
```json
{
  "type": "res",
  "id": "uuid",
  "ok": false,
  "error": {
    "code": "method_not_found",
    "message": "Unknown method: foo"
  }
}
```

**Connect required before other methods:**
```json
{
  "type": "res",
  "id": "uuid",
  "ok": false,
  "error": {
    "code": "not_connected",
    "message": "Must call connect first"
  }
}
```

---

## Event Schema

All events conform to this schema:

```typescript
interface AgentEvent {
  ts: number;            // Unix timestamp ms (hub adds if missing)
  agent: string;         // Agent identifier (required)
  project: string;       // Project namespace (required)
  event: EventType;      // One of the 5 event types (required)
  tool?: string;         // Tool name for tool_use (optional)
  file?: string;         // File path (optional)
  message?: string;      // Description (optional)
}

type EventType =
  | 'session_start'      // Agent started a session
  | 'session_end'        // Agent ended a session
  | 'tool_use'           // Agent used a tool (with tool, file optional)
  | 'task_complete'      // Agent completed a task
  | 'heartbeat'          // Keep-alive ping from producer
```

---

## Rate Limiting & Quotas

- **Max payload:** 1 MB per request
- **Max field length:** 1024 characters per field (agent, project, tool, file, message)
- **No rate limit:** Publish as frequently as needed

---

## Authentication

**Local (`:4000`, `:18789`):** No auth required.

**Remote (Cloudflare Tunnel):**
```bash
# Use CF Access Client ID + Secret
curl -X POST https://agent-bus.yourdomain.com/events \
  -H "CF-Access-Client-Id: $CF_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_CLIENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

See `CONTRIBUTING.md` for hook pattern examples.
