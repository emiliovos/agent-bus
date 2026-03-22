---
title: "Phase 6: Claw3D Inject Endpoint + Cloudflare Tunnel"
description: "HTTP inject endpoint in Claw3D server + adapter HTTP mode + Cloudflare Tunnel for remote access"
status: pending
priority: P1
effort: 6h
branch: main
tags: [claw3d, cloudflare, adapter, remote-access]
created: 2026-03-22
---

# Phase 6: Claw3D Inject Endpoint + Cloudflare Tunnel

## Goal

Replace the adapter's WS-proxy-to-Claw3D approach with a direct HTTP POST inject endpoint on the Claw3D server. Then expose both hub (:4000) and Claw3D (:3000) remotely via Cloudflare Tunnel.

## Architecture Change

```
BEFORE:
  Hub WS ──> Adapter (dual WS bridge) ──> Claw3D WS gateway ──> browser

AFTER:
  Hub WS ──> Adapter (HTTP POST) ──> POST /api/inject-event ──> broadcast to browsers
```

Key win: No WS auth handshake, no OpenClaw token, no connect frame dance. Just HTTP POST with shared secret.

## Phases

| # | Phase | Status | File | Effort |
|---|-------|--------|------|--------|
| 1 | Claw3D inject endpoint | pending | [phase-01](phase-01-claw3d-inject-endpoint.md) | 1.5h |
| 2 | Adapter HTTP mode | pending | [phase-02](phase-02-adapter-http-mode.md) | 1.5h |
| 3 | Cloudflare Tunnel setup | pending | [phase-03](phase-03-cloudflare-tunnel.md) | 2h |
| 4 | Remote hook integration | pending | [phase-04](phase-04-remote-hook-integration.md) | 1h |

## Dependencies

- Phase 2 depends on Phase 1 (inject endpoint must exist before adapter can POST to it)
- Phase 3 independent (infra setup)
- Phase 4 depends on Phase 3 (CF auth headers need tunnel configured)

## Key Decisions (Pre-made)

1. **Raw HTTP handler in index.js** (not Next.js route) — inserted after accessGate, before Next.js `handle()`
2. **Broadcast to ALL browser clients** — no targeting by runId
3. **Shared secret via `X-Inject-Secret` header** — env var `INJECT_SECRET`
4. **Cloudflare Access service tokens** for remote auth (free tier sufficient)
5. **`CLAW3D_TOKEN` removed** — no longer needed with HTTP inject

## Reports

- [Claw3D injection endpoint analysis](../reports/Explore-260322-0029-claw3d-injection-endpoint-analysis.md)
- [Cloudflare Tunnel research](../reports/researcher-260322-0028-cloudflare-tunnel-setup.md)
