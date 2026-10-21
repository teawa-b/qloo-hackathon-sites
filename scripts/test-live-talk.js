// End-to-end check of SmallTalk's live listening, the path a live demo uses: a spoken conversation (made with
// text-to-speech) is fed to headless Chrome as its microphone, and the page runs for real (6-second chunks,
// ElevenLabs speech to text, Qloo, nudges). Start the site first (npm run start:talk), then:
//   node --env-file=.env scripts/test-live-talk.js
import { mkdir, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { launch, sleep } from '../video/cdp.js';

const base = process.env.TALK_URL || 'http://127.0.0.1:3303';
const dir = new URL('../video/livetest/', import.meta.url);
const path = u => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, '$1');
await mkdir(dir, { recursive: true });
const lines = [
  'I just finished the new Sally Rooney book on the train.',
  'Honestly I have had Phoebe Bridgers on repeat all week.',
  'We watched Past Lives again last weekend and I cried the whole second half.',
  'Oh, and I really cannot stand superhero films.'
];

// 1. Speak each line (ElevenLabs on fal), with a pause after each, as one 48 kHz mono WAV.
const wav = new URL('conversation.wav', dir);
if (!(await access(wav).then(() => true, () => false))) {
  const parts = [];
  for (const [i, text] of lines.entries()) {
    const res = await fetch('https://fal.run/fal-ai/elevenlabs/tts/multilingual-v2', { method: 'POST', headers: { authorization: `Key ${process.env.FAL_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ text, voice: 'Jessica' }) });
    const { audio } = await res.json();
    const mp3 = new URL(`line-${i}.mp3`, dir);
    await writeFile(mp3, Buffer.from(await (await fetch(audio.url)).arrayBuffer()));
    parts.push(path(mp3));
  }
  const inputs = parts.flatMap(p => ['-i', p]);
  const filter = parts.map((_, i) => `[${i}:a]aresample=48000,apad=pad_dur=3[a${i}]`).join(';') + `;${parts.map((_, i) => `[a${i}]`).join('')}concat=n=${parts.length}:v=0:a=1[out]`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', path(wav)]);
}
const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path(wav)]).toString());
console.log(`conversation: ${seconds.toFixed(1)} s`);

// 2. Chrome with that WAV as its microphone; tick consent, start listening, and let it run.
const chrome = await launch({ port: 9339, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path(wav)}%noloop`, '--autoplay-policy=no-user-gesture-required'] });
const tab = await chrome.page({ width: 1440, height: 900 });
await tab.go(`${base}/`); await sleep(2000);
await tab.evaluate(`document.getElementById('consent').checked = true; document.getElementById('listen').click()`);
const t0 = Date.now();
let last = '';
while (Date.now() - t0 < (seconds + 30) * 1000) {
  await sleep(3000);
  const state = await tab.evaluate(`({ status: document.querySelector('#status span')?.textContent, heard: [...document.querySelectorAll('#lines li')].map(li => li.textContent).reverse(), them: [...document.querySelectorAll('#them .chip')].map(c => c.textContent), avoid: [...document.querySelectorAll('#avoid .chip')].map(c => c.textContent), nudges: [...document.querySelectorAll('.nudge p')].map(p => p.textContent), toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent })`);
  const line = JSON.stringify(state);
  if (line !== last) { console.log(`${Math.round((Date.now() - t0) / 1000)}s`, line); last = line; }
}
await writeFile(new URL('result.png', dir), await tab.shot());
await tab.evaluate(`document.getElementById('stop').click()`);
chrome.close();
