// Build an explainer video from real app captures:
//   node --env-file=.env video/make.js pitchprep [--preview] [--no-tts]
// 1. Narration: each scene's line through ElevenLabs text-to-speech on fal (cached in video/<app>/audio/).
// 2. Timeline: each scene lasts as long as its narration plus a breath; written to video/<app>/timeline.js.
// 3. Frames: video/<app>/compose.html is opened in headless Chrome and renderAt(t) is captured at 30 fps.
// 4. ffmpeg encodes the frames and lays the narration over them: video/<app>/out/<app>.mp4.
// --preview renders a contact sheet of stills instead (one per second) to check layout before the full render.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { launch, sleep } from './cdp.js';

const app = process.argv[2];
const preview = process.argv.includes('--preview');
const dir = new URL(`./${app}/`, import.meta.url);
const script = JSON.parse(await readFile(new URL('script.json', dir), 'utf8'));
await mkdir(new URL('audio/', dir), { recursive: true });
await mkdir(new URL('out/', dir), { recursive: true });
const exists = p => access(p).then(() => true, () => false);
const duration = file => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
const path = u => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, '$1');

// 1. Narration.
// ElevenLabs on fal; script.json picks the model ("eleven-v3" is the more expressive one) and the voice.
const ttsModel = `fal-ai/elevenlabs/tts/${script.model || 'multilingual-v2'}`;
async function speak(text) {
  const file = new URL(`audio/${createHash('sha1').update(ttsModel + script.voice + text).digest('hex').slice(0, 12)}.mp3`, dir);
  if (await exists(file)) return file;
  const res = await fetch(`https://fal.run/${ttsModel}`, { method: 'POST', headers: { authorization: `Key ${process.env.FAL_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ text, voice: script.voice, stability: 0.5, similarity_boost: 0.75, speed: 1.0 }) });
  if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
  const { audio } = await res.json();
  await writeFile(file, Buffer.from(await (await fetch(audio.url)).arrayBuffer()));
  return file;
}
const lead = 0.35, tail = 0.75;
let t = 0;
const scenes = [];
for (const s of script.scenes) {
  const audio = process.argv.includes('--no-tts') ? null : await speak(s.say);
  const spoken = audio ? duration(path(audio)) : s.say.split(' ').length / 2.6;
  const dur = Math.max(s.min || 3, lead + spoken + tail);
  scenes.push({ ...s, start: t, dur, audio: audio && path(audio) });
  t += dur;
}
const total = t;
// Whatever the app's capture measured: boxes.json (page parts), shots.json (studio shots), build.json (frame counts).
const readJson = name => readFile(new URL(`assets/${name}`, dir), 'utf8').then(JSON.parse, () => null);
const boxes = { ...(await readJson('boxes.json')), shots: await readJson('shots.json'), build: await readJson('build.json') };
const extra = script.data ? JSON.parse(await readFile(new URL(script.data, dir), 'utf8')) : {};
await writeFile(new URL('timeline.js', dir), `window.TIMELINE = ${JSON.stringify({ scenes: scenes.map(({ audio, ...s }) => s), boxes: { ...boxes, ...extra }, url: script.url || '' }, null, 2)};\n`);
console.log(`${scenes.length} scenes, ${total.toFixed(1)} s`);

// 2. Frames.
// A port of its own, so two renders can run side by side.
const chrome = await launch({ port: 9400 + Math.floor(Math.random() * 500) });
const tab = await chrome.page({ width: 1920, height: 1080, scale: 1 });
await tab.go(pathToFileURL(path(new URL('compose.html', dir))).href);
await sleep(800);
await tab.evaluate('window.ready');
await sleep(300);

if (preview) {
  const stills = [];
  for (let s = 0.5; s < total; s += 1) { await tab.evaluate(`renderAt(${s})`); const f = new URL(`out/still-${String(stills.length).padStart(3, '0')}.jpg`, dir); await writeFile(f, await tab.shot({ format: 'jpeg', quality: 80 })); stills.push(path(f)); }
  const cols = 6, rows = Math.ceil(stills.length / cols);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', `${path(new URL('out/', dir))}still-%03d.jpg`, '-vf', `scale=480:-1,tile=${cols}x${rows}`, '-frames:v', '1', path(new URL('out/contact.jpg', dir))]);
  console.log('contact sheet: video/' + app + '/out/contact.jpg');
} else {
  const fps = 30, frames = Math.ceil(total * fps);
  const silent = path(new URL(`out/${app}-silent.mp4`, dir));
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < frames; i++) {
    await tab.evaluate(`renderAt(${i / fps})`);
    const buf = await tab.shot({ format: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${frames}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  // 3. Narration track: each line starts just after its scene begins.
  const voiced = scenes.filter(s => s.audio);
  const final = path(new URL(`out/${app}.mp4`, dir));
  const inputs = voiced.flatMap(s => ['-i', s.audio]);
  const filter = voiced.map((s, i) => `[${i + 1}:a]adelay=${Math.round((s.start + lead) * 1000)}|${Math.round((s.start + lead) * 1000)}[a${i}]`).join(';') + `;${voiced.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voiced.length}:normalize=0,apad[aout]`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, ...inputs, '-filter_complex', filter, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', final]);
  console.log(`video: video/${app}/out/${app}.mp4`);
}
await tab.close();
chrome.close();
