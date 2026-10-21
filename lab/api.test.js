import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInterests, insightParams } from '../lib.js';
import { createServer } from '../server.js';

const id = '369D1544-628B-4C21-95A0-1488117A308A';
test('sentences, repeated clauses and quoted titles retain useful search phrases', () => {
  assert.deepEqual(parseInterests('I love Blade Runner 2049, Cyberpunk 2077 and The Weeknd.'), ['Blade Runner 2049', 'Cyberpunk 2077', 'The Weeknd']);
  assert.deepEqual(parseInterests('I like "Pride and Prejudice" and I enjoy "Earth, Wind & Fire".'), ['Pride and Prejudice', 'Earth, Wind & Fire']);
  assert.deepEqual(parseInterests('I like Dune. I love Radiohead.'), ['Dune', 'Radiohead']);
  assert.throws(() => parseInterests(''), /at least one/);
  assert.throws(() => parseInterests(Array(14).fill(0).map((_, i) => `interest ${i}`).join(',')), /up to 12/);
});
test('recommendations use documented signals, exclusion and location filters', () => {
  const params = insightParams({ category: 'place', entities: [id], tags: ['urn:tag:genre:media:comedy'], location: 'London' });
  assert.equal(params['filter.type'], 'urn:entity:place');
  assert.equal(params['signal.interests.entities'], id);
  assert.equal(params['signal.interests.tags'], 'urn:tag:genre:media:comedy');
  assert.equal(params['filter.exclude.entities'], id);
  assert.equal(params['filter.location.query'], 'London');
  assert.equal(insightParams({ category: 'movie', entities: [id], location: 'London' })['filter.location.query'], undefined);
  assert.equal(insightParams({ category: 'videogame', entities: [id] })['filter.type'], 'urn:entity:videogame');
  assert.equal(insightParams({ category: 'tv_show', entities: [id] })['filter.type'], 'urn:entity:tv_show');
  assert.throws(() => insightParams({ category: 'movie', entities: [] }), /Select at least one/);
  assert.throws(() => insightParams({ category: 'invalid', entities: [id] }), /supported/);
});
test('local API proxies authentication, handles entity/tag resolution, and surfaces errors', async t => {
  const requests = [];
  const server = createServer(async (url, options) => {
    requests.push({ url, options });
    assert.equal(options.headers['X-Api-Key'], 'local-test-key');
    if (url.pathname === '/search') return Response.json({ results: url.searchParams.get('query') === 'Dune' ? [{ name: 'Dune', entity_id: id, subtype: 'urn:entity:movie' }] : [] });
    if (url.pathname === '/v2/tags') return Response.json({ results: { tags: [{ id: 'urn:tag:genre:media:comedy', name: 'Comedy', type: 'urn:tag:genre:media' }] } });
    if (url.searchParams.get('filter.location.query') === 'error') return Response.json({ error: 'local-test-key rejected' }, { status: 429 });
    return Response.json({ success: true, results: { entities: [{ name: 'Recommendation', entity_id: id }] } });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ apiKey: 'local-test-key', host: 'https://hackathon.api.qloo.com', ...body }) });
  const resolved = await post('/api/resolve', { text: 'Dune, comedy' }).then(r => r.json());
  assert.equal(resolved.matches[0].candidates[0].kind, 'entity');
  assert.equal(resolved.matches[1].candidates[0].kind, 'tag');
  assert.equal(requests.length, 3);
  const insights = await post('/api/insights', { category: 'movie', entities: [id] }).then(r => r.json());
  assert.equal(insights.entities[0].name, 'Recommendation');
  assert.equal(insights.request.method, 'GET');
  assert.equal((await post('/api/resolve', { text: 'Dune', host: 'https://evil.example' })).status, 400);
  assert.equal((await post('/api/resolve', { text: 'Dune' }, { origin: 'https://evil.example' })).status, 403);
  const error = await post('/api/insights', { category: 'place', entities: [id], location: 'error' });
  assert.equal(error.status, 429);
  assert.equal(JSON.stringify(await error.json()).includes('local-test-key'), false);
});
