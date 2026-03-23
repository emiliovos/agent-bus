import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createEventHub } from '../src/hub/event-hub.js';
import { createGateway } from '../src/gateway/agent-bus-gateway.js';
import { AgentRegistry } from '../src/gateway/agent-registry.js';
import { handleRpc, isValidRpc } from '../src/gateway/protocol-handler.js';
import type { AgentEvent } from '../src/types/agent-event.js';
import WebSocket from 'ws';
import { rm } from 'node:fs/promises';

// --- Unit tests: AgentRegistry ---

describe('AgentRegistry', () => {
  it('registers agent on session_start', () => {
    const reg = new AgentRegistry();
    const { agentChanged } = reg.handleEvent({
      ts: 1000, agent: 'dev', project: 'tickets', event: 'session_start',
    });
    expect(agentChanged).toBe(true);
    expect(reg.getAgents()).toHaveLength(1);
    expect(reg.getAgents()[0].status).toBe('active');
  });

  it('sets agent idle on session_end', () => {
    const reg = new AgentRegistry();
    reg.handleEvent({ ts: 1000, agent: 'dev', project: 'p', event: 'session_start' });
    reg.handleEvent({ ts: 2000, agent: 'dev', project: 'p', event: 'session_end' });
    expect(reg.getAgents()[0].status).toBe('idle');
  });

  it('auto-registers agent on tool_use without session_start', () => {
    const reg = new AgentRegistry();
    reg.handleEvent({ ts: 1000, agent: 'qa', project: 'p', event: 'tool_use', tool: 'Edit' });
    expect(reg.getAgents()).toHaveLength(1);
    expect(reg.getAgents()[0].id).toBe('qa');
  });

  it('stores chat messages in ring buffer', () => {
    const reg = new AgentRegistry();
    reg.handleEvent({ ts: 1000, agent: 'dev', project: 'p', event: 'session_start' });
    for (let i = 0; i < 5; i++) {
      reg.handleEvent({ ts: 2000 + i, agent: 'dev', project: 'p', event: 'tool_use', tool: `Tool${i}` });
    }
    const sessionKey = reg.getSessions()[0].sessionKey;
    const msgs = reg.getSessionMessages(sessionKey);
    expect(msgs).toHaveLength(5);
    expect(msgs[0].content).toContain('Tool0');
  });

  it('caps ring buffer at 100 messages', () => {
    const reg = new AgentRegistry();
    reg.handleEvent({ ts: 1000, agent: 'dev', project: 'p', event: 'session_start' });
    for (let i = 0; i < 110; i++) {
      reg.handleEvent({ ts: 2000 + i, agent: 'dev', project: 'p', event: 'tool_use', tool: `T${i}` });
    }
    const sessionKey = reg.getSessions()[0].sessionKey;
    expect(reg.getSessionMessages(sessionKey)).toHaveLength(100);
  });

  it('increments stateVersion on agent changes', () => {
    const reg = new AgentRegistry();
    const v0 = reg.stateVersion.presence;
    reg.handleEvent({ ts: 1000, agent: 'dev', project: 'p', event: 'session_start' });
    expect(reg.stateVersion.presence).toBe(v0 + 1);
    reg.handleEvent({ ts: 2000, agent: 'dev', project: 'p', event: 'session_end' });
    expect(reg.stateVersion.presence).toBe(v0 + 2);
  });

  it('derives agent name from ID', () => {
    const reg = new AgentRegistry();
    reg.handleEvent({ ts: 1000, agent: 'backend-dev', project: 'p', event: 'session_start' });
    expect(reg.getAgents()[0].identity.name).toBe('Backend Dev');
  });

  it('returns empty messages for unknown session', () => {
    const reg = new AgentRegistry();
    expect(reg.getSessionMessages('nonexistent')).toEqual([]);
  });

  it('translates tool_use into lifecycle start + chat frames (new agent)', () => {
    const reg = new AgentRegistry();
    const { frames } = reg.handleEvent({ ts: 1000, agent: 'dev', project: 'p', event: 'tool_use', tool: 'Edit', file: 'auth.ts' });
    // New agent → lifecycle start + chat frame
    expect(frames).toHaveLength(2);
    expect(frames[0].event).toBe('agent');
    expect(frames[0].payload.data?.phase).toBe('start');
    expect(frames[1].event).toBe('chat');
    expect(frames[1].payload.message).toBe('Using Edit on auth.ts');
  });

  it('sends only chat frame for already-active agent', () => {
    const reg = new AgentRegistry();
    reg.handleEvent({ ts: 1000, agent: 'dev', project: 'p', event: 'session_start' });
    const { frames } = reg.handleEvent({ ts: 2000, agent: 'dev', project: 'p', event: 'tool_use', tool: 'Read' });
    // Already active → only chat frame, no lifecycle start
    expect(frames).toHaveLength(1);
    expect(frames[0].event).toBe('chat');
  });

  it('sends lifecycle start when idle agent resumes', () => {
    const reg = new AgentRegistry();
    reg.handleEvent({ ts: 1000, agent: 'dev', project: 'p', event: 'session_start' });
    reg.handleEvent({ ts: 2000, agent: 'dev', project: 'p', event: 'session_end' });
    expect(reg.getAgents()[0].status).toBe('idle');
    const { frames } = reg.handleEvent({ ts: 3000, agent: 'dev', project: 'p', event: 'tool_use', tool: 'Edit' });
    // idle→active → lifecycle start + chat frame
    expect(frames).toHaveLength(2);
    expect(frames[0].event).toBe('agent');
    expect(frames[0].payload.data?.phase).toBe('start');
    expect(frames[1].event).toBe('chat');
  });

  it('returns empty frames for heartbeat', () => {
    const reg = new AgentRegistry();
    const { frames } = reg.handleEvent({ ts: 1000, agent: 'dev', project: 'p', event: 'heartbeat' });
    expect(frames).toHaveLength(0);
  });
});

// --- Unit tests: Protocol Handler ---

describe('Protocol Handler', () => {
  const ctx = { connId: 'ws-0', startTime: Date.now(), hubUrl: 'ws://localhost:4000' };

  it('isValidRpc rejects non-req types', () => {
    expect(isValidRpc({ type: 'event', id: '1', method: 'x' })).toBe(false);
    expect(isValidRpc(null)).toBe(false);
    expect(isValidRpc('string')).toBe(false);
  });

  it('isValidRpc accepts valid req', () => {
    expect(isValidRpc({ type: 'req', id: '1', method: 'health' })).toBe(true);
  });

  it('connect returns hello-ok', async () => {
    const reg = new AgentRegistry();
    const res = await handleRpc({ type: 'req', id: 'c1', method: 'connect', params: { minProtocol: 2, maxProtocol: 2 } }, reg, ctx);
    expect(res.ok).toBe(true);
    expect((res.payload as Record<string, unknown>).type).toBe('hello-ok');
    expect((res.payload as Record<string, unknown>).protocol).toBe(2);
  });

  it('health returns ok', async () => {
    const reg = new AgentRegistry();
    const res = await handleRpc({ type: 'req', id: '1', method: 'health' }, reg, ctx);
    expect(res.ok).toBe(true);
  });

  it('agents.list returns agents from registry', async () => {
    const reg = new AgentRegistry();
    reg.handleEvent({ ts: 1000, agent: 'dev', project: 'p', event: 'session_start' });
    const res = await handleRpc({ type: 'req', id: '1', method: 'agents.list' }, reg, ctx);
    expect(res.ok).toBe(true);
    const agents = (res.payload as Record<string, unknown>).agents as unknown[];
    expect(agents).toHaveLength(1);
  });

  it('config.get returns agent config', async () => {
    const reg = new AgentRegistry();
    reg.handleEvent({ ts: 1000, agent: 'dev', project: 'p', event: 'session_start' });
    const res = await handleRpc({ type: 'req', id: '1', method: 'config.get', params: { agentId: 'dev' } }, reg, ctx);
    expect(res.ok).toBe(true);
  });

  it('config.get returns empty list for empty registry', async () => {
    const reg = new AgentRegistry();
    const res = await handleRpc({ type: 'req', id: '1', method: 'config.get', params: {} }, reg, ctx);
    expect(res.ok).toBe(true);
    const config = (res.payload as Record<string, unknown>).config as Record<string, unknown>;
    expect((config.agents as Record<string, unknown[]>).list).toHaveLength(0);
  });

  it('sessions.list returns sessions', async () => {
    const reg = new AgentRegistry();
    reg.handleEvent({ ts: 1000, agent: 'dev', project: 'p', event: 'session_start' });
    const res = await handleRpc({ type: 'req', id: '1', method: 'sessions.list' }, reg, ctx);
    const sessions = (res.payload as Record<string, unknown>).sessions as unknown[];
    expect(sessions).toHaveLength(1);
  });

  it('sessions.preview returns messages', async () => {
    const reg = new AgentRegistry();
    reg.handleEvent({ ts: 1000, agent: 'dev', project: 'p', event: 'session_start' });
    reg.handleEvent({ ts: 2000, agent: 'dev', project: 'p', event: 'tool_use', tool: 'Read' });
    const sessionKey = reg.getSessions()[0].sessionKey;
    const res = await handleRpc({ type: 'req', id: '1', method: 'sessions.preview', params: { sessionKey } }, reg, ctx);
    const msgs = (res.payload as Record<string, unknown>).messages as unknown[];
    expect(msgs).toHaveLength(1);
  });

  it('exec.approvals.get returns empty', async () => {
    const reg = new AgentRegistry();
    const res = await handleRpc({ type: 'req', id: '1', method: 'exec.approvals.get' }, reg, ctx);
    expect((res.payload as Record<string, unknown>).approvals).toEqual([]);
  });

  it('unknown method returns error', async () => {
    const reg = new AgentRegistry();
    const res = await handleRpc({ type: 'req', id: '1', method: 'nonexistent' }, reg, ctx);
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('unknown_method');
  });

  it('chat.send returns not delivered without hub', async () => {
    const reg = new AgentRegistry();
    const res = await handleRpc({ type: 'req', id: '1', method: 'chat.send', params: { sessionKey: 'x', message: 'hi' } }, reg, ctx);
    expect(res.ok).toBe(true);
    expect((res.payload as Record<string, unknown>).delivered).toBe(false);
  });

  it('chat.abort returns aborted false', async () => {
    const reg = new AgentRegistry();
    const res = await handleRpc({ type: 'req', id: '1', method: 'chat.abort', params: { sessionKey: 'x' } }, reg, ctx);
    expect(res.ok).toBe(true);
    expect((res.payload as Record<string, unknown>).aborted).toBe(false);
  });
});

// --- Integration test: Gateway + Hub ---

const HUB_PORT = 4555;
const GW_PORT = 18899;
const LOG_DIR = 'data/test-gw';

describe('Gateway integration', () => {
  let hub: ReturnType<typeof createEventHub>;
  let gw: ReturnType<typeof createGateway>;

  beforeAll(async () => {
    hub = createEventHub({ port: HUB_PORT, logDir: LOG_DIR });
    await hub.listen();
    gw = createGateway({ port: GW_PORT, hubUrl: `ws://localhost:${HUB_PORT}` });
    gw.start();
    // Wait for gateway to connect to hub
    await new Promise((r) => setTimeout(r, 500));
  });

  afterAll(async () => {
    await gw.stop();
    await hub.close();
    await rm(LOG_DIR, { recursive: true, force: true });
  });

  it('gateway connects to hub', () => {
    expect(gw.stats.hubConnected).toBe(true);
  });

  it('browser can connect and get hello-ok', async () => {
    const ws = new WebSocket(`ws://localhost:${GW_PORT}`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    // Send connect
    ws.send(JSON.stringify({ type: 'req', id: 'c1', method: 'connect', params: { minProtocol: 2, maxProtocol: 2 } }));

    const msg = await new Promise<string>((resolve) => ws.on('message', (d: Buffer) => resolve(d.toString())));
    const res = JSON.parse(msg);
    expect(res.ok).toBe(true);
    expect(res.payload.type).toBe('hello-ok');
    expect(res.payload.protocol).toBe(2);

    ws.close();
  });

  it('hub event flows to connected browser client', async () => {
    const ws = new WebSocket(`ws://localhost:${GW_PORT}`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    // Connect handshake
    ws.send(JSON.stringify({ type: 'req', id: 'c1', method: 'connect', params: {} }));
    await new Promise<string>((resolve) => ws.on('message', (d: Buffer) => resolve(d.toString())));

    // Collect subsequent messages
    const received: unknown[] = [];
    ws.on('message', (d: Buffer) => received.push(JSON.parse(d.toString())));

    // Publish event to hub
    await fetch(`http://localhost:${HUB_PORT}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'gw-test', project: 'integration', event: 'session_start' }),
    });

    await new Promise((r) => setTimeout(r, 300));

    // Should have received at least an agent lifecycle frame + presence event
    expect(received.length).toBeGreaterThanOrEqual(1);
    const agentFrame = received.find((r) => (r as Record<string, unknown>).event === 'agent');
    expect(agentFrame).toBeDefined();

    ws.close();
  });

  it('agents.list reflects hub events', async () => {
    // Agent was registered by previous test
    const ws = new WebSocket(`ws://localhost:${GW_PORT}`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    ws.send(JSON.stringify({ type: 'req', id: 'c1', method: 'connect', params: {} }));
    await new Promise<string>((resolve) => ws.on('message', (d: Buffer) => resolve(d.toString())));

    ws.send(JSON.stringify({ type: 'req', id: 'a1', method: 'agents.list' }));
    const msg = await new Promise<string>((resolve) => ws.on('message', (d: Buffer) => resolve(d.toString())));
    const res = JSON.parse(msg);
    expect(res.ok).toBe(true);
    expect((res.payload.agents as unknown[]).length).toBeGreaterThanOrEqual(1);

    ws.close();
  });

  it('rejects messages before connect handshake', async () => {
    const ws = new WebSocket(`ws://localhost:${GW_PORT}`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    ws.send(JSON.stringify({ type: 'req', id: '1', method: 'health' }));
    const msg = await new Promise<string>((resolve) => ws.on('message', (d: Buffer) => resolve(d.toString())));
    const res = JSON.parse(msg);
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('connect_required');
  });
});
