// One-off probe: turn a redesign image into a 3D world with Hunyuan World on fal, and save what comes back.
//   node --env-file=.env scripts/try-world.js <image path or URL> [out dir]
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const [src, outDir = 'scratch-world'] = process.argv.slice(2);
const key = process.env.FAL_KEY;
const endpoint = 'fal-ai/hunyuan_world/image-to-world';
const image_url = /^https?:/.test(src) ? src : `data:image/jpeg;base64,${(await readFile(src)).toString('base64')}`;
const t0 = Date.now();
const submit = await fetch(`https://queue.fal.run/${endpoint}`, { method: 'POST', headers: { authorization: `Key ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ image_url, classes: 'indoor', labels_fg1: process.env.FG1 || 'stage, bar counter, stools', labels_fg2: process.env.FG2 || 'tables, chairs, lamps', export_drc: false }) }).then(r => r.json());
console.log('submitted', submit.request_id);
let status;
do {
  await new Promise(r => setTimeout(r, 5000));
  status = await fetch(submit.status_url, { headers: { authorization: `Key ${key}` } }).then(r => r.json());
  console.log(Math.round((Date.now() - t0) / 1000) + 's', status.status);
} while (status.status !== 'COMPLETED' && Date.now() - t0 < 15 * 60e3);
const result = await fetch(submit.response_url, { headers: { authorization: `Key ${key}` } }).then(r => r.json());
console.log(JSON.stringify(result).slice(0, 600));
await mkdir(outDir, { recursive: true });
const file = result.world_file;
if (file?.url) {
  const name = file.file_name || file.url.split('/').pop();
  await writeFile(`${outDir}/${name}`, Buffer.from(await (await fetch(file.url)).arrayBuffer()));
  console.log('saved', `${outDir}/${name}`, file.content_type, file.file_size);
}
