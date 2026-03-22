import type { AgentEvent } from '../types/agent-event.js';
import { deriveRunId, deriveSessionKey, translateEvent, type Claw3dEventFrame } from '../adapter/event-translator.js';

export interface AgentInfo {
  id: string;
  identity: { name: string; theme: string; emoji: string };
  project: string;
  status: 'active' | 'idle';
  runId: string;
  sessionKey: string;
  lastSeen: number;
}

export interface SessionInfo {
  sessionKey: string;
  agentId: string;
  project: string;
  startedAt: number;
  messages: ChatMessage[];
}

export interface ChatMessage {
  role: 'assistant';
  content: string;
  ts: number;
}

const MAX_MESSAGES = 100;

// Simple emoji derivation from agent name hash
const EMOJIS = ['💻', '🤖', '🛠️', '⚡', '🔧', '📦', '🚀', '🧪', '📡', '🎯'];
function deriveEmoji(name: string): string {
  let hash = 0;
  for (const ch of name) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return EMOJIS[Math.abs(hash) % EMOJIS.length];
}

function deriveName(agentId: string): string {
  // Keep short — Claw3D label has limited width. Use ID directly if ≤10 chars.
  if (agentId.length <= 10) return agentId;
  return agentId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** In-memory agent and session state, populated from hub events */
export class AgentRegistry {
  private agents = new Map<string, AgentInfo>();
  private sessions = new Map<string, SessionInfo>();
  private _presenceVersion = 0;
  private _healthVersion = 0;

  /** Process a hub event — returns whether agent list changed + optional chat frame */
  handleEvent(event: AgentEvent): { agentChanged: boolean; frame: Claw3dEventFrame | null } {
    const key = `${event.agent}:${event.project}`;
    const runId = deriveRunId(event.agent, event.project);
    const sessionKey = deriveSessionKey(event.agent, event.project);
    const now = Date.now();

    if (event.event === 'session_start') {
      this.agents.set(key, {
        id: event.agent,
        identity: { name: deriveName(event.agent), theme: 'coding agent', emoji: deriveEmoji(event.agent) },
        project: event.project,
        status: 'active',
        runId,
        sessionKey,
        lastSeen: now,
      });
      if (!this.sessions.has(sessionKey)) {
        this.sessions.set(sessionKey, { sessionKey, agentId: event.agent, project: event.project, startedAt: now, messages: [] });
      }
      this._presenceVersion++;
      return { agentChanged: true, frame: translateEvent(event) };
    }

    if (event.event === 'session_end') {
      const agent = this.agents.get(key);
      if (agent) { agent.status = 'idle'; agent.lastSeen = now; }
      this._presenceVersion++;
      return { agentChanged: true, frame: translateEvent(event) };
    }

    if (event.event === 'tool_use' || event.event === 'task_complete') {
      // Ensure agent exists (auto-register if missed session_start)
      const wasNew = !this.agents.has(key);
      if (wasNew) {
        this.agents.set(key, {
          id: event.agent,
          identity: { name: deriveName(event.agent), theme: 'coding agent', emoji: deriveEmoji(event.agent) },
          project: event.project, status: 'active', runId, sessionKey, lastSeen: now,
        });
        if (!this.sessions.has(sessionKey)) {
          this.sessions.set(sessionKey, { sessionKey, agentId: event.agent, project: event.project, startedAt: now, messages: [] });
        }
        this._presenceVersion++;
      }
      const agent = this.agents.get(key)!;
      agent.lastSeen = now;
      agent.status = 'active';

      // Add to chat history ring buffer
      const session = this.sessions.get(sessionKey);
      if (session) {
        const content = event.tool
          ? `Using ${event.tool}${event.file ? ` on ${event.file}` : ''}`
          : event.message ?? 'Working...';
        session.messages.push({ role: 'assistant', content, ts: event.ts ?? now });
        if (session.messages.length > MAX_MESSAGES) session.messages.shift();
      }

      return { agentChanged: wasNew, frame: translateEvent(event) };
    }

    // heartbeat — just update lastSeen
    if (event.event === 'heartbeat') {
      const agent = this.agents.get(key);
      if (agent) agent.lastSeen = now;
      return { agentChanged: false, frame: null };
    }

    return { agentChanged: false, frame: null };
  }

  getAgents(): AgentInfo[] { return [...this.agents.values()]; }
  getSessions(): SessionInfo[] { return [...this.sessions.values()]; }
  getSessionMessages(sessionKey: string): ChatMessage[] { return this.sessions.get(sessionKey)?.messages ?? []; }
  getAgentConfig(agentId: string): AgentInfo | undefined {
    for (const a of this.agents.values()) { if (a.id === agentId) return a; }
    return undefined;
  }

  get stateVersion() { return { presence: this._presenceVersion, health: this._healthVersion }; }
}
