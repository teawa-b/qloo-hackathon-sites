// README screenshots. Start the sites first (npm run dev), then: node scripts/screenshots.js
// Drives headless Chrome over the DevTools protocol (no dependencies) so each page can finish its replay.
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';

const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const shots = [
  ['openhere-home', 'http://127.0.0.1:3300/', 1440, 900, 9000],
  ['openhere-studio', 'http://127.0.0.1:3300/?demo=redbull-bridgers', 1440, 900, 12000],
  ['openhere-studio-detail', 'http://127.0.0.1:3300/?demo=live-music-parkdale', 1440, 1400, 12000],
  ['roomful-home', 'http://127.0.0.1:3301/', 1440, 900, 4000],
  ['roomful-result', 'http://127.0.0.1:3301/?demo=rain', 1440, 1000, 12000],
  ['pitchprep-home', 'http://127.0.0.1:3302/', 1440, 900, 3000],
  ['pitchprep-brief', 'http://127.0.0.1:3302/?demo=boehly', 1440, 1700, 12000],
  // The hero image on Pitchprep's own home page (saved into public/img, light mode).
  ['pitchprep-brief', 'http://127.0.0.1:3302/?demo=calacanis', 1200, 900, 12000, 'public/img/'],
  ['talk-coach', 'http://127.0.0.1:3303/?demo=sample', 1280, 1000, 32000],
  ['taste-lab', 'http://127.0.0.1:3304/', 1440, 900, 3000]
];
const only = process.argv.slice(2);
const port = 9333;
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 40 && !ws; i++) { try { ws = (await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json())).webSocketDebuggerUrl; } catch { await sleep(250); } }
const socket = new WebSocket(ws);
await new Promise(r => socket.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
socket.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}, sessionId) => new Promise(r => { const n = ++id; pending.set(n, r); socket.send(JSON.stringify({ id: n, method, params, sessionId })); });

await mkdir(new URL('../docs/img/', import.meta.url), { recursive: true });
for (const [name, url, width, height, wait, dir = 'docs/img/'] of shots) {
  if (only.length && !only.includes(name)) continue;
  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: process.env.SCHEME || 'light' }] }, sessionId);
  await send('Page.navigate', { url }, sessionId);
  await sleep(wait);
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile(new URL(`../${dir}${name}.png`, import.meta.url), Buffer.from(shot.result.data, 'base64'));
  await send('Target.closeTarget', { targetId });
  console.log(`${dir}${name}.png`);
}
socket.close(); browser.kill();
