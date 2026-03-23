#!/usr/bin/env bash
# Uninstall Agent Bus LaunchAgents
# Usage: bash scripts/service-uninstall.sh
set -euo pipefail

LA_DIR="$HOME/Library/LaunchAgents"

echo "=== Agent Bus LaunchAgent Uninstall ==="

launchctl unload "$LA_DIR/com.agentbus.hub.plist" 2>/dev/null && echo "Hub unloaded" || echo "Hub not loaded"
launchctl unload "$LA_DIR/com.agentbus.gateway.plist" 2>/dev/null && echo "Gateway unloaded" || echo "Gateway not loaded"

rm -f "$LA_DIR/com.agentbus.hub.plist" "$LA_DIR/com.agentbus.gateway.plist"
echo "Plist files removed"
echo "Done"
