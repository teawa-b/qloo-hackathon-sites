// Copy the keys a site needs from .env into its linked Vercel project (production), without printing them.
//   node scripts/vercel-env.mjs <site> KEY [KEY ...]
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [site, ...keys] = process.argv.slice(2);
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const vars = { SITE: site, ...Object.fromEntries(keys.filter(k => env[k]).map(k => [k, env[k]])) };
for (const [name, value] of Object.entries(vars)) {
  try { execFileSync('vercel', ['env', 'rm', name, 'production', '--yes'], { stdio: 'ignore', shell: true }); } catch {}
  execFileSync('vercel', ['env', 'add', name, 'production'], { input: value, stdio: ['pipe', 'ignore', 'ignore'], shell: true });
  console.log('set', name);
}
