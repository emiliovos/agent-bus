# Phase 1: Claw3D Inject Endpoint

## Context Links

- [Claw3D injection endpoint analysis](../reports/Explore-260322-0029-claw3d-injection-endpoint-analysis.md)
- `claw3d/server/gateway-proxy.js` — WS connection handling, needs `activeConnections` + `broadcast()`
- `claw3d/server/index.js` — HTTP server, needs raw POST handler
- `claw3d/server/access-gate.js` — existing auth middleware (cookie-based)

## Overview

- **Priority:** P1 (blocks Phase 2)
- **Status:** Pending
- **Effort:** 1.5h

Add `POST /api/inject-event` to the Claw3D server. This endpoint receives Claw3D-protocol frames from the agent-bus adapter and broadcasts them to all connected browser WebSocket clients. Auth via `X-Inject-Secret` header matched against `INJECT_SECRET` env var.

## Key Insights

- `gateway-proxy.js` has no global connection registry — each `browserWs` is scoped to its handler closure
- The raw HTTP server in `index.js` (line 68-72) already intercepts before Next.js via `accessGate.handleHttp()`
- Inject endpoint uses its own auth (`X-Inject-Secret`), separate from Claw3D's `studio_access` cookie
- `createGatewayProxy()` currently returns `{ wss, handleUpgrade }` — needs `broadcast` added

## Requirements

### Functional
- `POST /api/inject-event` accepts JSON body containing a Claw3D frame (already translated)
- Broadcasts frame to all connected browser WS clients
- Returns `{ ok: true, clients: N }` on success (N = number of clients sent to)
- Returns 401 if `X-Inject-Secret` header doesn't match `INJECT_SECRET` env var
- Returns 400 on invalid JSON
- Returns 405 on non-POST methods

### Non-Functional
- Must not break existing Claw3D functionality (WS proxy, Next.js routes, accessGate)
- Must handle concurrent broadcasts safely
- Endpoint only available when `INJECT_SECRET` is set (disabled otherwise)

## Architecture

```
POST /api/inject-event
  │ X-Inject-Secret: <secret>
  │ Body: { type: "event", event: "agent", payload: {...} }
  ▼
index.js raw HTTP handler (after accessGate check)
  │ validates secret
  │ parses JSON body
  ▼
proxy.broadcast(frame)
  │ iterates activeConnections Map
  ▼
All browser WS clients receive frame
```

## Related Code Files

### Modify
- `claw3d/server/gateway-proxy.js` — add `activeConnections` Map, `broadcast()` method
- `claw3d/server/index.js` — add raw HTTP handler for `/api/inject-event`

### No Changes
- `claw3d/server/access-gate.js` — inject endpoint uses separate auth
- `claw3d/server/studio-settings.js` — unrelated
- `claw3d/server/network-policy.js` — unrelated

## Implementation Steps

### Step 1: Add connection tracking to gateway-proxy.js

Inside `createGatewayProxy()`, before the `wss.on("connection", ...)` handler:

```javascript
let nextConnId = 0;
const activeConnections = new Map(); // Map<number, WebSocket>
```

Inside `wss.on("connection", (browserWs) => {`:

```javascript
const connId = nextConnId++;
activeConnections.set(connId, browserWs);
```

In the existing `browserWs.on("close", ...)` handler (line 287), add:

```javascript
activeConnections.delete(connId);
```

Also add cleanup in `closeBoth()` function:

```javascript
activeConnections.delete(connId);
```

### Step 2: Export broadcast() from createGatewayProxy

Modify the return statement (currently line 307: `return { wss, handleUpgrade };`) to:

```javascript
const broadcast = (frame) => {
  const data = JSON.stringify(frame);
  let sent = 0;
  for (const ws of activeConnections.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
      sent++;
    }
  }
  return sent;
};

return { wss, handleUpgrade, broadcast };
```

### Step 3: Add raw HTTP handler in index.js

After `const proxy = createGatewayProxy(...)` block (line ~56), add inject handler function:

```javascript
const injectSecret = (process.env.INJECT_SECRET || "").trim();

const handleInjectEvent = (req, res) => {
  const pathname = resolvePathname(req.url);
  if (pathname !== "/api/inject-event") return false;

  // Method check
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return true;
  }

  // Disabled if no secret configured
  if (!injectSecret) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Inject endpoint not configured" }));
    return true;
  }

  // Auth check
  const provided = (req.headers["x-inject-secret"] || "").trim();
  if (provided !== injectSecret) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid inject secret" }));
    return true;
  }

  // Parse body
  let body = "";
  req.on("data", (chunk) => { body += chunk.toString(); });
  req.on("end", () => {
    try {
      const frame = JSON.parse(body);
      const sent = proxy.broadcast(frame);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, clients: sent }));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
    }
  });
  return true;
};
```

### Step 4: Wire into HTTP server creation

Modify `createServer()` (currently line 68-72):

```javascript
const createServer = () =>
  http.createServer((req, res) => {
    if (handleInjectEvent(req, res)) return;  // Before accessGate — own auth
    if (accessGate.handleHttp(req, res)) return;
    handle(req, res);
  });
```

**Important:** `handleInjectEvent` goes BEFORE `accessGate` because inject uses its own `X-Inject-Secret` auth, not the `studio_access` cookie. This prevents accessGate from blocking inject requests that lack the cookie.

### Step 5: Add body size limit

Inside `handleInjectEvent`, before `req.on("data", ...)`:

```javascript
let bodySize = 0;
const MAX_BODY = 64 * 1024; // 64KB — generous for event frames
```

In the `data` handler:

```javascript
req.on("data", (chunk) => {
  bodySize += chunk.length;
  if (bodySize > MAX_BODY) {
    res.writeHead(413, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Body too large" }));
    req.destroy();
    return;
  }
  body += chunk.toString();
});
```

## Todo List

- [ ] Add `activeConnections` Map to `gateway-proxy.js`
- [ ] Track connections on open, remove on close (both `close` event and `closeBoth`)
- [ ] Export `broadcast()` method from `createGatewayProxy()`
- [ ] Add `handleInjectEvent` function in `index.js`
- [ ] Wire handler before `accessGate` in `createServer()`
- [ ] Add body size limit (64KB)
- [ ] Test manually: `INJECT_SECRET=test npm run dev:claw3d` + curl POST
- [ ] Verify existing Claw3D functionality unbroken (WS proxy, Next.js pages)

## Success Criteria

1. `curl -X POST http://localhost:3000/api/inject-event -H "X-Inject-Secret: test" -H "Content-Type: application/json" -d '{"type":"event","event":"agent","payload":{"runId":"abc","sessionKey":"agent:test:main","stream":"lifecycle","data":{"phase":"start"}}}'` returns `{ ok: true, clients: N }`
2. Browser clients connected via WS receive the injected frame
3. Missing/wrong secret returns 401
4. No secret configured returns 503
5. Existing Claw3D WS proxy and Next.js routes still work

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| activeConnections leak (close not called) | Low | Med | Delete in both `close` event AND `closeBoth()` |
| Body parsing DoS | Low | Low | 64KB limit, destroy on exceed |
| Breaking existing WS proxy | Low | High | Additive changes only — no existing code modified except return value |

## Security Considerations

- Shared secret auth (`X-Inject-Secret`) is sufficient for local/Cloudflare-tunneled access
- Secret transmitted over localhost (plain) or HTTPS (via CF tunnel) — never plain over internet
- `INJECT_SECRET` must not be committed to git
- Handler placed before `accessGate` to avoid cookie requirement — intentional design
