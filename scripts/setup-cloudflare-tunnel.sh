#!/usr/bin/env bash
# Interactive Cloudflare Tunnel setup for Agent Bus
# Routes hub (:4000) and Claw3D (:3000) via CF tunnel
set -euo pipefail

echo "=== Agent Bus — Cloudflare Tunnel Setup ==="
echo ""

# 1. Check/install cloudflared
if ! command -v cloudflared &> /dev/null; then
  echo "[1/7] Installing cloudflared via Homebrew..."
  brew install cloudflared
else
  echo "[1/7] cloudflared already installed: $(cloudflared --version)"
fi

# 2. Check auth
if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
  echo "[2/7] Authenticating with Cloudflare (opens browser)..."
  cloudflared tunnel login
else
  echo "[2/7] Already authenticated with Cloudflare"
fi

# 3. Tunnel name
read -r -p "[3/7] Tunnel name (default: agent-bus-hub): " TUNNEL_NAME
TUNNEL_NAME="${TUNNEL_NAME:-agent-bus-hub}"

# Check if tunnel exists
if cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
  echo "  Tunnel '$TUNNEL_NAME' already exists"
  TUNNEL_UUID=$(cloudflared tunnel list 2>/dev/null | grep "$TUNNEL_NAME" | awk '{print $1}')
else
  echo "  Creating tunnel '$TUNNEL_NAME'..."
  TUNNEL_OUTPUT=$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1)
  TUNNEL_UUID=$(echo "$TUNNEL_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
fi

echo "  Tunnel UUID: $TUNNEL_UUID"

# 4. Domain
read -r -p "[4/7] Your Cloudflare domain (e.g., example.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
  echo "  Error: domain is required"
  exit 1
fi

# 5. Generate config
CONFIG_FILE="$HOME/.cloudflared/config.yml"
echo "[5/7] Writing config to $CONFIG_FILE..."
cat > "$CONFIG_FILE" << EOF
tunnel: ${TUNNEL_UUID}
credentials-file: ${HOME}/.cloudflared/${TUNNEL_UUID}.json

ingress:
  - hostname: agent-bus.${DOMAIN}
    service: http://localhost:4000
  - hostname: claw3d.${DOMAIN}
    service: http://localhost:3000
  - service: http_status:404
EOF
chmod 600 "$CONFIG_FILE"

# 6. Route DNS
echo "[6/7] Routing DNS..."
cloudflared tunnel route dns "$TUNNEL_NAME" "agent-bus.${DOMAIN}" 2>/dev/null || echo "  DNS route may already exist"
cloudflared tunnel route dns "$TUNNEL_NAME" "claw3d.${DOMAIN}" 2>/dev/null || echo "  DNS route may already exist"

# 7. LaunchAgent
read -r -p "[7/7] Install as LaunchAgent (auto-start on login)? [y/N]: " INSTALL_LA
if [[ "$INSTALL_LA" =~ ^[Yy]$ ]]; then
  cloudflared service install 2>/dev/null || echo "  LaunchAgent may already be installed"
  echo "  LaunchAgent installed"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Test: cloudflared tunnel run ${TUNNEL_NAME}"
echo "Hub:  https://agent-bus.${DOMAIN}/health"
echo "Viz:  https://claw3d.${DOMAIN}"
echo ""
echo "Next steps:"
echo "  1. Go to Cloudflare Zero Trust dashboard"
echo "  2. Create Access Application for agent-bus.${DOMAIN}"
echo "  3. Add Service Auth policy"
echo "  4. Create Service Token → save CF_CLIENT_ID + CF_CLIENT_SECRET"
echo "  5. Set env vars on remote machines:"
echo "     export HUB_URL=https://agent-bus.${DOMAIN}"
echo "     export CF_CLIENT_ID=<your-client-id>"
echo "     export CF_CLIENT_SECRET=<your-client-secret>"
