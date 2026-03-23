import { createClaw3dAdapter } from './claw3d-adapter.js';

const hubUrl = process.env.HUB_URL || 'ws://localhost:4000';
const injectUrl = process.env.CLAW3D_INJECT_URL || 'http://localhost:3001/api/inject-event';
const injectSecret = process.env.INJECT_SECRET || '';

if (!injectSecret) {
  console.error('[adapter] INJECT_SECRET is required. Set it via environment variable.');
  process.exit(1);
}

const adapter = createClaw3dAdapter({ hubUrl, injectUrl, injectSecret });
adapter.start();

console.log(`[adapter] bridging ${hubUrl} -> POST ${injectUrl}`);

function shutdown() {
  console.log('\n[adapter] shutting down...');
  adapter.stop();
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
