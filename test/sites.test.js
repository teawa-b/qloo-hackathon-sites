import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp, sites } from '../server.js';

async function serve(t, env) {
  const server = http.createServer(createApp({ env, fetcher: async () => { throw new Error('no upstream calls in this test'); } }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('each site serves its own home at "/" with its own name, and nothing that belongs to another site', async t => {
  const brands = { openhere: 'open<b>here</b>', room: '<span>Roomful</span>', pitch: '<span>Pitchprep</span>', talk: '<span>SmallTalk</span>', lab: 'taste<span class="brand-mark">lab</span>' };
  const others = { openhere: ['/pitch', '/api/talk/start', '/room.js'], room: ['/pitch', '/api/agent', '/talk.js'], pitch: ['/talk', '/api/room', '/app.js'], talk: ['/pitch', '/api/pitch', '/live'], lab: ['/talk', '/api/pitch'] };
  for (const key of Object.keys(sites)) {
    const base = await serve(t, { SITE: key });
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200, key);
    const html = await home.text();
    assert.ok(html.includes(brands[key]), `${key} shows its own logo`);
    assert.equal(/open<b>here<\/b>/.test(html) && key !== 'openhere', false, `${key} does not say Openhere`);
    assert.equal(/class="modes"/.test(html), false, `${key} has no cross-site menu`);
    for (const path of others[key]) assert.equal((await fetch(`${base}${path}`, { method: path.startsWith('/api/') && path !== '/api/config' ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: path.startsWith('/api/') ? '{}' : undefined })).status, 404, `${key} hides ${path}`);
    const config = await fetch(`${base}/api/config`).then(r => r.json());
    assert.deepEqual([config.site, config.siteName], [key, sites[key].name]);
    assert.equal((await fetch(`${base}/style.css`)).status, 200);
  }
});
