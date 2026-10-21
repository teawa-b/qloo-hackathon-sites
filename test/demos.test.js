import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server.js';

// Replays must work with no keys at all: a judge on a fresh deploy sees every example.
async function serve(t, env = {}) {
  const server = http.createServer(createApp({ env, fetcher: async url => { throw new Error(`no live calls in a replay: ${url}`); } }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  return `http://127.0.0.1:${server.address().port}`;
}
const post = (base, path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const events = async res => (await res.text()).split('\n\n').map(c => c.split('\n').find(l => l.startsWith('data: '))).filter(Boolean).map(l => JSON.parse(l.slice(6)));

test('recorded examples replay without any API keys, with local images', async t => {
  const base = await serve(t);
  for (const [path, site, body] of [['/api/agent', 'openhere', { spaceId: 'x', business: 'x' }], ['/api/room', 'room', { text: 'x' }], ['/api/pitch', 'pitch', { investor: 'x' }]]) {
    const { demos } = await fetch(`${base}/api/demos?site=${site}`).then(r => r.json());
    assert.ok(demos.length >= 3, `${site} has examples`);
    const ev = await events(await post(base, path, { ...body, demo: demos[0].slug }));
    const final = ev.find(e => e.type === 'final');
    assert.ok(final, `${site} replay ends with a result`);
    assert.equal(JSON.stringify(ev).includes('fal.media'), false, `${site} replay points at local images only`);
    const img = (JSON.stringify(final).match(/\/img\/demo-[a-z0-9-]+\.jpg/) || [])[0];
    if (img) assert.equal((await fetch(`${base}${img}`)).status, 200, `${img} is served`);
  }
  const talk = await post(base, '/api/talk/demo', { demo: 'sample' }).then(r => r.json());
  assert.ok(talk.turns.length >= 5 && talk.turns.at(-1).view.nudges.length);
  const baseline = await post(base, '/api/baseline', { demo: 'redbull-bridgers' }).then(r => r.json());
  assert.ok(baseline.picks?.length);
  assert.equal((await post(base, '/api/room', { text: 'x', demo: '../../etc' })).status, 404, 'demo names are validated');
});
