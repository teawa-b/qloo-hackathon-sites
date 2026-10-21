// Film the app's globe for the explainer: it spins, dives into Parkdale with the space pins on it, then hops to
// Chelsea in New York. Every frame is a camera state set by hand and drawn once its tiles are in, so the move is
// smooth however slowly the tiles load. Writes assets/globe-NNN.jpg and globe.json (the frame where each part starts).
//   node video/openhere/globe.js
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, sleep } from '../cdp.js';

const dir = new URL('./', import.meta.url);
const spaces = JSON.parse(await readFile(new URL('../../data/spaces.json', dir), 'utf8')).map((s, i) => ({ lat: s.lat, lng: s.lng, photo: `assets/space-${i}.jpg` }));
const [parkdale, chelsea] = [spaces[1], spaces[2]];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const lerp = (a, b, k) => a + (b - a) * k;

// A move between two views where the centre travels in step with the zoom: most of the travel happens while
// zoomed out, so the target never races across the screen when close in (the idea behind flyTo).
function move(from, to, frames, zoomAt) {
  const zs = Array.from({ length: frames }, (_, i) => zoomAt(i / (frames - 1)));
  const w = zs.map(z => 2 ** -z), total = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  return zs.map((zoom, i) => { acc += w[i]; const p = acc / total; return { lng: lerp(from.lng, to.lng, p), lat: lerp(from.lat, to.lat, p), zoom }; });
}

const shots = [];
const mark = {};
// 1. The globe turns towards North America (3 s).
mark.spin = shots.length;
for (let i = 0; i < 90; i++) { const k = i / 89; shots.push({ lng: lerp(10, -96, ease(k * .5 + .5) * 2 - 1), lat: lerp(22, 38, k), zoom: 2.1 }); }
// 2. Dive into Parkdale, tilting into the 3D streets as it lands (4 s).
mark.dive = shots.length;
for (const [i, s] of move({ lng: -96, lat: 38 }, parkdale, 120, u => lerp(2.1, 16.4, ease(u))).entries()) { const u = i / 119; shots.push({ ...s, pitch: 58 * ease((u - .55) / .45), bearing: -25 * ease((u - .55) / .45), on: u > .8 ? 1 : -1 }); }
// 3. Hold on the space, orbiting slowly (2 s).
mark.hold = shots.length;
for (let i = 0; i < 60; i++) { const k = i / 59; shots.push({ ...parkdale, zoom: 16.4 + .3 * k, pitch: 58, bearing: -25 - 14 * k, on: 1 }); }
// 4. Hop to Chelsea, New York: out to the region and back in (3.5 s).
mark.hop = shots.length;
for (const [i, s] of move(parkdale, chelsea, 105, u => 16.7 - (16.7 - 6.2) * Math.sin(Math.PI * u) ** .8 + (16.6 - 16.7) * u).entries()) { const u = i / 104; shots.push({ ...s, pitch: 58 * (1 - Math.sin(Math.PI * u) ** .5), bearing: lerp(-39, -10, u), on: u < .3 ? 1 : u > .7 ? 2 : -1 }); }
mark.end = shots.length;

const chrome = await launch({ port: 9500 + Math.floor(Math.random() * 400) });
const tab = await chrome.page({ width: 1920, height: 940, scale: 1 });
await tab.go(`${pathToFileURL(fileURLToPath(new URL('globe.html', dir))).href}?spaces=${encodeURIComponent(JSON.stringify(spaces))}`);
await sleep(1500);
await tab.evaluate('window.ready');
let late = 0;
for (const [i, s] of shots.entries()) {
  if (!(await tab.evaluate(`frame(${JSON.stringify(s)})`))) late++;
  await writeFile(new URL(`assets/globe-${String(i).padStart(3, '0')}.jpg`, dir), await tab.shot({ format: 'jpeg', quality: 88 }));
  if (i % 50 === 0) console.log('frame', i, '/', shots.length);
}
await writeFile(new URL('assets/globe.json', dir), JSON.stringify({ frames: shots.length, ...mark }));
console.log('frames', shots.length, 'late', late, JSON.stringify(mark));
chrome.close();
