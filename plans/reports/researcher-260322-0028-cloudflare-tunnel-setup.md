---
title: Cloudflare Tunnel & Access for Agent Bus Remote Access
date: 2026-03-22
scope: Secure machine-to-machine access to agent-bus hub via cloudflared tunnel + service tokens
---

# Cloudflare Tunnel + Access: Setup Research for Agent Bus

## Executive Summary

Cloudflare Tunnel (cloudflared) + Access service tokens provide secure, free remote access to agent-bus (localhost:4000) without opening ports. Single tunnel routes multiple local services (4000 for hub, 3000 for Claw3D). Service tokens enable machine-to-machine auth via HTTP headers (no user login). Runs as persistent LaunchAgent on macOS.

---

## 1. Installation on macOS

### Via Homebrew (Recommended)
```bash
brew install cloudflared
```

### Via Direct Download
Download latest [Darwin arm64 or amd64](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/) release from Cloudflare.

### Verify Installation
```bash
cloudflared --version
```

---

## 2. Tunnel Setup Workflow (7 Steps)

### Step 1: Authenticate with Cloudflare
```bash
cloudflared tunnel login
```
Opens browser → sign in to Cloudflare account → grants token to cloudflared.

### Step 2: Create Named Tunnel
```bash
cloudflared tunnel create agent-bus-hub
```
Returns Tunnel UUID (e.g., `6ff42ae2-765d-4adf-8112-31c55c1551ef`).
Creates credentials file: `~/.cloudflared/<UUID>.json`

### Step 3: Create config.yml
Location: `~/.cloudflared/config.yml`

```yaml
tunnel: 6ff42ae2-765d-4adf-8112-31c55c1551ef
credentials-file: /Users/username/.cloudflared/6ff42ae2-765d-4adf-8112-31c55c1551ef.json

ingress:
  - hostname: agent-bus.yourdomain.com
    service: http://localhost:4000
  - hostname: claw3d.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

**Critical:** Must end with catch-all `http_status:404` rule.

### Step 4: Route Traffic to Tunnel
Via Cloudflare dashboard:
1. Navigate to Networking > Tunnels
2. Select "agent-bus-hub" tunnel
3. Click "Configure"
4. Add routes:
   - Hostname: `agent-bus.yourdomain.com` → `http://localhost:4000`
   - Hostname: `claw3d.yourdomain.com` → `http://localhost:3000`

Or use CLI:
```bash
cloudflared tunnel route dns agent-bus-hub agent-bus.yourdomain.com
cloudflared tunnel route dns agent-bus-hub claw3d.yourdomain.com
```

### Step 5: Run Tunnel
```bash
cloudflared tunnel run agent-bus-hub
```

Should show: `Cloudflare Tunnel is ready to accept traffic`

### Step 6: Test Access
```bash
curl https://agent-bus.yourdomain.com/health
```

### Step 7: Verify Tunnel Health
```bash
cloudflared tunnel info agent-bus-hub
```

---

## 3. Cloudflare Access: Service Token Setup

### Prerequisites
- Tunnel running and healthy
- Cloudflare account with Zero Trust plan (free tier: 50 users, core access control)

### Create Service Token via Dashboard

1. **Navigate to Access > Applications**
2. **Create or edit application**
   - Name: `agent-bus-hub`
   - Domain: `agent-bus.yourdomain.com`
   - Save application
3. **Add Access Policy:**
   - Click "Add a policy"
   - Policy name: `Service-Token-Auth`
   - Action: **Service Auth**
   - Rules: (Leave empty for all service tokens OR specify identity provider conditions)
4. **Create Service Token:**
   - Navigate to Access > Service Tokens
   - Click "Create"
   - Name: `agent-bus-remote-client`
   - Expiration: 1 year (or custom)
   - Click "Create"
   - **Copy and save:**
     - Client ID: `abc123...`
     - Client Secret: `xyz789...` (only shown once!)

### Example Access Policy (Service Auth)
```
Policy Name: Service-Token-Auth
Action: Service Auth
Rule: (no conditions = all service tokens allowed, OR add specific IdP/device checks)
```

---

## 4. Service Token Authentication Headers

### Two-Header Method (Recommended)
```bash
curl -H "CF-Access-Client-Id: <CLIENT_ID>" \
     -H "CF-Access-Client-Secret: <CLIENT_SECRET>" \
     https://agent-bus.yourdomain.com/events
```

### Single-Header Method (For tools supporting only Authorization)
```bash
curl -H "Authorization: {\"cf-access-client-id\": \"<CLIENT_ID>\", \"cf-access-client-secret\": \"<CLIENT_SECRET>\"}" \
     https://agent-bus.yourdomain.com/events
```

### Token Exchange Flow
1. Client sends request with `CF-Access-Client-Id` + `CF-Access-Client-Secret` headers
2. Cloudflare Access validates credentials
3. Cloudflare returns `CF_Authorization` JWT cookie (valid until expiration)
4. Client can reuse cookie on subsequent requests OR resend headers

### Node.js Client Example
```javascript
const https = require('https');

const options = {
  hostname: 'agent-bus.yourdomain.com',
  port: 443,
  path: '/events',
  method: 'POST',
  headers: {
    'CF-Access-Client-Id': process.env.CF_CLIENT_ID,
    'CF-Access-Client-Secret': process.env.CF_CLIENT_SECRET,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
});

req.write(JSON.stringify({
  agent: 'remote-client',
  event: 'heartbeat',
  project: 'brainstorm'
}));
req.end();
```

---

## 5. macOS LaunchAgent for Persistence

### Install as LaunchAgent
```bash
cloudflared service install
```
Creates plist at: `~/Library/LaunchAgents/com.cloudflare.cloudflared.plist`

Automatically starts cloudflared whenever you log in using config from `~/.cloudflared/config.yml`.

### Manual LaunchAgent Setup (If needed)
Create `~/Library/LaunchAgents/com.cloudflare.cloudflared.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cloudflare.cloudflared</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/cloudflared</string>
        <string>tunnel</string>
        <string>run</string>
        <string>agent-bus-hub</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/cloudflared-out.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/cloudflared-error.log</string>
</dict>
</plist>
```

### Manage LaunchAgent
```bash
# Load service
launchctl load ~/Library/LaunchAgents/com.cloudflare.cloudflared.plist

# Unload service
launchctl unload ~/Library/LaunchAgents/com.cloudflare.cloudflared.plist

# Check status
launchctl list | grep cloudflare

# View logs
log stream --predicate 'process == "cloudflared"'
```

---

## 6. Free Tier Limitations

| Feature | Free Tier |
|---------|-----------|
| **Tunnels** | Unlimited |
| **Routes** | No explicit limit documented |
| **Service Tokens** | Free (up to 50 Zero Trust users) |
| **Access Applications** | 500 max per account |
| **Log Retention** | 24 hours |
| **Total Users** | 50 (team seats) |
| **Quick Tunnels (TryCloudflare)** | 200 concurrent requests, no SSE support |

**Agent-Bus Use Case:** All features needed fit within free tier (1 tunnel, 2 routes, 1 service token, <50 users).

---

## 7. Multi-Port Routing Example

Agent Bus scenario: hub on :4000, Claw3D on :3000.

### config.yml
```yaml
tunnel: 6ff42ae2-765d-4adf-8112-31c55c1551ef
credentials-file: ~/.cloudflared/6ff42ae2-765d-4adf-8112-31c55c1551ef.json

ingress:
  # Agent Bus Hub
  - hostname: agent-bus.example.com
    service: http://localhost:4000

  # Claw3D Visualization
  - hostname: claw3d.example.com
    service: http://localhost:3000

  # Wildcard for subdomains (optional)
  - hostname: "*.agent-bus.example.com"
    service: http://localhost:4000

  # Catch-all (REQUIRED)
  - service: http_status:404
```

### DNS Routing (Dashboard)
1. Networking > Tunnels > agent-bus-hub > Configure
2. Add Public Hostname:
   - Domain: `agent-bus.example.com`
   - Service: `http://localhost:4000`
   - Save
3. Repeat for `claw3d.example.com` → `http://localhost:3000`

---

## 8. Security Best Practices

1. **Service Token Storage:**
   - Store `CF_CLIENT_ID` + `CF_CLIENT_SECRET` in environment variables
   - Never commit to git
   - Rotate tokens annually

2. **Access Policies:**
   - Use "Service Auth" action for machine-to-machine
   - Add IdP checks if identity verification needed
   - Combine with IP allowlists for additional security

3. **Tunnel Security:**
   - config.yml permissions: `chmod 600 ~/.cloudflared/config.yml`
   - Credentials file: `chmod 600 ~/.cloudflared/<UUID>.json`

4. **LaunchAgent:**
   - Set plist permissions: `chmod 600 ~/Library/LaunchAgents/com.cloudflare.cloudflared.plist`

---

## 9. Implementation Checklist

- [ ] Install cloudflared via Homebrew
- [ ] Create named tunnel (`cloudflared tunnel create agent-bus-hub`)
- [ ] Create ~/.cloudflared/config.yml with multi-port ingress rules
- [ ] Route domains via dashboard or CLI
- [ ] Test tunnel: `curl https://agent-bus.yourdomain.com`
- [ ] Create Cloudflare Zero Trust Access application
- [ ] Create Service Auth policy
- [ ] Generate service token (save Client ID + Secret securely)
- [ ] Test service token auth: `curl -H "CF-Access-Client-Id: ..." https://agent-bus.yourdomain.com`
- [ ] Install as LaunchAgent: `cloudflared service install`
- [ ] Verify LaunchAgent runs at login: `launchctl list | grep cloudflare`
- [ ] Document service token env vars in project README

---

## 10. References

- [Run cloudflared as service on macOS](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/as-a-service/macos/)
- [Setup Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/setup/)
- [Create locally-managed tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/)
- [Service tokens documentation](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
- [Configuration file format](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/)
- [Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [cloudflared GitHub](https://github.com/cloudflare/cloudflared)

---

## Unresolved Questions

1. **Path-based routing:** Can ingress rules route `/api/*` to 4000 and `/viz/*` to 3000 on same hostname? (Docs mention path matching support but no concrete example shown.)
2. **Token expiration behavior:** What happens to in-flight requests when service token expires? Are they immediately rejected or allowed to complete?
3. **Rate limiting:** Are service tokens subject to Cloudflare's DDoS protection or WAF rules by default?
