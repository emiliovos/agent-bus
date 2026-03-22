# Phase 4: Remote Hook Integration

## Context Links

- [Phase 3: Cloudflare Tunnel](phase-03-cloudflare-tunnel.md) — depends on this
- `scripts/hook-post-tool-use.sh` — current hook, POSTs to hub (local only)
- `scripts/hook-session-event.sh` — session lifecycle hook
- `cli-anything/agent-harness/cli_anything/agent_bus/utils/hub_backend.py` — CLI-Anything HTTP client

## Overview

- **Priority:** P2
- **Status:** Pending (blocked by Phase 3)
- **Effort:** 1h

Update hook scripts and CLI-Anything hub_backend.py to support Cloudflare Access service token headers when HUB_URL points to a CF-tunneled remote endpoint. Backward-compatible: if CF env vars not set, behaves exactly as before (local mode).

## Key Insights

- CF Access requires two headers: `CF-Access-Client-Id` + `CF-Access-Client-Secret`
- Headers only needed when `HUB_URL` starts with `https://` (tunneled)
- Local mode (`http://localhost:4000`) needs no CF headers
- Hook scripts must stay fast (<1s) and fail silently

## Requirements

### Functional
- Hook scripts add CF headers when `CF_CLIENT_ID` and `CF_CLIENT_SECRET` env vars are set
- CLI-Anything `hub_backend.py` adds CF headers to all requests when vars present
- No behavior change when CF vars are unset

### Non-Functional
- Hook scripts still fail silently (never block Claude Code)
- 1s curl timeout preserved for hooks
- hub_backend.py timeout stays at 5s

## Architecture

```
Remote VPS
  │ hook-post-tool-use.sh
  │ HUB_URL=https://agent-bus.yourdomain.com
  │ CF_CLIENT_ID=abc
  │ CF_CLIENT_SECRET=xyz
  ▼
curl POST https://agent-bus.yourdomain.com/events
  -H "CF-Access-Client-Id: abc"
  -H "CF-Access-Client-Secret: xyz"
  -H "Content-Type: application/json"
  ▼
Cloudflare Edge (validates service token) → tunnel → localhost:4000
```

## Related Code Files

### Modify
- `scripts/hook-post-tool-use.sh` — add CF headers
- `scripts/hook-session-event.sh` — add CF headers
- `cli-anything/agent-harness/cli_anything/agent_bus/utils/hub_backend.py` — add CF headers

### No Changes
- `src/hub/event-hub.ts` — hub doesn't care about CF headers (Cloudflare strips them)
- `src/adapter/` — adapter connects locally, not through tunnel

## Implementation Steps

### Step 1: Update hook-post-tool-use.sh

After the existing env var block (lines 6-10), add:

```bash
CF_ID="${CF_CLIENT_ID:-}"
CF_SECRET="${CF_CLIENT_SECRET:-}"

# Build CF auth headers if configured
CF_HEADERS=""
if [ -n "$CF_ID" ] && [ -n "$CF_SECRET" ]; then
  CF_HEADERS="-H \"CF-Access-Client-Id: ${CF_ID}\" -H \"CF-Access-Client-Secret: ${CF_SECRET}\""
fi
```

Update curl command (line 23-25):

```bash
eval curl -s -m 1 -X POST "${HUB_URL}/events" \
  -H "Content-Type: application/json" \
  $CF_HEADERS \
  -d "$PAYLOAD" > /dev/null 2>&1 || true
```

**Alternative (cleaner, no eval):** Build args array:

```bash
CURL_ARGS=(-s -m 1 -X POST "${HUB_URL}/events" -H "Content-Type: application/json")
if [ -n "$CF_ID" ] && [ -n "$CF_SECRET" ]; then
  CURL_ARGS+=(-H "CF-Access-Client-Id: ${CF_ID}" -H "CF-Access-Client-Secret: ${CF_SECRET}")
fi
CURL_ARGS+=(-d "$PAYLOAD")

curl "${CURL_ARGS[@]}" > /dev/null 2>&1 || true
```

Use the array approach — safer, no `eval`.

### Step 2: Update hook-session-event.sh

Same pattern. After env var block (lines 6-8), add CF vars. Update curl (line 21-23) to use array.

### Step 3: Update hub_backend.py

In `publish_event()`, add CF headers:

```python
def publish_event(hub_url: str, event: dict) -> dict:
    """POST an event to the hub. Returns the response JSON."""
    data = json.dumps(event).encode("utf-8")
    headers = {"Content-Type": "application/json"}

    # Cloudflare Access service token (for remote access via CF tunnel)
    cf_id = os.environ.get("CF_CLIENT_ID", "")
    cf_secret = os.environ.get("CF_CLIENT_SECRET", "")
    if cf_id and cf_secret:
        headers["CF-Access-Client-Id"] = cf_id
        headers["CF-Access-Client-Secret"] = cf_secret

    req = urllib.request.Request(
        f"{hub_url}/events",
        data=data,
        headers=headers,
        method="POST",
    )
    ...
```

Same for `get_health()`:

```python
def _build_headers() -> dict:
    """Build request headers, including CF Access tokens if configured."""
    headers = {}
    cf_id = os.environ.get("CF_CLIENT_ID", "")
    cf_secret = os.environ.get("CF_CLIENT_SECRET", "")
    if cf_id and cf_secret:
        headers["CF-Access-Client-Id"] = cf_id
        headers["CF-Access-Client-Secret"] = cf_secret
    return headers
```

Extract to shared `_build_headers()` to DRY it up.

Add `import os` at top (currently missing — only `json` and `urllib` imported).

### Step 4: Update claude-settings-template.json

If the template references env vars, ensure CF vars are documented:

```json
{
  "env": {
    "HUB_URL": "http://localhost:4000",
    "AGENT_BUS_AGENT": "",
    "AGENT_BUS_PROJECT": "",
    "CF_CLIENT_ID": "",
    "CF_CLIENT_SECRET": ""
  }
}
```

### Step 5: Update E2E smoke test

Add optional CF header test (only if CF_CLIENT_ID is set):

```bash
# Optional: test with CF headers
if [ -n "${CF_CLIENT_ID:-}" ] && [ -n "${CF_CLIENT_SECRET:-}" ]; then
  echo "[7/7] Testing CF auth headers..."
  RESP=$(curl -s -X POST "${HUB_URL}/events" \
    -H "Content-Type: application/json" \
    -H "CF-Access-Client-Id: ${CF_CLIENT_ID}" \
    -H "CF-Access-Client-Secret: ${CF_CLIENT_SECRET}" \
    -d '{"agent":"e2e-cf","project":"smoke","event":"heartbeat"}')
  if echo "$RESP" | grep -q '"ok":true'; then
    ok "CF auth headers accepted"
  else
    fail "CF auth failed: $RESP"
  fi
fi
```

## Todo List

- [ ] Update `hook-post-tool-use.sh` — add CF headers via array approach
- [ ] Update `hook-session-event.sh` — same pattern
- [ ] Update `hub_backend.py` — add `import os`, `_build_headers()`, CF headers
- [ ] Update `claude-settings-template.json` — add CF env vars
- [ ] Update `.env.example` — CF vars already added in Phase 3
- [ ] Test hooks locally (no CF vars = same behavior)
- [ ] Test hooks with CF vars against remote tunnel

## Success Criteria

1. Local mode: `HUB_URL=http://localhost:4000` + no CF vars → works as before
2. Remote mode: `HUB_URL=https://agent-bus.yourdomain.com` + CF vars → 200 OK
3. CLI-Anything `publish` command works through tunnel
4. `cli-anything-agent-bus status --json` works through tunnel
5. Hook scripts stay under 1s execution time

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CF headers break local mode | Low | Med | Only added when both vars non-empty |
| curl array syntax fails on some shells | Low | Low | Bash arrays are standard; hooks require bash |
| hub_backend.py missing `os` import | Med | Low | Easy fix — add `import os` |

## Security Considerations

- CF credentials in env vars only — never in script files or git
- Service tokens scoped to specific Access Application
- Tokens rotatable via Cloudflare dashboard (1-year default expiry)
- Headers transmitted over HTTPS (CF tunnel) — never plaintext over internet
