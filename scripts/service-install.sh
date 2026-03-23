#!/usr/bin/env bash
# Install Agent Bus hub + gateway as macOS LaunchAgents
# Usage: bash scripts/service-install.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_PATH="$(which node)"
HOME_DIR="$HOME"
LA_DIR="$HOME_DIR/Library/LaunchAgents"

echo "=== Agent Bus LaunchAgent Install ==="
echo "Repo: $REPO_DIR"
echo "Node: $NODE_PATH"
echo ""

# Build first
echo "[1/4] Building TypeScript..."
npm run build --prefix "$REPO_DIR"

# Generate hub plist
echo "[2/4] Installing hub LaunchAgent..."
cat > "$LA_DIR/com.agentbus.hub.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.agentbus.hub</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_PATH}</string>
    <string>${REPO_DIR}/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${REPO_DIR}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>4000</string>
    <key>LOG_DIR</key><string>data</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key>
  <string>${HOME_DIR}/Library/Logs/com.agentbus.hub.log</string>
  <key>StandardErrorPath</key>
  <string>${HOME_DIR}/Library/Logs/com.agentbus.hub.log</string>
</dict>
</plist>
EOF

# Generate gateway plist
echo "[3/4] Installing gateway LaunchAgent..."
cat > "$LA_DIR/com.agentbus.gateway.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.agentbus.gateway</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_PATH}</string>
    <string>${REPO_DIR}/dist/gateway/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${REPO_DIR}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HUB_URL</key><string>ws://localhost:4000</string>
    <key>GATEWAY_PORT</key><string>18789</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key>
  <string>${HOME_DIR}/Library/Logs/com.agentbus.gateway.log</string>
  <key>StandardErrorPath</key>
  <string>${HOME_DIR}/Library/Logs/com.agentbus.gateway.log</string>
</dict>
</plist>
EOF

# Load both
echo "[4/4] Loading services..."
launchctl load "$LA_DIR/com.agentbus.hub.plist" 2>/dev/null || echo "  hub already loaded"
sleep 2
launchctl load "$LA_DIR/com.agentbus.gateway.plist" 2>/dev/null || echo "  gateway already loaded"

echo ""
echo "=== Done ==="
echo "Hub:     launchctl list | grep agentbus.hub"
echo "Gateway: launchctl list | grep agentbus.gateway"
echo "Logs:    ~/Library/Logs/com.agentbus.*.log"
