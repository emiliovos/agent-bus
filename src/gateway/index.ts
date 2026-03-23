import { createGateway } from './agent-bus-gateway.js';

const port = parseInt(process.env.GATEWAY_PORT || '18789', 10);
const hubUrl = process.env.HUB_URL || 'ws://localhost:4000';

const pruneHours = parseInt(process.env.AGENT_PRUNE_HOURS || '24', 10);

const gateway = createGateway({ port, hubUrl, pruneHours });
gateway.start();

console.log(`[gateway] OpenClaw-compatible gateway on ws://0.0.0.0:${port}`);
console.log(`[gateway] Claw3D config: GATEWAY_URL=ws://localhost:${port}`);

function shutdown() {
  console.log('\n[gateway] shutting down...');
  gateway.stop().then(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
