import { createClaw3dAdapter } from './claw3d-adapter.js';

const hubUrl = process.env.HUB_URL || 'ws://localhost:4000';
const claw3dUrl = process.env.CLAW3D_URL || 'ws://localhost:3000/api/gateway/ws';
const claw3dToken = process.env.CLAW3D_TOKEN || '';

if (!claw3dToken) {
  console.error('[adapter] CLAW3D_TOKEN is required. Set it via environment variable.');
  process.exit(1);
}

const adapter = createClaw3dAdapter({ hubUrl, claw3dUrl, claw3dToken });
adapter.start();

console.log(`[adapter] bridging ${hubUrl} → ${claw3dUrl}`);

function shutdown() {
  console.log('\n[adapter] shutting down...');
  adapter.stop();
  // Brief delay to allow close frames to send before exit
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
