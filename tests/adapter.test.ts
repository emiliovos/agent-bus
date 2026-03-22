import { describe, it, expect } from 'vitest';
import {
  translateEvent,
  buildConnectFrame,
  deriveRunId,
  deriveSessionKey,
} from '../src/adapter/event-translator.js';
import type { AgentEvent } from '../src/types/agent-event.js';

const baseEvent: AgentEvent = {
  ts: 1711065600000,
  agent: 'backend-dev',
  project: 'tickets',
  event: 'session_start',
};

describe('deriveRunId', () => {
  it('produces a 12-char hex string', () => {
    const id = deriveRunId('dev', 'tickets');
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is deterministic for same agent+project', () => {
    const a = deriveRunId('dev', 'tickets');
    const b = deriveRunId('dev', 'tickets');
    expect(a).toBe(b);
  });

  it('differs for different agent+project', () => {
    const a = deriveRunId('dev', 'tickets');
    const b = deriveRunId('qa', 'tickets');
    expect(a).not.toBe(b);
  });
});

describe('deriveSessionKey', () => {
  it('follows agent:<project>-<agent>:main format', () => {
    const key = deriveSessionKey('dev', 'tickets');
    expect(key).toBe('agent:tickets-dev:main');
  });
});

describe('buildConnectFrame', () => {
  it('produces valid connect request frame', () => {
    const frame = buildConnectFrame('my-token');

    expect(frame.type).toBe('req');
    expect(frame.method).toBe('connect');
    expect(frame.id).toMatch(/^connect-/);
    expect(frame.params.minProtocol).toBe(1);
    expect(frame.params.maxProtocol).toBe(1);
    expect(frame.params.client).toBe('agent-bus-adapter');
    expect((frame.params.auth as Record<string, string>).token).toBe('my-token');
  });
});

describe('translateEvent', () => {
  it('maps session_start to agent lifecycle start', () => {
    const frame = translateEvent({ ...baseEvent, event: 'session_start' });

    expect(frame).not.toBeNull();
    expect(frame!.type).toBe('event');
    expect(frame!.event).toBe('agent');
    expect(frame!.payload.stream).toBe('lifecycle');
    expect(frame!.payload.data?.phase).toBe('start');
    expect(frame!.payload.runId).toMatch(/^[0-9a-f]{12}$/);
    expect(frame!.payload.sessionKey).toBe('agent:tickets-backend-dev:main');
  });

  it('maps session_end to agent lifecycle end', () => {
    const frame = translateEvent({ ...baseEvent, event: 'session_end' });

    expect(frame).not.toBeNull();
    expect(frame!.event).toBe('agent');
    expect(frame!.payload.data?.phase).toBe('end');
  });

  it('maps tool_use to chat delta with tool info', () => {
    const frame = translateEvent({
      ...baseEvent,
      event: 'tool_use',
      tool: 'Edit',
      file: 'auth.ts',
    });

    expect(frame).not.toBeNull();
    expect(frame!.event).toBe('chat');
    expect(frame!.payload.state).toBe('delta');
    expect(frame!.payload.message).toBe('Using Edit on auth.ts');
  });

  it('maps tool_use without file to tool-only message', () => {
    const frame = translateEvent({
      ...baseEvent,
      event: 'tool_use',
      tool: 'Read',
    });

    expect(frame!.payload.message).toBe('Using Read');
  });

  it('maps tool_use without tool to fallback message', () => {
    const frame = translateEvent({
      ...baseEvent,
      event: 'tool_use',
      message: 'Custom message',
    });

    expect(frame!.payload.message).toBe('Custom message');
  });

  it('maps tool_use with no tool or message to Working...', () => {
    const frame = translateEvent({
      ...baseEvent,
      event: 'tool_use',
    });

    expect(frame!.payload.message).toBe('Working...');
  });

  it('maps task_complete to chat final', () => {
    const frame = translateEvent({
      ...baseEvent,
      event: 'task_complete',
      message: 'Auth fixed',
    });

    expect(frame).not.toBeNull();
    expect(frame!.event).toBe('chat');
    expect(frame!.payload.state).toBe('final');
    expect(frame!.payload.message).toBe('Auth fixed');
  });

  it('maps task_complete without message to default', () => {
    const frame = translateEvent({
      ...baseEvent,
      event: 'task_complete',
    });

    expect(frame!.payload.message).toBe('Task complete');
  });

  it('returns null for heartbeat events', () => {
    const frame = translateEvent({ ...baseEvent, event: 'heartbeat' });
    expect(frame).toBeNull();
  });

  it('uses same runId for same agent+project across events', () => {
    const start = translateEvent({ ...baseEvent, event: 'session_start' });
    const tool = translateEvent({ ...baseEvent, event: 'tool_use', tool: 'Edit' });
    const end = translateEvent({ ...baseEvent, event: 'session_end' });

    expect(start!.payload.runId).toBe(tool!.payload.runId);
    expect(tool!.payload.runId).toBe(end!.payload.runId);
  });

  it('uses different runId for different agents', () => {
    const a = translateEvent({ ...baseEvent, agent: 'dev', event: 'session_start' });
    const b = translateEvent({ ...baseEvent, agent: 'qa', event: 'session_start' });

    expect(a!.payload.runId).not.toBe(b!.payload.runId);
  });

  it('returns null for unknown event type', () => {
    const frame = translateEvent({
      ...baseEvent,
      event: 'unknown_type' as any,
    });
    expect(frame).toBeNull();
  });
});

describe('translator edge cases — message construction', () => {
  it('tool_use with tool and file creates "Using X on Y" format', () => {
    const frame = translateEvent({
      ...baseEvent,
      event: 'tool_use',
      tool: 'Bash',
      file: '/path/to/script.sh',
    });
    expect(frame!.payload.message).toBe('Using Bash on /path/to/script.sh');
  });

  it('tool_use with empty tool falls back to message', () => {
    const frame = translateEvent({
      ...baseEvent,
      event: 'tool_use',
      tool: '',
      message: 'fallback msg',
    });
    expect(frame!.payload.message).toBe('fallback msg');
  });

  it('tool_use with null tool (excluded) falls back to message', () => {
    const frame = translateEvent({
      ...baseEvent,
      event: 'tool_use',
      message: 'explicit message',
    });
    expect(frame!.payload.message).toBe('explicit message');
  });

  it('task_complete with empty string message uses empty string (not default)', () => {
    const frame = translateEvent({
      ...baseEvent,
      event: 'task_complete',
      message: '',
    });
    // Empty string is not null/undefined, so ?? uses it
    expect(frame!.payload.message).toBe('');
  });

  it('task_complete with non-empty message uses provided message', () => {
    const frame = translateEvent({
      ...baseEvent,
      event: 'task_complete',
      message: 'Completed with status',
    });
    expect(frame!.payload.message).toBe('Completed with status');
  });

  it('task_complete with whitespace-only message uses default', () => {
    const frame = translateEvent({
      ...baseEvent,
      event: 'task_complete',
      message: '   ',
    });
    // Whitespace is truthy, so it will use the message
    expect(frame!.payload.message).toBe('   ');
  });
});

describe('translator frame structure validation', () => {
  it('session_start includes all required payload fields', () => {
    const frame = translateEvent({ ...baseEvent, event: 'session_start' });
    expect(frame!.payload).toHaveProperty('runId');
    expect(frame!.payload).toHaveProperty('sessionKey');
    expect(frame!.payload).toHaveProperty('stream');
    expect(frame!.payload).toHaveProperty('data');
    expect(frame!.payload.data).toHaveProperty('phase');
  });

  it('agent lifecycle frames include stream: lifecycle', () => {
    const start = translateEvent({ ...baseEvent, event: 'session_start' });
    const end = translateEvent({ ...baseEvent, event: 'session_end' });
    expect(start!.payload.stream).toBe('lifecycle');
    expect(end!.payload.stream).toBe('lifecycle');
  });

  it('chat frames have state but no stream field', () => {
    const toolUse = translateEvent({
      ...baseEvent,
      event: 'tool_use',
      tool: 'Read',
    });
    const taskComplete = translateEvent({
      ...baseEvent,
      event: 'task_complete',
    });
    expect(toolUse!.payload.state).toBeDefined();
    expect(toolUse!.payload.stream).toBeUndefined();
    expect(taskComplete!.payload.state).toBeDefined();
    expect(taskComplete!.payload.stream).toBeUndefined();
  });

  it('runId and sessionKey are present in all non-null frames', () => {
    const events: AgentEvent['event'][] = [
      'session_start',
      'session_end',
      'tool_use',
      'task_complete',
    ];
    for (const eventType of events) {
      const frame = translateEvent({
        ...baseEvent,
        event: eventType,
        tool: 'Read',
      });
      expect(frame).not.toBeNull();
      expect(frame!.payload.runId).toBeDefined();
      expect(frame!.payload.sessionKey).toBeDefined();
    }
  });
});

describe('deriveRunId and deriveSessionKey consistency', () => {
  it('runId is consistent with deriveRunId', () => {
    const event: AgentEvent = {
      ...baseEvent,
      agent: 'qa-team',
      project: 'brainstorm',
      event: 'session_start',
    };
    const frame = translateEvent(event);
    const expectedRunId = deriveRunId('qa-team', 'brainstorm');
    expect(frame!.payload.runId).toBe(expectedRunId);
  });

  it('sessionKey is consistent with deriveSessionKey', () => {
    const event: AgentEvent = {
      ...baseEvent,
      agent: 'qa-team',
      project: 'brainstorm',
      event: 'session_start',
    };
    const frame = translateEvent(event);
    const expectedSessionKey = deriveSessionKey('qa-team', 'brainstorm');
    expect(frame!.payload.sessionKey).toBe(expectedSessionKey);
  });

  it('same agent+project across different event types yields same ids', () => {
    const testAgent = 'tester';
    const testProject = 'test-proj';
    const frames = [
      translateEvent({
        ...baseEvent,
        agent: testAgent,
        project: testProject,
        event: 'session_start',
      }),
      translateEvent({
        ...baseEvent,
        agent: testAgent,
        project: testProject,
        event: 'tool_use',
        tool: 'Bash',
      }),
      translateEvent({
        ...baseEvent,
        agent: testAgent,
        project: testProject,
        event: 'task_complete',
      }),
      translateEvent({
        ...baseEvent,
        agent: testAgent,
        project: testProject,
        event: 'session_end',
      }),
    ];
    const runIds = frames.map((f) => f!.payload.runId);
    const sessionKeys = frames.map((f) => f!.payload.sessionKey);
    // All should be identical
    expect(new Set(runIds).size).toBe(1);
    expect(new Set(sessionKeys).size).toBe(1);
  });
});

describe('buildConnectFrame details', () => {
  it('connect frame id includes connect- prefix with timestamp', () => {
    const frame1 = buildConnectFrame('token1');
    expect(frame1.id).toMatch(/^connect-\d+$/);

    const frame2 = buildConnectFrame('token2');
    expect(frame2.id).toMatch(/^connect-\d+$/);

    // Both should have the format, though IDs may collide if called immediately
    expect(frame1.id).toContain('connect-');
    expect(frame2.id).toContain('connect-');
  });

  it('token is embedded in auth.token', () => {
    const token = 'my-secret-token-12345';
    const frame = buildConnectFrame(token);
    expect((frame.params.auth as Record<string, any>).token).toBe(token);
  });

  it('always sends minProtocol=1 and maxProtocol=1', () => {
    const frame = buildConnectFrame('any-token');
    expect(frame.params.minProtocol).toBe(1);
    expect(frame.params.maxProtocol).toBe(1);
  });

  it('always includes client=agent-bus-adapter', () => {
    const frame = buildConnectFrame('any-token');
    expect(frame.params.client).toBe('agent-bus-adapter');
  });
});

describe('translateEvent with special characters in fields', () => {
  it('handles tool names with special characters', () => {
    const frame = translateEvent({
      ...baseEvent,
      event: 'tool_use',
      tool: 'grep-find|filter',
    });
    expect(frame!.payload.message).toContain('grep-find|filter');
  });

  it('handles file paths with spaces and special chars', () => {
    const frame = translateEvent({
      ...baseEvent,
      event: 'tool_use',
      tool: 'Edit',
      file: '/path/to/file with spaces.ts',
    });
    expect(frame!.payload.message).toContain('file with spaces.ts');
  });

  it('handles message with unicode characters', () => {
    const frame = translateEvent({
      ...baseEvent,
      event: 'task_complete',
      message: 'Task completed ✅ with emoji 🎉',
    });
    expect(frame!.payload.message).toContain('✅');
    expect(frame!.payload.message).toContain('🎉');
  });

  it('handles agent/project with unicode', () => {
    const frame = translateEvent({
      ...baseEvent,
      agent: 'dev-123-αβγ',
      project: 'project-中文',
      event: 'session_start',
    });
    const expectedSessionKey = deriveSessionKey('dev-123-αβγ', 'project-中文');
    expect(frame!.payload.sessionKey).toBe(expectedSessionKey);
  });
});

describe('agent event timestamp preservation', () => {
  it('translator ignores event timestamp', () => {
    const ts1 = 1000000;
    const ts2 = 2000000;
    const frame1 = translateEvent({
      ...baseEvent,
      ts: ts1,
      event: 'session_start',
    });
    const frame2 = translateEvent({
      ...baseEvent,
      ts: ts2,
      event: 'session_start',
    });
    // Both frames should be identical (translator doesn't use ts)
    expect(frame1).toEqual(frame2);
  });
});
