// Voice samples for the explainer narration, so a person can pick by ear:
//   node --env-file=.env video/voices.js
// Writes video/voices/<model>-<voice>.mp3, all reading the same line.
import { mkdir, writeFile } from 'node:fs/promises';

const line = 'Founders get one meeting with an investor. Pitchprep makes sure you walk in knowing what to say.';
const tries = [
  ['v3', 'fal-ai/elevenlabs/tts/eleven-v3', 'Sarah'],
  ['v3', 'fal-ai/elevenlabs/tts/eleven-v3', 'Jessica'],
  ['v3', 'fal-ai/elevenlabs/tts/eleven-v3', 'Brian'],
  ['v3', 'fal-ai/elevenlabs/tts/eleven-v3', 'Chris']
];
await mkdir(new URL('./voices/', import.meta.url), { recursive: true });
for (const [tag, model, voice] of tries) {
  const res = await fetch(`https://fal.run/${model}`, { method: 'POST', headers: { authorization: `Key ${process.env.FAL_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ text: line, voice, stability: 0.5 }) });
  const data = await res.json().catch(() => ({}));
  if (!data.audio) { console.log(tag, voice, res.status, JSON.stringify(data).slice(0, 200)); continue; }
  await writeFile(new URL(`./voices/${tag}-${voice}.mp3`, import.meta.url), Buffer.from(await (await fetch(data.audio.url)).arrayBuffer()));
  console.log('saved', tag, voice);
}
