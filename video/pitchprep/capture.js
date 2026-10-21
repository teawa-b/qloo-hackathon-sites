// Real captures of Pitchprep for its explainer video. Start the site first (npm run start:pitch), then:
//   node video/pitchprep/capture.js
// Writes video/pitchprep/assets/: home.png, form.png, build-NN.jpg (the brief being built), brief.png (the whole
// finished brief) and boxes.json (where each part of the brief sits, so the camera can push in on it).
import { mkdir, writeFile } from 'node:fs/promises';
import { launch, sleep } from '../cdp.js';

const base = process.env.PITCH_URL || 'http://127.0.0.1:3302';
const out = new URL('./assets/', import.meta.url);
await mkdir(out, { recursive: true });
const save = (name, buf) => writeFile(new URL(name, out), buf);
const W = 1440, H = 900;

const chrome = await launch();
const tab = await chrome.page({ width: W, height: H, scale: 2 });

// 1. The home page, then the same page with the form filled in.
await tab.go(`${base}/`); await sleep(2500);
await save('home.png', await tab.shot());
await tab.evaluate(`(() => {
  const set = (id, v) => { document.getElementById(id).value = v; };
  set('investor', 'Todd Boehly'); set('firm', 'Eldridge');
  set('startup', 'A live-events app that turns a concert ticket into a night out: pre-show bars, merch and rides');
  set('comps', 'Ticketmaster, Spotify, Uber');
  document.getElementById('comps').focus();
})()`);
await sleep(300);
await save('form.png', await tab.shot());

// 2. The brief being built: start the recorded Boehly run at a filmable pace and grab frames as its steps arrive.
await tab.go(`${base}/?pace=650`); await sleep(1500);
await tab.evaluate(`document.querySelector('[data-i="Todd Boehly"]').click()`);
for (let i = 0; i < 36; i++) { await save(`build-${String(i).padStart(2, '0')}.jpg`, await tab.shot({ format: 'jpeg', quality: 88 })); await sleep(110); }
await sleep(3000);

// 3. The finished brief, whole page, plus the box of each part.
await tab.evaluate(`document.querySelector('details.made').open = true`);
await sleep(400);
const boxes = await tab.evaluate(`(() => {
  const box = el => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; };
  const part = title => [...document.querySelectorAll('.part')].find(p => p.querySelector('h2')?.textContent === title);
  return {
    page: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
    head: box(document.querySelector('.brief-head')), fit: box(document.getElementById('o-fit')), legend: box(document.querySelector('.legend')),
    headline: box(document.getElementById('o-headline')), ranked: box(part('Name these companies')),
    compare: box(document.querySelector('.compare')), openers: box(part('Open with')), back: box(part('What they back')),
    angle: box(part('The angle')), sources: box(part('Sources')), made: box(document.querySelector('details.made')),
    cmpQloo: box(document.querySelector('.cmp > div:first-child')), cmpLlm: box(document.querySelector('.cmp > div:last-child')),
    opener1: box(document.querySelector('.opener')),
    top3: (() => { const li = [...document.querySelectorAll('#o-portfolio li')].slice(0, 3).map(box); return { x: li[0].x, y: li[0].y, w: li[0].w, h: li[2].y + li[2].h - li[0].y }; })()
  };
})()`);
await save('boxes.json', JSON.stringify(boxes, null, 2));
await tab.resize(W, Math.ceil(boxes.page.h));
await sleep(600);
await save('brief.png', await tab.shot());
await tab.close();
chrome.close();
console.log('captured', boxes.page);
