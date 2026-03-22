/**
 * Starts both Agent Bus hub and Claw3D in parallel.
 * Usage: node scripts/dev-all.js
 *
 * - Agent Bus hub on :4000
 * - Claw3D on :3000
 */
import { spawn } from 'node:child_process';

const procs = [
  { name: 'agent-bus', cmd: 'npx', args: ['tsx', 'watch', 'src/index.ts'], color: '\x1b[36m' },
  { name: 'claw3d', cmd: 'npm', args: ['run', 'dev'], cwd: 'claw3d', color: '\x1b[35m' },
];

const reset = '\x1b[0m';

for (const { name, cmd, args, cwd, color } of procs) {
  const child = spawn(cmd, args, {
    cwd: cwd || process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

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

// Forward SIGINT/SIGTERM to children
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
