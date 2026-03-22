/**
 * Starts Agent Bus hub + gateway (+ optionally Claw3D) in parallel.
 * Kills stale tsx watchers first to prevent ghost processes.
 *
 * Usage: node scripts/dev-all.js
 *
 * - Agent Bus hub on :4000
 * - Gateway on :18789
 * - Claw3D on :3000 (if claw3d/ dir exists)
 */
import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Kill any stale tsx watchers for our entry points
const stalePatterns = ['tsx.*src/index.ts', 'tsx.*src/gateway/index', 'tsx.*src/adapter/index'];
for (const pat of stalePatterns) {
  try { execSync(`pkill -f '${pat}' 2>/dev/null`, { stdio: 'ignore' }); } catch { /* no match is fine */ }
}

const procs = [
  { name: 'hub', cmd: 'npx', args: ['tsx', 'watch', 'src/index.ts'], color: '\x1b[36m' },
  { name: 'gateway', cmd: 'npx', args: ['tsx', 'watch', 'src/gateway/index.ts'], color: '\x1b[33m' },
];

// Include Claw3D only if the directory exists
if (existsSync('claw3d')) {
  procs.push({ name: 'claw3d', cmd: 'npm', args: ['run', 'dev'], cwd: 'claw3d', color: '\x1b[35m' });
}

const reset = '\x1b[0m';
const children = [];

for (const { name, cmd, args, cwd, color } of procs) {
  const child = spawn(cmd, args, {
    cwd: cwd || process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  children.push(child);
  const prefix = `${color}[${name}]${reset}`;

  child.stdout.on('data', (data) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      console.log(`${prefix} ${line}`);
    }
  });

  child.stderr.on('data', (data) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      console.error(`${prefix} ${line}`);
    }
  });

  child.on('exit', (code) => {
    console.log(`${prefix} exited with code ${code}`);
  });
}

// Forward signals — kill all children on exit
function cleanup() {
  for (const child of children) child.kill();
  process.exit(0);
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
