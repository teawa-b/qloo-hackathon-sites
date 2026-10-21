// Run all five sites locally, each on its own port, with one command: npm run dev
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sites } from './server.js';

const server = fileURLToPath(new URL('./server.js', import.meta.url));
const only = process.argv.slice(2);
for (const [key, site] of Object.entries(sites)) {
  if (only.length && !only.includes(key)) continue;
  const child = spawn(process.execPath, ['--env-file-if-exists=.env', server, `--site=${key}`], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: '' } });
  const tag = `[${site.name}]`.padEnd(14);
  child.stdout.on('data', d => process.stdout.write(`${tag} ${d}`));
  child.stderr.on('data', d => process.stderr.write(`${tag} ${d}`));
  process.on('exit', () => child.kill());
}
process.on('SIGINT', () => process.exit(0));
