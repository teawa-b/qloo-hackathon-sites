// Wait for a Hunyuan World request already queued on fal and download its result (no new generation, no new cost).
//   node --env-file=.env scripts/fetch-world.js <request id> <out dir>
import { mkdir, writeFile } from 'node:fs/promises';

const [id, outDir] = process.argv.slice(2);
const key = process.env.FAL_KEY, base = `https://queue.fal.run/fal-ai/hunyuan_world/requests/${id}`;
const t0 = Date.now();
let status;
do {
  status = await fetch(`${base}/status`, { headers: { authorization: `Key ${key}` } }).then(r => r.json());
  console.log(Math.round((Date.now() - t0) / 1000) + 's', status.status);
  if (status.status !== 'COMPLETED') await new Promise(r => setTimeout(r, 10000));
} while (status.status !== 'COMPLETED' && Date.now() - t0 < 40 * 60e3);
const result = await fetch(base, { headers: { authorization: `Key ${key}` } }).then(r => r.json());
const file = result.world_file;
if (!file?.url) { console.log(JSON.stringify(result).slice(0, 400)); process.exit(1); }
await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}/world.zip`, Buffer.from(await (await fetch(file.url)).arrayBuffer()));
console.log('saved', `${outDir}/world.zip`, file.file_size);
