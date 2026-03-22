import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createEventHub } from '../src/hub/event-hub.js';
import { rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';

const TEST_PORT = 4444;
const TEST_LOG_DIR = 'data/test';
const BASE_URL = `http://localhost:${TEST_PORT}`;

const validEvent = {
  agent: 'test-agent',
  project: 'test-project',
  event: 'tool_use',
  tool: 'Edit',
  file: 'auth.ts',
};

let hub: ReturnType<typeof createEventHub>;

beforeAll(async () => {
  hub = createEventHub({ port: TEST_PORT, logDir: TEST_LOG_DIR });
  await hub.listen();
});

afterAll(async () => {
  await hub.close();
  // Cleanup test log directory
  await rm(TEST_LOG_DIR, { recursive: true, force: true });
});

describe('POST /events', () => {
  it('accepts valid event and returns 200', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validEvent),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.ts).toBeTypeOf('number');
  });

  it('rejects invalid JSON with 400', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid JSON');
  });

  it('rejects invalid event schema with 400', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'x' }), // missing required fields
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid event schema');
  });

  it('rejects unknown event type with 400', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validEvent, event: 'unknown_event' }),
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  it('returns hub stats', async () => {
    const res = await fetch(`${BASE_URL}/health`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.clients).toBeTypeOf('number');
    expect(body.events).toBeTypeOf('number');
  });
});

describe('WebSocket broadcast', () => {
  it('broadcasts events to connected consumers', async () => {
    // Connect a WS consumer
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    // Collect received messages
    const received: unknown[] = [];
    ws.on('message', (data: Buffer) => {
      received.push(JSON.parse(data.toString()));
    });

    // Publish an event via HTTP
    await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validEvent),
    });

    // Wait briefly for broadcast delivery
    await new Promise((r) => setTimeout(r, 100));

    expect(received.length).toBe(1);
    expect((received[0] as Record<string, unknown>).agent).toBe('test-agent');
    expect((received[0] as Record<string, unknown>).ts).toBeTypeOf('number');

    ws.close();
  });
});

describe('JSONL logging', () => {
  it('writes events to jsonl file', async () => {
    // Post an event to ensure at least one log entry
    await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validEvent, message: 'log-test' }),
    });

    // Small delay for file write
    await new Promise((r) => setTimeout(r, 100));

    const logPath = join(TEST_LOG_DIR, 'events.jsonl');
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines.length).toBeGreaterThanOrEqual(1);

    // Verify last line is valid JSON with expected fields
    const lastEvent = JSON.parse(lines[lines.length - 1]);
    expect(lastEvent.agent).toBe('test-agent');
    expect(lastEvent.message).toBe('log-test');
    expect(lastEvent.ts).toBeTypeOf('number');
  });
});

describe('404 for unknown routes', () => {
  it('returns 404 for unknown path', async () => {
    const res = await fetch(`${BASE_URL}/unknown`);
    expect(res.status).toBe(404);
  });
});

describe('Event validation - schema edge cases', () => {
  it('rejects event with missing agent field', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'test', event: 'tool_use' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid event schema');
  });

  it('rejects event with empty agent string', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: '', project: 'test', event: 'tool_use' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects event with missing project field', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'test', event: 'tool_use' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects event with empty project string', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'test', project: '', event: 'tool_use' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects event with missing event field', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'test', project: 'test' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects event with invalid tool field type', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'test',
        project: 'test',
        event: 'tool_use',
        tool: 123,
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects event with invalid file field type', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'test',
        project: 'test',
        event: 'tool_use',
        file: { path: 'test.ts' },
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects event with invalid message field type', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'test',
        project: 'test',
        event: 'tool_use',
        message: ['not', 'a', 'string'],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects event with invalid ts field type', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'test',
        project: 'test',
        event: 'tool_use',
        ts: 'not-a-number',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects event with non-object payload', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(['not', 'an', 'object']),
    });
    expect(res.status).toBe(400);
  });

  it('rejects event with null payload', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(null),
    });
    expect(res.status).toBe(400);
  });
});

describe('Event validation - all event types', () => {
  it('accepts session_start event', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'test',
        project: 'test',
        event: 'session_start',
      }),
    });
    expect(res.status).toBe(200);
  });

  it('accepts session_end event', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'test',
        project: 'test',
        event: 'session_end',
      }),
    });
    expect(res.status).toBe(200);
  });

  it('accepts task_complete event', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'test',
        project: 'test',
        event: 'task_complete',
      }),
    });
    expect(res.status).toBe(200);
  });

  it('accepts heartbeat event', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'test',
        project: 'test',
        event: 'heartbeat',
      }),
    });
    expect(res.status).toBe(200);
  });
});

describe('Event timestamp handling', () => {
  it('adds timestamp to event when not provided', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'test',
        project: 'test',
        event: 'tool_use',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ts).toBeTypeOf('number');
    expect(body.ts).toBeGreaterThan(0);
  });

  it('preserves custom timestamp when provided', async () => {
    const customTs = 1000000000;
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'test',
        project: 'test',
        event: 'tool_use',
        ts: customTs,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ts).toBe(customTs);
  });
});

describe('Hub statistics', () => {
  it('increments event count on each POST', async () => {
    const before = hub.stats.events;

    await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validEvent),
    });

    const after = hub.stats.events;
    expect(after).toBe(before + 1);
  });

  it('counts active WebSocket clients', async () => {
    const beforeCount = hub.stats.clients;

    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const duringCount = hub.stats.clients;
    expect(duringCount).toBe(beforeCount + 1);

    ws.close();
    // Give server time to process close
    await new Promise((r) => setTimeout(r, 50));

    const afterCount = hub.stats.clients;
    expect(afterCount).toBe(beforeCount);
  });
});

describe('CORS headers', () => {
  it('includes CORS headers on OPTIONS preflight', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'OPTIONS',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
  });

  it('includes CORS headers on successful POST', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validEvent),
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('Event with minimal fields', () => {
  it('accepts event with only required fields', async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'minimal',
        project: 'minimal',
        event: 'heartbeat',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.ts).toBeTypeOf('number');
  });

  it('broadcasts event with only required fields', async () => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const received: unknown[] = [];
    ws.on('message', (data: Buffer) => {
      received.push(JSON.parse(data.toString()));
    });

    await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'minimal2',
        project: 'minimal2',
        event: 'session_start',
      }),
    });

    await new Promise((r) => setTimeout(r, 100));

    expect(received.length).toBeGreaterThanOrEqual(1);
    const event = received.find(
      (e) => (e as Record<string, unknown>).agent === 'minimal2'
    );
    expect(event).toBeDefined();
    expect((event as Record<string, unknown>).tool).toBeUndefined();
    expect((event as Record<string, unknown>).file).toBeUndefined();
    expect((event as Record<string, unknown>).message).toBeUndefined();

    ws.close();
  });
});
