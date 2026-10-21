// Record the instant demos: run each one for real against live Qloo, the LLM and the image model, save the
// exact event stream to data/demos/<site>-<slug>.json and copy every render into public/img so it never expires.
//   node --env-file=.env scripts/record-demos.js            (all)
//   node --env-file=.env scripts/record-demos.js room pitch (only some sites)
//   node --env-file=.env scripts/record-demos.js pitch:boehly (one example)
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { createApp } from '../server.js';

const root = new URL('../', import.meta.url);
const demos = {
  openhere: [
    { slug: 'live-music-parkdale', title: 'A live-music room in a cleared Dollarama, Parkdale', path: '/api/agent', body: { spaceId: 'to-1337-queen-w', business: 'live music venue', aspect: '4:3' } },
    { slug: 'redbull-bridgers', title: 'Red Bull × Phoebe Bridgers fans, Parkdale', path: '/api/agent', body: { spaceId: 'to-1337-queen-w', activation: { brand: 'Red Bull', event: 'Phoebe Bridgers' }, aspect: '4:3' } },
    { slug: 'cafe-chelsea', title: 'A café in the Empire Diner car, Chelsea', path: '/api/agent', body: { spaceId: 'nyc-210-tenth-ave', business: 'cafe', aspect: '4:3' } }
  ],
  room: [
    { slug: 'heartbreak', title: 'Velvet Bistro Bedroom', path: '/api/room', body: { text: 'Phoebe Bridgers, Fleabag, Sally Rooney, Glossier, Dr. Martens' } },
    { slug: 'courtside', title: 'Court Side Lounge', path: '/api/room', body: { text: 'Kendrick Lamar, Nike, Jordan Peele films, Issa Rae, Lakers' } },
    { slug: 'rain', title: 'Rain Hour Study', path: '/api/room', body: { text: 'Radiohead, Blade Runner, Haruki Murakami, Muji, Monocle magazine' } }
  ],
  pitch: ['Jason Calacanis|LAUNCH', 'Todd Boehly|Eldridge', 'Michael Abrams|Live Nation'].map(s => {
    const [investor, firm] = s.split('|');
    return { slug: investor.toLowerCase().split(' ').pop(), title: investor, path: '/api/pitch', body: { investor, firm, startup: 'A live-events app that turns a concert ticket into a night out: pre-show bars, merch and rides, picked for each fanbase', comps: 'Ticketmaster, Spotify, Uber' } };
  }),
  talk: [{ slug: 'sample', title: 'A first coffee', mine: 'Bon Iver, Past Lives, Haruki Murakami', lines: [
    ['them', 'Sorry I was late, I was finishing the new Sally Rooney on the train.'],
    ['me', 'No worries. Is it as good as Normal People?'],
    ['them', 'Better, honestly. I have been on such a reading kick. That and Phoebe Bridgers on repeat.'],
    ['them', 'We went to see Past Lives again last weekend and I cried the whole second half.'],
    ['me', 'I have not seen it yet. Is it sad?'],
    ['them', 'Quietly sad. Oh, and I cannot stand superhero films, I fell asleep in the last Marvel one.'],
    ['them', 'Next month I am going to Lisbon, mostly to eat pastries and walk around.']
  ] }]
};

const only = process.argv.slice(2);
const env = { ...process.env, AGENT_RUNS_PER_HOUR: '999', AGENT_RUNS_PER_DAY: '999', BASELINES_PER_HOUR: '999', TALK_SESSIONS_PER_HOUR: '99', SITE: '' };
const server = http.createServer(createApp({ env }));
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const events = text => text.split('\n\n').map(c => c.split('\n').find(l => l.startsWith('data: '))).filter(Boolean).map(l => JSON.parse(l.slice(6)));
await mkdir(new URL('data/demos/', root), { recursive: true });

// Copy every fal-hosted image an event stream points at into public/img and point the stream at the copy.
async function localise(site, slug, list) {
  let text = JSON.stringify(list);
  const urls = [...new Set(text.match(/https:\/\/[a-z0-9.]*fal\.media\/[^"\\]+\.(?:jpe?g|png|webp)/gi) || [])];
  const map = {};
  for (const [i, url] of urls.entries()) {
    const file = `demo-${site}-${slug}-${i + 1}.jpg`;
    const res = await fetch(url);
    if (!res.ok) continue;
    await writeFile(new URL(`public/img/${file}`, root), Buffer.from(await res.arrayBuffer()));
    map[url] = `/img/${file}`;
    text = text.split(url).join(`/img/${file}`);
  }
  return { list: JSON.parse(text), map };
}

for (const [site, list] of Object.entries(demos)) {
  if (only.length && !only.some(o => o.split(':')[0] === site)) continue;
  for (const demo of list) {
    if (!only.some(o => o === site || o === `${site}:${demo.slug}`) && only.length) continue;
    const started = Date.now();
    let record;
    if (site === 'talk') {
      const { id } = await post('/api/talk/start', { consent: true, mine: demo.mine }).then(r => r.json());
      const turns = [];
      for (const [who, text] of demo.lines) turns.push(await post('/api/talk/hear', { id, text, who }).then(r => r.json()));
      record = { site, slug: demo.slug, title: demo.title, request: { mine: demo.mine }, turns };
    } else {
      const raw = events(await post(demo.path, demo.body).then(r => r.text()));
      const done = raw.find(e => e.type === 'done');
      let baseline = null;
      if (site === 'openhere' && done?.runId) baseline = await post('/api/baseline', { runId: done.runId }).then(r => r.ok ? r.json() : null).catch(() => null);
      const { list: localEvents, map } = await localise(site, demo.slug, raw);
      // Renders the replay should re-register (by id), so refine, relight and walk-inside still work.
      const renders = raw.filter(e => (e.type === 'tool_result' && e.name === 'render_redesign') || e.type === 'final').map(e => e.type === 'final' ? e.render : e.data).filter(r => r?.id && r.url)
        .map(r => ({ id: r.id, url: map[r.url] || r.url, remoteUrl: r.url, prompt: r.prompt, aspect: r.aspect, model: r.model, signals: r.signals }));
      record = { site, slug: demo.slug, title: demo.title, request: demo.body, events: localEvents, renders: [...new Map(renders.map(r => [r.id, r])).values()], baseline };
    }
    record.recorded = new Date().toISOString();
    const ok = site === 'talk' ? record.turns.length === demo.lines.length : record.events.some(e => e.type === 'final');
    await writeFile(new URL(`data/demos/${site}-${demo.slug}.json`, root), JSON.stringify(record, null, 1));
    console.log(`${ok ? 'ok ' : 'FAIL'} ${site}/${demo.slug} in ${Math.round((Date.now() - started) / 1000)}s`);
  }
}
server.close();
