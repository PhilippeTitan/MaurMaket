#!/usr/bin/env node
const { spawn } = require('child_process');
const p = spawn('npx.cmd', ['-y', '@moncashconnect/mcp'], {
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: true,
});
process.stdin.pipe(p.stdin);
p.stdout.pipe(process.stdout);
p.stderr.pipe(process.stderr);
p.on('exit', (code) => process.exit(code ?? 0));
