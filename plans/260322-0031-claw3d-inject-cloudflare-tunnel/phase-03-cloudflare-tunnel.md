# Phase 3: Cloudflare Tunnel Setup

## Context Links

- [Cloudflare Tunnel research](../reports/researcher-260322-0028-cloudflare-tunnel-setup.md)
- Independent of Phase 1/2 (infra setup, no code changes)

## Overview

- **Priority:** P2
- **Status:** Pending
- **Effort:** 2h

Set up Cloudflare Tunnel to expose hub (:4000) and Claw3D (:3000) via public hostnames. Includes setup script, config template, LaunchAgent for persistence, and Cloudflare Access service token for machine-to-machine auth.

## Key Insights

- Free tier: unlimited tunnels, 50 Zero Trust users, 500 apps — more than sufficient
- Single tunnel routes both services via hostname-based ingress rules
- Service tokens use two HTTP headers: `CF-Access-Client-Id` + `CF-Access-Client-Secret`
- `cloudflared service install` creates LaunchAgent automatically
- Config at `~/.cloudflared/config.yml`

## Requirements

### Functional
- Setup script installs cloudflared, creates tunnel, configures DNS routes
- Config template with placeholders for domain and tunnel UUID
- LaunchAgent template for macOS auto-start
- Service token creation documented (manual dashboard step)

### Non-Functional
- Script idempotent (skip steps already done)
- Works on macOS arm64 (M-series) and amd64 (Intel)
- No secrets in repo

## Architecture

```
Remote VPS / Windows PC
  │ curl -H "CF-Access-Client-Id: ..." -H "CF-Access-Client-Secret: ..."
  │ https://agent-bus.yourdomain.com/events
  ▼
Cloudflare Edge (Access policy validates service token)
  │
  ▼
cloudflared tunnel (Mac Mini LaunchAgent)
  │ ingress rules
  ├── agent-bus.yourdomain.com → http://localhost:4000
  └── claw3d.yourdomain.com → http://localhost:3000
```

## Related Code Files

### Create
- `scripts/setup-cloudflare-tunnel.sh` — interactive setup script
- `scripts/cloudflared-config-template.yml` — config template
- `scripts/com.cloudflare.cloudflared.agent-bus.plist` — LaunchAgent template

### Modify
- `README.md` — add remote access section

## Implementation Steps

### Step 1: Create config template

`scripts/cloudflared-config-template.yml`:

```yaml
# Cloudflare Tunnel config for Agent Bus
# Copy to ~/.cloudflared/config.yml and replace placeholders
#
# Replace:
#   TUNNEL_UUID  — from `cloudflared tunnel create agent-bus-hub`
#   YOUR_DOMAIN  — your Cloudflare-managed domain

tunnel: TUNNEL_UUID
credentials-file: ~/.cloudflared/TUNNEL_UUID.json

ingress:
  # Agent Bus Hub
  - hostname: agent-bus.YOUR_DOMAIN
    service: http://localhost:4000

  # Claw3D Visualization
  - hostname: claw3d.YOUR_DOMAIN
    service: http://localhost:3000

  # Catch-all (required)
  - service: http_status:404
```

### Step 2: Create setup script

`scripts/setup-cloudflare-tunnel.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Interactive setup:
# 1. Check/install cloudflared
# 2. Login (if not already)
# 3. Create tunnel (if not exists)
# 4. Generate config from template
# 5. Route DNS
# 6. Test tunnel
# 7. Install as LaunchAgent (optional)
```

Script flow:
1. `which cloudflared || brew install cloudflared`
2. Check `~/.cloudflared/cert.pem` exists, else `cloudflared tunnel login`
3. Prompt for tunnel name (default: `agent-bus-hub`)
4. `cloudflared tunnel create $NAME` — capture UUID from output
5. Prompt for domain
6. Generate `~/.cloudflared/config.yml` from template (sed replace)
7. `cloudflared tunnel route dns $NAME agent-bus.$DOMAIN`
8. `cloudflared tunnel route dns $NAME claw3d.$DOMAIN`
9. Ask: install as LaunchAgent? → `cloudflared service install`
10. Print next steps: create Access application + service token in dashboard

### Step 3: Create LaunchAgent template

`scripts/com.cloudflare.cloudflared.agent-bus.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cloudflare.cloudflared.agent-bus</string>
    <key>ProgramArguments</key>
    <array>
        <string>CLOUDFLARED_PATH</string>
        <string>tunnel</string>
        <string>run</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/cloudflared-agent-bus-out.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/cloudflared-agent-bus-error.log</string>
</dict>
</plist>
```

Note: `cloudflared service install` handles this automatically. Template is fallback only.

### Step 4: Document Cloudflare Access setup

In README, add section for:

1. Creating Access Application in Zero Trust dashboard
   - Domain: `agent-bus.yourdomain.com`
   - Policy: Service Auth
2. Creating Service Token
   - Name: `agent-bus-remote-client`
   - Save Client ID + Client Secret to env vars
3. Testing: `curl -H "CF-Access-Client-Id: ..." -H "CF-Access-Client-Secret: ..." https://agent-bus.yourdomain.com/health`

### Step 5: Add .env.example

Add CF-related vars to `.env.example` (create if not exists):

```bash
# Agent Bus Hub
HUB_URL=http://localhost:4000

# Claw3D Inject
INJECT_SECRET=your-shared-secret-here
CLAW3D_INJECT_URL=http://localhost:3000/api/inject-event

# Cloudflare Access (for remote producers)
CF_CLIENT_ID=
CF_CLIENT_SECRET=

# Remote hub URL (when using CF tunnel)
# HUB_URL=https://agent-bus.yourdomain.com
```

## Todo List

- [ ] Create `scripts/cloudflared-config-template.yml`
- [ ] Create `scripts/setup-cloudflare-tunnel.sh` (interactive)
- [ ] Create LaunchAgent template (fallback)
- [ ] Create `.env.example` with all env vars
- [ ] Add "Remote Access" section to README
- [ ] Document Cloudflare Access + service token setup
- [ ] Test setup script on macOS
- [ ] Verify tunnel health: `cloudflared tunnel info agent-bus-hub`

## Success Criteria

1. `bash scripts/setup-cloudflare-tunnel.sh` completes without errors
2. `curl https://agent-bus.yourdomain.com/health` returns hub stats
3. `curl https://claw3d.yourdomain.com` returns Claw3D page
4. Service token auth works: request with CF headers → 200; without → 403
5. LaunchAgent starts cloudflared on login

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| No Cloudflare account / domain | Med | High | Script checks prerequisites, gives clear error |
| DNS propagation delay | Med | Low | Wait 1-2 min, script hints this |
| LaunchAgent conflicts with existing cloudflared | Low | Med | Use distinct label `com.cloudflare.cloudflared.agent-bus` |

## Security Considerations

- Service token credentials in env vars only — never committed
- Config file permissions: `chmod 600 ~/.cloudflared/config.yml`
- Credentials file: `chmod 600 ~/.cloudflared/<UUID>.json`
- Access policy restricts to service tokens — no open access
- CF tunnel encrypts all traffic (HTTPS between edge and origin)
