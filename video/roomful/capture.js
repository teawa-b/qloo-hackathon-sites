// Real captures of Roomful for its explainer video. Start the site first (npm run start:room), then:
//   node video/roomful/capture.js [--no-walk]
// Writes video/roomful/assets/: home.png, form.png, build-NNN.jpg (a room being built), room.png (the whole
// finished page) with boxes.json (where each part sits), and walk-NNN.jpg (the live walkthrough).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { launch, sleep } from '../cdp.js';

const base = process.env.ROOM_URL || 'http://127.0.0.1:3301';
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const out = new URL('./assets/', import.meta.url);
await mkdir(out, { recursive: true });
const save = (name, buf) => writeFile(new URL(name, out), buf);
const pad = n => String(n).padStart(3, '0');
const chrome = await launch({ port: 9337 });

// 1. Home, then the favourites typed in. (Headless Chrome only paints the newest tab, so one tab at a time.)
const home = await chrome.page({ width: 1440, height: 900, scale: 2, ua });
await home.go(`${base}/`); await sleep(3000);
await save('home.png', await home.shot());
await home.evaluate(`(() => { const i = document.getElementById('text'); i.value = 'Radiohead, Blade Runner, Haruki Murakami, Muji'; i.focus(); })()`);
await sleep(300);
await save('form.png', await home.shot());
await home.close();

// 2. The room being built, at a filmable pace, until the painting lands.
const film = await chrome.page({ width: 1440, height: 900, scale: 1, ua });
await film.go(`${base}/?demo=rain&pace=700`); await sleep(800);
let n = 0, doneAt = null;
for (; n < 160; n++) {
  await save(`build-${pad(n)}.jpg`, await film.shot({ format: 'jpeg', quality: 88 }));
  if (!doneAt && await film.evaluate(`document.getElementById('build')?.classList.contains('complete')`)) doneAt = n;
  if (doneAt && n - doneAt > 20) break;
  await sleep(90);
}
await save('build.json', JSON.stringify({ frames: n + 1, doneAt }));
console.log('build frames', n + 1, 'done at', doneAt);
await film.close();

// 3. The finished page, whole, with the box of each part. The player gets a few seconds to load.
const tab = await chrome.page({ width: 1440, height: 900, scale: 2, ua });
await tab.go(`${base}/?demo=rain`); await sleep(9000);
const boxes = await tab.evaluate(`(() => {
  const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; };
  return { page: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
    hero: box(document.getElementById('hero')), head: box(document.querySelector('.result')), player: box(document.getElementById('player')),
    brief: box(document.querySelector('.brief')), choices: box(document.querySelector('.choices-section')), compare: box(document.getElementById('r-compare')),
    score: box(document.getElementById('cmp-score')), cmp: box(document.getElementById('cmp-list')) };
})()`);
await save('boxes.json', JSON.stringify(boxes, null, 2));
await tab.resize(1440, Math.ceil(boxes.page.h)); await sleep(1200);
await save('room.png', await tab.shot());
await tab.close();
console.log('page', boxes.page);

// 4. Walk into the painted room: fal's live world model over WebRTC.
if (!process.argv.includes('--no-walk')) {
  const demo = JSON.parse(await readFile(new URL('../../data/demos/room-rain.json', import.meta.url), 'utf8'));
  const final = demo.events.find(e => e.type === 'final');
  const walk = await chrome.page({ width: 1440, height: 900, scale: 1, ua });
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
    for (const [k, frames] of [['w', 60], ['ArrowLeft', 30], ['w', 40]]) {
      await key(k, 'keydown');
      for (let i = 0; i < frames; i++) { await save(`walk-${pad(f++)}.jpg`, await walk.shot({ format: 'jpeg', quality: 88 })); await sleep(60); }
      await key(k, 'keyup');
    }
    console.log('walk frames', f);
  }
  await walk.close();
}
chrome.close();
