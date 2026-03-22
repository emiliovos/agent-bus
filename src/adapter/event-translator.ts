import { createHash } from 'node:crypto';
import type { AgentEvent } from '../types/agent-event.js';

/**
 * Claw3D WebSocket frame types.
 * See docs/system-architecture.md → Claw3D Protocol Reference
 */
export interface Claw3dReqFrame {
  type: 'req';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface Claw3dEventFrame {
  type: 'event';
  event: string;          // "agent" | "chat"
  payload: {
    runId: string;
    sessionKey: string;
    stream?: string;       // "lifecycle" for agent events
    data?: Record<string, unknown>;
    state?: string;        // "delta" | "final" for chat events
    message?: string;
  };
}

/** Generate a deterministic runId from agent+project (stable across events) */
export function deriveRunId(agent: string, project: string): string {
  return createHash('sha256')
    .update(`${agent}:${project}`)
    .digest('hex')
    .slice(0, 12);
}

/** Generate a sessionKey in Claw3D format: agent:<agentId>:main */
export function deriveSessionKey(agent: string, _project: string): string {
  return `agent:${agent}:main`;
}

/** Build the connect request frame required as first message to Claw3D */
export function buildConnectFrame(token: string): Claw3dReqFrame {
  return {
    type: 'req',
    id: `connect-${Date.now()}`,
    method: 'connect',
    params: {
      minProtocol: 1,
      maxProtocol: 1,
      client: 'agent-bus-adapter',
      auth: { token },
    },
  };
}

/** Translate an agent-bus event into one or more Claw3D frames */
export function translateEvent(event: AgentEvent): Claw3dEventFrame | null {
  const runId = deriveRunId(event.agent, event.project);
  const sessionKey = deriveSessionKey(event.agent, event.project);

  switch (event.event) {
    case 'session_start':
      return {
        type: 'event',
        event: 'agent',
        payload: {
          runId,
          sessionKey,
          stream: 'lifecycle',
          data: { phase: 'start' },
        },
      };

    case 'tool_use':
      return {
        type: 'event',
        event: 'chat',
        payload: {
          runId,
          sessionKey,
          state: 'delta',
          message: event.tool
            ? `Using ${event.tool}${event.file ? ` on ${event.file}` : ''}`
            : event.message ?? 'Working...',
        },
      };

    case 'task_complete':
      return {
        type: 'event',
        event: 'chat',
        payload: {
          runId,
          sessionKey,
          state: 'final',
          message: event.message ?? 'Task complete',
        },
      };

    case 'session_end':
      return {
        type: 'event',
        event: 'agent',
        payload: {
          runId,
          sessionKey,
          stream: 'lifecycle',
          data: { phase: 'end' },
        },
      };

    case 'heartbeat':
      // Heartbeats don't need to be forwarded to Claw3D
      return null;

    default:
      return null;
  }
}
