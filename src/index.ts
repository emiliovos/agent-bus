import { createEventHub } from './hub/event-hub.js';

const port = parseInt(process.env.PORT || '4000', 10);
const logDir = process.env.LOG_DIR || 'data';

const hub = createEventHub({ port, logDir });

await hub.listen();
console.log(`[agent-bus] listening on ws://0.0.0.0:${port}`);
console.log(`[agent-bus] POST http://localhost:${port}/events`);
console.log(`[agent-bus] GET  http://localhost:${port}/health`);

// Graceful shutdown
function shutdown() {
  console.log('\n[agent-bus] shutting down...');
  hub.close().then(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
