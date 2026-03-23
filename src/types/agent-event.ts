/** Supported event types emitted by agent sessions */
export type EventType =
  | 'session_start'
  | 'session_end'
  | 'tool_use'
  | 'task_complete'
  | 'heartbeat'
  | 'chat_message';

/** Core event schema — every event flowing through the bus conforms to this */
export interface AgentEvent {
  ts: number;           // Unix timestamp ms
  agent: string;        // Agent identifier (e.g. "backend-dev", "qa")
  project: string;      // Project namespace for isolation
  event: EventType;     // Event type
  tool?: string;        // Tool name (for tool_use events)
  file?: string;        // File path (for file operations)
  message?: string;     // Human-readable description
}

const VALID_EVENTS: ReadonlySet<string> = new Set<EventType>([
  'session_start',
  'session_end',
  'tool_use',
  'task_complete',
  'heartbeat',
]);

/** Validate that an unknown payload is a well-formed AgentEvent */
export function isValidEvent(data: unknown): data is AgentEvent {
  if (typeof data !== 'object' || data === null) return false;

  const obj = data as Record<string, unknown>;

  // Required string fields
  if (typeof obj.agent !== 'string' || obj.agent.length === 0) return false;
  if (typeof obj.project !== 'string' || obj.project.length === 0) return false;
  if (typeof obj.event !== 'string' || !VALID_EVENTS.has(obj.event)) return false;

  // Optional fields — must be strings if present
  if (obj.tool !== undefined && typeof obj.tool !== 'string') return false;
  if (obj.file !== undefined && typeof obj.file !== 'string') return false;
  if (obj.message !== undefined && typeof obj.message !== 'string') return false;

  // ts is optional on input (hub adds it), but must be number if present
  if (obj.ts !== undefined && typeof obj.ts !== 'number') return false;

  return true;
}
