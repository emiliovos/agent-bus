# Fix: Agent Shows Idle Instead of Working

## Root Cause

Two conditions needed for the working latch:
1. `payload.runId` must be non-empty string — **WE HAVE THIS** (translateEvent includes runId)
2. `resolveAgentIdForSessionKey(agents, sessionKey)` must return a match — **THIS FAILS**

`resolveAgentIdForSessionKey` looks up `sessionKey` against agents in Claw3D's Zustand store. Our agents aren't properly hydrated in the store because the `agents.list` RPC response format doesn't match what Claw3D's hydration expects.

## Fix Steps

1. **Trace the hydration path:** How does `agents.list` response get into the Zustand agent store?
   - File: `src/features/agents/state/agentFleetHydration.ts`
   - The `hydrateAgents` action requires specific `AgentStoreSeed` shape

2. **Match our `agents.list` response to `AgentStoreSeed`:** Each agent needs:
   ```typescript
   {
     agentId: string,       // must match what resolveAgentIdForSessionKey expects
     sessionKey: string,    // must match event payload sessionKey
     name: string,
     identity: { ... }
   }
   ```

3. **Verify sessionKey matching:** Our events use `agent:<agentId>:main`. The store agents must have the same sessionKey format.

## Estimated Fix

~30 min — adjust gateway's `agents.list` response format to match `AgentStoreSeed` shape. No new files needed.

## Key Code References

- `eventTriggers.ts:913` — `if (payload.runId)` triggers working
- `eventTriggers.ts:905-909` — `resolveAgentIdForSessionKey` must return non-null
- `GatewayClient.ts:73-75` — `parseAgentIdFromSessionKey` extracts `agent:<ID>:` → returns `<ID>`
- `agentFleetHydration.ts` — how agents enter the store from `agents.list`
- `runtimeEventBridge.ts:66-74` — `ChatEventPayload` type definition
