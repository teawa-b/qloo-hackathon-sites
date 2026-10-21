import { readFile, readdir } from 'node:fs/promises';

// Instant demos: real runs recorded once (scripts/record-demos.js) and replayed on request, so a judge sees a
// finished result in a few seconds without waiting on, or paying for, live Qloo, LLM and image calls.
// A recording is the exact event stream the live run sent, plus the renders it produced (copied to
// public/img so they never expire). Replays say so in the UI; typing your own input always runs live.

const dir = new URL('../data/demos/', import.meta.url);
const cache = new Map();

export async function loadDemo(site, slug) {
  if (!/^[a-z0-9-]{1,60}$/.test(String(slug || ''))) return null;
  const key = `${site}-${slug}`;
  if (!cache.has(key)) cache.set(key, readFile(new URL(`${key}.json`, dir), 'utf8').then(JSON.parse).catch(() => null));
  return cache.get(key);
}

export async function listDemos(site) {
  const names = await readdir(dir).catch(() => []);
  const out = [];
  for (const name of names.filter(n => n.startsWith(`${site}-`) && n.endsWith('.json'))) {
    const demo = await loadDemo(site, name.slice(site.length + 1, -5));
    if (demo) out.push({ slug: demo.slug, title: demo.title, request: demo.request });
  }
  return out;
}

// Stream a recording at a readable pace: tool steps tick by quickly, the result lands at the end.
export async function replay(demo, emit, { step = 140 } = {}) {
  for (const event of demo.events) {
    if (event.type === 'done') { emit({ ...event, demo: true }); continue; }
    emit(event);
    if (['tool_call', 'tool_result', 'step', 'step_done', 'thought'].includes(event.type)) await new Promise(r => setTimeout(r, step));
  }
}
