// Server smoke test: boots server.js against a real Postgres (NODE_ENV=test),
// waits for the HTTP listener, asserts any HTTP response, then shuts down.
// Proves: env wiring, module imports, DB migrations-from-scratch, and listen().
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = process.env.PORT || 3999;
const BOOT_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 120000);

const child = spawn(process.execPath, ['server.js'], {
  env: { ...process.env },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => {
  output += chunk;
  process.stdout.write(chunk);
});
child.stderr.on('data', (chunk) => {
  output += chunk;
  process.stderr.write(chunk);
});

async function tryFetch() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(3000) });
    return res.status;
  } catch {
    return null;
  }
}

const deadline = Date.now() + BOOT_TIMEOUT_MS;
let status = null;

while (Date.now() < deadline) {
  if (child.exitCode !== null) break;
  status = await tryFetch();
  if (status !== null) break;
  await sleep(2000);
}

if (status !== null) {
  console.log(`\nSMOKE OK — server responded HTTP ${status} on :${PORT}`);
  child.kill('SIGTERM');
  await sleep(1500);
  if (child.exitCode === null) child.kill('SIGKILL');
  process.exit(0);
}

console.error(`\nSMOKE FAILED — no HTTP response within ${BOOT_TIMEOUT_MS}ms (exit=${child.exitCode})`);
console.error('─── last server output ───');
console.error(output.slice(-6000));
if (child.exitCode === null) child.kill('SIGKILL');
process.exit(1);
