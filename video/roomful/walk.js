// Film a real walk through a Roomful 3D room: the page runs in headless Chrome and WASD and arrow keys are pressed
// on a script, with the on-screen keys lighting up as they would for a person. Start the site first, then:
//   node video/roomful/walk.js <room glb name> [out dir name]
import { mkdir, writeFile } from 'node:fs/promises';
import { launch, sleep } from '../cdp.js';

const [room = 'room-rain', outName = 'walk3d'] = process.argv.slice(2);
const base = process.env.ROOM_URL || 'http://127.0.0.1:3301';
const out = new URL(`./assets/${outName}/`, import.meta.url);
await mkdir(out, { recursive: true });
const chrome = await launch({ port: 9340 });
const tab = await chrome.page({ width: 1440, height: 810, scale: 1 });
await tab.go(`${base}/room3d?room=${room}&name=${encodeURIComponent('Quiet Signal Room')}`);
for (let i = 0; i < 60 && !(await tab.evaluate(`document.getElementById('w3-load').hidden`)); i++) await sleep(500);
await sleep(800);
// A short walk at 30 frames a second into the painting lifted into 3D: step in, slide left past the sideboard,
// across to the bed, glance round, and step back.
await tab.evaluate(`walk.look(0, -0.03)`);
const plan = [['', 20], ['w', 40], ['a', 25], ['d', 55], ['arrowleft', 20], ['s', 35], ['', 15]];
let n = 0;
for (const [k, frames] of plan) {
  if (k) await tab.evaluate(`walk.press('${k}')`);
  for (let i = 0; i < frames; i++) { await tab.evaluate(`walk.frame(1 / 30)`); await writeFile(new URL(`f-${String(n++).padStart(3, '0')}.jpg`, out), await tab.shot({ format: 'jpeg', quality: 88 })); }
  if (k) await tab.evaluate(`walk.release('${k}')`);
}
console.log('frames', n);
chrome.close();
