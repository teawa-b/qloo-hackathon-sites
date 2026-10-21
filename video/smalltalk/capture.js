// Real captures of SmallTalk for its explainer video. Start the site first (npm run start:talk), then:
//   node video/smalltalk/capture.js
// Writes video/smalltalk/assets/: home.png, talk-NNN.jpg (the sample conversation as it plays), live.png and
// boxes.json (the finished view and where its parts sit), compare.png and glasses.png.
import { mkdir, writeFile } from 'node:fs/promises';
import { launch, sleep } from '../cdp.js';

const base = process.env.TALK_URL || 'http://127.0.0.1:3303';
const out = new URL('./assets/', import.meta.url);
await mkdir(out, { recursive: true });
const save = (name, buf) => writeFile(new URL(name, out), buf);
const pad = n => String(n).padStart(3, '0');
const chrome = await launch({ port: 9338 });

// 1. Home. (Headless Chrome only paints the newest tab, so one tab at a time.)
const home = await chrome.page({ width: 1440, height: 900, scale: 2 });
await home.go(`${base}/`); await sleep(2500);
await save('home.png', await home.shot());
await home.close();

// 2. The sample conversation as it plays: a line every 3.6 s, seven lines.
const film = await chrome.page({ width: 1440, height: 900, scale: 1 });
await film.go(`${base}/?demo=sample`); await sleep(400);
let n = 0;
for (; n < 120; n++) {
  await save(`talk-${pad(n)}.jpg`, await film.shot({ format: 'jpeg', quality: 88 }));
  if (await film.evaluate(`document.querySelector('#status span')?.textContent === 'Sample finished'`) && n > 10) break;
  await sleep(180);
}
console.log('talk frames', n + 1);
await sleep(800);

// 3. The finished view with the parts measured, then the comparison and the glasses view.
const box = sel => film.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })()`);
const boxes = { frames: n + 1, nudges: await box('#nudges'), lead: await box('.nudge.lead'), profile: await box('.profile'), them: await box('#them'), shared: await box('#shared'), avoid: await box('#avoid'), recs: await box('#recs') };
await save('live.png', await film.shot());
await film.evaluate(`document.getElementById('compare').click()`); await sleep(1500);
await film.evaluate(`scrollTo(0, 0)`); await sleep(300);
boxes.cmp = await box('#cmp'); boxes.cmpScore = await box('#cmp-score');
boxes.page = await film.evaluate(`({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })`);
await film.resize(1440, Math.min(1600, Math.ceil(boxes.page.h))); await sleep(500);
await save('compare.png', await film.shot());
await film.resize(1440, 900); await sleep(300);
await film.evaluate(`document.getElementById('glasses').click()`); await sleep(800);
await save('glasses.png', await film.shot());
await save('boxes.json', JSON.stringify(boxes, null, 2));
await film.close();
chrome.close();
console.log(boxes);
