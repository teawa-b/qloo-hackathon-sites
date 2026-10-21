import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hosts, parseInterests, entityList, insightParams } from './lib.js';

const port = Number(process.env.PORT || 3210);
const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };

export function createServer(fetcher = fetch) {
  return http.createServer(async (req, res) => {
    const respond = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/api/config') return respond(200, { hasKey: Boolean(process.env.QLOO_API_KEY), host: hosts.includes(process.env.QLOO_API_HOST) ? process.env.QLOO_API_HOST : hosts[0] });
      if (req.method === 'GET' && files[path]) {
        const [name, type] = files[path];
        const file = await readFile(new URL(`./public/${name}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); return res.end(file);
      }
      if (req.method !== 'POST' || !['/api/resolve', '/api/insights'].includes(path)) return respond(404, { error: 'Not found' });
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return respond(403, { error: 'Requests must come from this local app.' });
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 16000) return respond(413, { error: 'Request too large.' }); }
      let body;
      try { body = JSON.parse(raw); } catch { return respond(400, { error: 'Invalid JSON.' }); }
      if (!body || typeof body !== 'object') return respond(400, { error: 'Invalid request.' });
      const key = process.env.QLOO_API_KEY || body.apiKey;
      if (typeof key !== 'string' || !key.trim()) return respond(401, { error: 'Add your Qloo API key in Connection settings first.' });
      const host = body.host || process.env.QLOO_API_HOST || hosts[0];
      if (!hosts.includes(host)) return respond(400, { error: 'Choose a supported Qloo API environment.' });
      async function qloo(route, params) {
        const url = new URL(route, host);
        url.search = new URLSearchParams(params).toString();
        let upstream;
        try { upstream = await fetcher(url, { headers: { 'X-Api-Key': key.trim(), accept: 'application/json' }, signal: AbortSignal.timeout(20000), redirect: 'error' }); }
        catch { throw Object.assign(new Error('Qloo could not be reached within 20 seconds. Check the environment and try again.'), { status: 502 }); }
        let data;
        try { data = await upstream.json(); } catch { throw Object.assign(new Error(`Qloo returned a non-JSON response (HTTP ${upstream.status}).`), { status: 502 }); }
        if (!upstream.ok || data.success === false) {
          const help = upstream.status === 401 || upstream.status === 403 ? 'Check your key and choose the API environment assigned to it.' : upstream.status === 429 ? 'Rate limit reached. Wait a moment before retrying.' : 'Check the request details below.';
          // Preserve upstream errors for debugging, without ever exposing the credential.
          const safe = JSON.parse(JSON.stringify(data).split(key.trim()).join('[redacted]'));
          throw Object.assign(new Error(`Qloo returned HTTP ${upstream.status}. ${help}`), { status: upstream.ok ? 502 : upstream.status, details: safe });
        }
        return { data, request: { method: 'GET', url: url.toString() } };
      }
      if (path === '/api/resolve') {
        const phrases = parseInterests(body.text);
        // Sequential lookups keep a single sentence from bursting the API's rate limit.
        const matches = [];
        for (const phrase of phrases) {
          let search;
          try { search = await qloo('/search', { query: phrase, take: '5' }); }
          catch (error) { if (error.status !== 404) throw error; search = { data: { results: [] }, request: { method: 'GET', url: `${host}/search?${new URLSearchParams({ query: phrase, take: '5' })}` } }; }
          const candidates = entityList(search.data).filter(e => e.entity_id).map(e => ({ id: e.entity_id, kind: 'entity', name: e.name, type: e.subtype || e.types?.[0] || e.type, detail: e.disambiguation || e.properties?.release_year || '' }));
          let tagSearch;
          if (!candidates.length) {
            tagSearch = await qloo('/v2/tags', { 'filter.query': phrase, take: '5' });
            const tags = Array.isArray(tagSearch.data.results) ? tagSearch.data.results : tagSearch.data.results?.tags || tagSearch.data.tags || [];
            candidates.push(...tags.filter(t => t.id).map(t => ({ id: t.id, kind: 'tag', name: t.name, type: t.type, detail: 'Taste tag' })));
          }
          matches.push({ phrase, candidates, search, ...(tagSearch ? { tagSearch } : {}) });
        }
        return respond(200, { matches });
      }
      const result = await qloo('/v2/insights', insightParams(body));
      respond(200, { ...result, entities: entityList(result.data) });
    } catch (error) { respond(error.status || 400, { error: error.message, ...(error.details ? { details: error.details } : {}) }); }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(port, '127.0.0.1', () => console.log(`Taste Lab running at http://127.0.0.1:${port}`));
}
