# Phase 3 — Claude Code Hooks Integration

**Priority:** P1
**Status:** Not started
**Effort:** ~30min
**Depends on:** Phase 1

## Overview

Configure Claude Code hooks to fire events to the agent-bus on every tool use, session start/stop.

## Implementation Steps

1. **Create hook script** (`scripts/hook-post-tool-use.sh`)
   - Reads CLAUDE_TOOL_NAME env var
   - POSTs to agent-bus with agent name, project, tool
   - Fails silently (don't block Claude Code)
   - Timeout: 1s max

2. **Create settings template** (`scripts/claude-settings-template.json`)
   - PostToolUse hook → calls hook script
   - Stop hook → sends session_end event
   - Configurable HUB_URL for remote VPS usage

3. **Document installation** in README
   - Copy hook script to VPS/local machine
   - Merge settings into `.claude/settings.json`
   - Set HUB_URL env var if remote

## Files to Create

- `scripts/hook-post-tool-use.sh`
- `scripts/claude-settings-template.json`

## Success Criteria

- [ ] Claude Code session fires tool → event appears in hub
- [ ] Claw3D shows agent working (via phase 2 adapter)
- [ ] Hook doesn't slow down Claude Code (1s timeout, async)
- [ ] Works on Mac Mini (localhost) and VPS (remote URL)

## Todo

- [ ] scripts/hook-post-tool-use.sh
- [ ] scripts/claude-settings-template.json
- [ ] Test on local Claude Code session
