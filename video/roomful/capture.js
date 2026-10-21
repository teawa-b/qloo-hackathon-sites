// Real captures of Roomful for its explainer video. Start the site first (npm run start:room), then:
//   node video/roomful/capture.js
// Writes video/roomful/assets/: home.png, type-NN.jpg (the favourites being typed), build-NNN.jpg (a room being
// built), room.png (the whole finished page) and boxes.json (where each part sits, for labels and highlights).
// The walk through the 3D room is filmed separately by video/roomful/walk.js.
import { mkdir, writeFile } from 'node:fs/promises';
import { launch, sleep } from '../cdp.js';

const base = process.env.ROOM_URL || 'http://127.0.0.1:3301';
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const out = new URL('./assets/', import.meta.url);
await mkdir(out, { recursive: true });
const save = (name, buf) => writeFile(new URL(name, out), buf);
const pad = (n, w = 3) => String(n).padStart(w, '0');
const favourites = 'Radiohead, Blade Runner, Haruki Murakami, Muji';
const chrome = await launch({ port: 9337 });
const box = (tab, sel) => tab.evaluate(`(() => { const el = typeof ${JSON.stringify(sel)} === 'string' ? document.querySelector(${JSON.stringify(sel)}) : null; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })()`);
const boxes = {};

// 1. Home, then the favourites typed in, a few characters per frame. (One tab at a time: headless Chrome only
// paints the newest tab.)
const home = await chrome.page({ width: 1440, height: 900, scale: 1, ua });
await home.go(`${base}/`); await sleep(3000);
await save('home.png', await home.shot());
boxes.input = await box(home, '#text');
boxes.go = await box(home, '#go');
await home.evaluate(`document.getElementById('text').focus()`);
let t = 0;
for (let i = 0; i <= favourites.length; i += 2) {
  await home.evaluate(`document.getElementById('text').value = ${JSON.stringify(favourites)}.slice(0, ${i})`);
  await save(`type-${pad(t++, 2)}.jpg`, await home.shot({ format: 'jpeg', quality: 90 }));
}
await home.evaluate(`document.getElementById('text').value = ${JSON.stringify(favourites)}`);
for (let i = 0; i < 4; i++) await save(`type-${pad(t++, 2)}.jpg`, await home.shot({ format: 'jpeg', quality: 90 }));
boxes.typeFrames = t;
await home.close();

// 2. The room being built, at a filmable pace: the steps arrive, then the painting lands.
const film = await chrome.page({ width: 1440, height: 900, scale: 1, ua });
await film.go(`${base}/?demo=rain&pace=700`); await sleep(800);
let n = 0, doneAt = null;
for (; n < 160; n++) {
  await save(`build-${pad(n)}.jpg`, await film.shot({ format: 'jpeg', quality: 88 }));
  if (!doneAt && await film.evaluate(`document.getElementById('build')?.classList.contains('complete')`)) doneAt = n;
  if (doneAt && n - doneAt > 20) break;
  await sleep(90);
}
boxes.build = { frames: n + 1, doneAt };
boxes.steps = await box(film, '#steps');
boxes.hero = await box(film, '#hero');
await film.close();

// 3. The finished page, whole, with the parts the video points at.
const tab = await chrome.page({ width: 1440, height: 900, scale: 2, ua });
await tab.go(`${base}/?demo=rain`); await sleep(9000);
Object.assign(boxes, {
  page: await tab.evaluate(`({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })`),
  head: await box(tab, '.result'), player: await box(tab, '#player'), brief: await box(tab, '.brief'),
  choices: await box(tab, '.choices-section'), firstChoice: await box(tab, '#r-choices li'),
  tagOk: await box(tab, '#r-choices li .tag:not(.no)'), tagNo: await box(tab, '#r-choices .tag.no'),
  choiceNo: await tab.evaluate(`(() => { const el = document.querySelector('#r-choices .tag.no')?.closest('li'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })()`),
  compare: await box(tab, '#r-compare'), score: await box(tab, '#cmp-score'), cmp: await box(tab, '#cmp-list')
});
await tab.resize(1440, Math.ceil(boxes.page.h)); await sleep(1200);
await save('room.png', await tab.shot());
await tab.close();
// The run itself, for the with/without graphic: what Qloo returned, and the LLM's picks with their verdicts.
const demo = await fetch(`${base}/api/room`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x', demo: 'rain' }) }).then(r => r.text());
const final = demo.split('\n\n').map(c => c.split('\n').find(l => l.startsWith('data: '))).filter(Boolean).map(l => JSON.parse(l.slice(6))).find(e => e.type === 'final');
boxes.withQloo = [...final.taste.decor.slice(0, 3), ...final.taste.artist.slice(0, 3), ...final.taste.brand.slice(0, 2)].map(e => e.name);
boxes.without = final.baseline.picks.map(p => ({ name: p.name, verdict: p.verdict }));
await save('boxes.json', JSON.stringify(boxes, null, 2));
chrome.close();
console.log(boxes);
