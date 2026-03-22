# Claw3D WebSocket Gateway — Event Injection Endpoint Analysis

**Date:** 2026-03-22  
**Context:** Agent-Bus `/api/inject-event` endpoint integration into Claw3D server

---

## Executive Summary

Claw3D runs a **Next.js custom HTTP server** with raw `http.createServer()` wrapping. The gateway proxy uses a **WebSocket-per-connection model** with stateful browser-to-upstream relay. To add a POST `/api/inject-event` endpoint:

1. Leverage Next.js built-in routing (create `pages/api/inject-event.js`)
2. OR add an HTTP POST handler before Next.js handler in `index.js` line 70
3. Access active browser WebSocket connections requires state tracking (not currently exported)

---

## 1. Browser WebSocket Tracking

### Data Structures (gateway-proxy.js)

**Per-connection state (lines 98–107):**
```javascript
wss.on("connection", (browserWs) => {
  let upstreamWs = null;           // Upstream proxy connection
  let upstreamReady = false;       // Upstream open flag
  let upstreamUrl = "";            // Upstream gateway URL
  let upstreamToken = "";          // Upstream auth token
  let connectRequestId = null;     // Connect request ID
  let connectResponseSent = false; // Connect handshake complete
  let pendingConnectFrame = null;  // Buffered connect before upstream ready
  let pendingUpstreamSetupError = null; // Setup error tracking
  let closed = false;              // Connection closed flag
```

**WebSocketServer instance:**
```javascript
const wss = new WebSocketServer({ noServer: true, verifyClient });
```

**Problem:** No global registry of active `browserWs` connections. Each connection is scoped only to its handler closure. To inject events, you'd need to:
- Maintain a `Map<id, browserWs>` outside the connection handler, OR
- Broadcast to all active connections (if that's acceptable)

---

## 2. Message Relay to Browser Clients

### Relay Function (gateway-proxy.js, lines 120–123)

**Primary relay: upstream → browser**
```javascript
const sendToBrowser = (frame) => {
  if (browserWs.readyState !== WebSocket.OPEN) return;
  browserWs.send(JSON.stringify(frame));
};
```

**Called from:**
- Line 215: Direct relay from upstream (`browserWs.send(String(upRaw ?? ""))`)
- Lines 222–228: Connect error relay
- Line 128: Error response builder

**Relay flow:**
```
Upstream WebSocket message
  → upstreamWs.on("message", ...) [line 206]
  → safeJsonParse
  → browserWs.send() [line 215]
```

**To inject an event via POST:**
- Parse the event JSON in POST handler
- Wrap as a Claw3D frame (type: "event")
- Call `browserWs.send(JSON.stringify(frame))`

---

## 3. HTTP Server / Express Framework

### Server Setup (index.js)

**Framework: Next.js custom server (NOT Express)**

```javascript
const http = require("node:http");
const next = require("next");

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
```

**HTTP server creation (lines 68–72):**
```javascript
const createServer = () =>
  http.createServer((req, res) => {
    if (accessGate.handleHttp(req, res)) return;
    handle(req, res);  // Delegate to Next.js handler
  });
```

**Upgrade handler (lines 60–66):**
```javascript
const handleServerUpgrade = (req, socket, head) => {
  if (resolvePathname(req.url) === "/api/gateway/ws") {
    proxy.handleUpgrade(req, socket, head);
    return;
  }
  handleUpgrade(req, socket, head);
};
```

### Auth Middleware

**Access Gate (access-gate.js, lines 29–48):**
```javascript
const handleHttp = (req, res) => {
  if (!enabled) return false;  // Auth disabled? Pass through
  if (!isAuthorized(req)) {
    if (String(req.url || "/").startsWith("/api/")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        error: "Studio access token required. Send the configured Studio access cookie and retry.",
      }));
    }
    return true;
  }
  return false;
};
```

**Auth checks:**
- Extracts `studio_access` cookie (configurable, lines 24–26)
- Compares against `STUDIO_ACCESS_TOKEN` env var
- If token doesn't match: returns 401, **blocks request from reaching Next.js**

**For `/api/inject-event`:**
- If implemented as Next.js route (`pages/api/inject-event.js`): auth is **already enforced** by `accessGate.handleHttp()`
- If added to `index.js` before `handle()`: **must check auth manually** or after accessGate

---

## 4. Where to Add POST /api/inject-event Endpoint

### Option A: Next.js Route (Recommended)

**Create:** `pages/api/inject-event.js`

```javascript
// pages/api/inject-event.js
export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { agent, event, project, payload } = req.body;

  // Validate
  if (!agent || !event) {
    return res.status(400).json({ error: "Missing agent or event" });
  }

  // TODO: Get active browserWs connections and relay
  // (Requires exporting connection registry from gateway-proxy.js)

  return res.status(200).json({ ok: true, injected: true });
}
```

**Pros:**
- Auth handled automatically by `accessGate.handleHttp()`
- Follows Next.js conventions
- Easy to scale

**Cons:**
- Need to export WebSocket registry from gateway-proxy

### Option B: Raw HTTP Handler (Lower-level)

**Add to index.js before line 71 (before `handle()`):**

```javascript
const handleRawHttp = (req, res) => {
  const pathname = resolvePathname(req.url);
  
  if (pathname === "/api/inject-event" && req.method === "POST") {
    // Parse body (simplified; use body parser in production)
    let body = "";
    req.on("data", chunk => { body += chunk.toString(); });
    req.on("end", () => {
      try {
        const event = JSON.parse(body);
        // Relay to active browsers
        proxy.injectEvent(event); // TODO: Add method to proxy
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }
  return false;
};

const createServer = () =>
  http.createServer((req, res) => {
    if (accessGate.handleHttp(req, res)) return;
    if (handleRawHttp(req, res)) return;  // NEW
    handle(req, res);
  });
```

**Pros:**
- No Next.js dependency
- Direct control over request handling

**Cons:**
- Manual body parsing (unsafe without proper middleware)
- Must check auth manually

---

## 5. Middleware & Auth Already in Place

| Component | File | Purpose | Impact |
|-----------|------|---------|--------|
| `accessGate` | `access-gate.js` | Token-based auth via cookie | **Blocks 401 if no `studio_access` cookie** |
| `verifyClient` | Passed to WSS | WebSocket upgrade auth | **Only affects `/api/gateway/ws` upgrades** |
| `allowWs` | `gateway-proxy.js:85` | Route gating for WebSocket | **Only allows `/api/gateway/ws`** |
| `resolvePathname` | `index.js:16` | URL path normalization | **Strips query strings** |

---

## 6. Key Decision: WebSocket Connection Registry

**Current Problem:** No way to access active `browserWs` connections from an HTTP endpoint.

**Solution:**

Modify `gateway-proxy.js` to export a connection registry:

```javascript
// In createGatewayProxy()
const activeConnections = new Map(); // Key: connection ID, Value: browserWs

wss.on("connection", (browserWs) => {
  const connId = generateId(); // UUID
  activeConnections.set(connId, browserWs);
  
  browserWs.on("close", () => {
    activeConnections.delete(connId);
  });
  
  // ... existing handler
});

return {
  wss,
  handleUpgrade,
  broadcast: (frame) => {
    for (const ws of activeConnections.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(frame));
      }
    }
  },
};
```

Then in HTTP handler:
```javascript
if (pathname === "/api/inject-event") {
  const event = JSON.parse(body);
  proxy.broadcast({
    type: "event",
    event: event.event,
    payload: event.payload,
  });
  res.end(JSON.stringify({ ok: true }));
}
```

---

## Implementation Checklist

- [ ] Decide: Next.js route vs raw HTTP handler
- [ ] Modify `gateway-proxy.js` to track active browser connections
- [ ] Export `broadcast()` method from `createGatewayProxy()`
- [ ] Create endpoint handler (`pages/api/inject-event.js` or inline in `index.js`)
- [ ] Validate event payload schema
- [ ] Test with curl/postman against running Claw3D instance
- [ ] Document event frame format (align with Claw3D protocol)

---

## Unresolved Questions

1. Should injected events be broadcast to **all browsers** or **targeted to specific runId**?
2. What's the exact Claw3D event frame format for custom events (e.g., `{ type: "event", event: "...", payload: ... }`)?
3. Should `/api/inject-event` be rate-limited or require additional scopes?
4. Does agent-bus need to track which browser client "owns" which event, or is broadcast acceptable?

