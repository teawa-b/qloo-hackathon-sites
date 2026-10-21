// Real captures of Openhere for its explainer video. Start the site first (npm run start:openhere), then:
//   node video/openhere/capture.js [--no-walk]
// Writes video/openhere/assets/: home.png, build-NNN.jpg (an example being built, through the redesign's wipe),
// studio shots with the box of the part each one is about (shots.json), and walk-NNN.jpg (the live walkthrough).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { launch, sleep } from '../cdp.js';

const base = process.env.OPENHERE_URL || 'http://127.0.0.1:3300';
const out = new URL('./assets/', import.meta.url);
await mkdir(out, { recursive: true });
const save = (name, buf) => writeFile(new URL(name, out), buf);
const pad = (n, w = 3) => String(n).padStart(w, '0');
const chrome = await launch({ port: 9336 });
const shots = {};

// 1. The globe.
// Headless Chrome only paints the newest tab, so each step opens its own tab and closes it after.
const home = await chrome.page({ width: 1440, height: 900, scale: 2 });
await home.go(`${base}/`); await sleep(12000);
await save('home.png', await home.shot());
await home.close();

// 2. An example being built, at a filmable pace, until the redesign has swept across.
const film = await chrome.page({ width: 1440, height: 900, scale: 1 });
await film.go(`${base}/?demo=live-music-parkdale&pace=320`); await sleep(800);
let n = 0, doneAt = null;
for (; n < 200; n++) {
  await save(`build-${pad(n)}.jpg`, await film.shot({ format: 'jpeg', quality: 88 }));
  if (!doneAt && await film.evaluate(`document.getElementById('live')?.classList.contains('done')`)) doneAt = n;
  if (doneAt && n - doneAt > 28) break;
  await sleep(90);
}
console.log('build frames', n + 1, 'done at', doneAt);
await save('build.json', JSON.stringify({ frames: n + 1, doneAt }));
await film.close();
const tab = await chrome.page({ width: 1440, height: 900, scale: 2 });

// 3. Studio panels: scroll the side panel to each part and note where it sits on screen.
async function panel(name, selector) {
  const box = await tab.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
    const side = document.querySelector('.side'); side.scrollTop = Math.max(0, el.offsetTop - 90);
    const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: Math.min(r.height, innerHeight - r.top - 16) };
  })()`);
  if (!box) { console.log('missing', name); return; }
  await sleep(500);
  await save(`${name}.png`, await tab.shot());
  shots[name] = box;
}
await tab.go(`${base}/?demo=live-music-parkdale`); await sleep(14000);
await tab.evaluate(`document.querySelector('.side').scrollTop = 0`); await sleep(400);
await save('studio-venue.png', await tab.shot());
await panel('slate', '#c-slate');
await panel('choices', '.choices-box');
await panel('audience', '#c-audience');
await panel('baseline', '#c-baseline');
await tab.go(`${base}/?demo=redbull-bridgers`); await sleep(16000);
await tab.evaluate(`document.querySelector('.side').scrollTop = 0`); await sleep(400);
await save('studio-activation.png', await tab.shot());
await panel('fit', '#c-fit');
await save('shots.json', JSON.stringify(shots, null, 2));
await tab.close();

// 4. The live walkthrough of the venue redesign: fal's world model over WebRTC, walking forward then turning.
if (!process.argv.includes('--no-walk')) {
  const demo = JSON.parse(await readFile(new URL('../../data/demos/openhere-live-music-parkdale.json', import.meta.url), 'utf8'));
  const final = demo.events.find(e => e.type === 'final');
  const walk = await chrome.page({ width: 1440, height: 900, scale: 1 });
  const q = new URLSearchParams({ render: demo.renders[0].id, name: final.concept?.name || '', tagline: final.concept?.tagline || '' });
  await walk.go(`${base}/live?${q}`); await sleep(2500);
  await walk.evaluate(`document.getElementById('enter').click()`);
  let playing = false;
  for (let i = 0; i < 90 && !playing; i++) { await sleep(1000); playing = await walk.evaluate(`(() => { const v = document.getElementById('video'); return v.readyState >= 2 && !v.paused && v.videoWidth > 0; })()`); }
  console.log('walk playing', playing);
  if (playing) {
    await sleep(2500);
    const key = (k, type) => walk.evaluate(`dispatchEvent(new KeyboardEvent('${type}', { key: '${k}' }))`);
    let f = 0;
    for (const [k, frames] of [['w', 70], ['ArrowRight', 30], ['w', 40]]) {
      await key(k, 'keydown');
      for (let i = 0; i < frames; i++) { await save(`walk-${pad(f++)}.jpg`, await walk.shot({ format: 'jpeg', quality: 88 })); await sleep(60); }
      await key(k, 'keyup');
    }
    console.log('walk frames', f);
  }
  await walk.evaluate(`document.getElementById('leave')?.click()`).catch(() => {});
  await sleep(1500);
  await walk.close();
}
chrome.close();
console.log('shots', Object.keys(shots));
