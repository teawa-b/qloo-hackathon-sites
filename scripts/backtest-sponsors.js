// Sponsor backtest for Openhere's activation mode.
//
// Question: given only who is on the bill (or which team is playing), can each method tell which brands
// actually sponsored that event, out of a pool of every brand that sponsored any event in the dataset?
//
// Data: data/sponsors.json (real events, their headliners, their real sponsors, with sources).
// Pool: every sponsor of every event, resolved to a Qloo brand entity. For each event the pool is ranked by:
//   qloo        Qloo affinity of each brand for fans of the headliners (signal.interests.entities =
//               headliners, filter.results.entities = the pool, in batches)
//   llm         the same LLM the agent uses, given the same headliners and the same shuffled pool, scoring
//               each brand 0-100 for fit with that audience (no tools, no event name)
//   popularity  each brand's overall Qloo popularity (the "just pick big brands" baseline)
// Neither ranker is told the event's name, so nobody can recall the sponsor list from memory.
// Metric: AUC of the event's own sponsors against the rest of the pool (0.5 = chance, 1 = perfect), plus
// how many of the event's sponsors land in the top 10.
//
//   node --env-file=.env scripts/backtest-sponsors.js
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createQloo } from '../lib/qloo.js';
import { chooseLlm } from '../lib/llm.js';

const root = new URL('../', import.meta.url);
const data = JSON.parse(await readFile(new URL('data/sponsors.json', root), 'utf8'));
const qloo = createQloo({ key: process.env.QLOO_API_KEY, host: process.env.QLOO_API_HOST || undefined });
const llm = chooseLlm(process.env);
if (!llm) throw new Error('Set OPENROUTER_API_KEY (or another LLM key) for the LLM baseline.');
const norm = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const retry = async fn => { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= 3 || e.status !== 429) throw e; await sleep(1000 * (i + 1)); } } };

// 1. Resolve brands and headliners. A brand only counts if Qloo's top match has the same name.
const brandCache = new Map();
async function brand(name) {
  if (!brandCache.has(norm(name))) {
    const hits = await retry(() => qloo.search(name, 'brand', 5)).catch(() => []);
    const hit = hits.find(h => norm(h.name) === norm(name)) || hits.find(h => norm(h.name).startsWith(norm(name)) || norm(name).startsWith(norm(h.name)));
    brandCache.set(norm(name), hit ? { id: hit.id, name: hit.name, popularity: hit.popularity ?? 0 } : null);
  }
  return brandCache.get(norm(name));
}
async function act(name, kind) {
  const types = kind === 'team' ? ['brand', 'person'] : ['artist', 'person', 'brand'];
  for (const type of types) {
    const hit = (await retry(() => qloo.search(name, type, 3)).catch(() => [])).find(h => norm(h.name) === norm(name)) ;
    if (hit) return { id: hit.id, name: hit.name };
  }
  return null;
}

const events = [];
for (const e of data.events) {
  const signals = (await Promise.all(e.headliners.map(h => act(h, e.kind)))).filter(Boolean);
  const sponsors = [];
  for (const s of e.sponsors) { const b = await brand(s); if (b && !sponsors.some(x => x.id === b.id)) sponsors.push(b); }
  if (!signals.length || sponsors.length < 2) { console.log(`skip ${e.id}: ${signals.length} headliners, ${sponsors.length} sponsors in Qloo`); continue; }
  events.push({ ...e, signals, resolved: sponsors });
}
const pool = [...new Map(events.flatMap(e => e.resolved).map(b => [b.id, b])).values()];
console.log(`${events.length} events, pool of ${pool.length} brands`);

// 2. Rank the pool three ways for each event.
function auc(scores, positives) {
  const pos = scores.filter(s => positives.has(s.id)), neg = scores.filter(s => !positives.has(s.id));
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p.score > n.score ? 1 : p.score === n.score ? 0.5 : 0;
  return pos.length && neg.length ? wins / (pos.length * neg.length) : null;
}
const top10 = (scores, positives) => [...scores].sort((a, b) => b.score - a.score).slice(0, 10).filter(s => positives.has(s.id)).length;

async function qlooScores(e) {
  const out = new Map();
  for (let i = 0; i < pool.length; i += 40) {
    const batch = pool.slice(i, i + 40).map(b => b.id);
    for (const r of await retry(() => qloo.rank(e.signals.map(s => s.id), 'brand', batch))) out.set(r.id, r.affinity ?? 0);
  }
  return pool.map(b => ({ id: b.id, score: out.get(b.id) ?? 0 }));
}
async function llmScores(e) {
  const shuffled = [...pool].sort(() => Math.random() - .5);
  const session = llm.create({ system: 'You are a sponsorship strategist. Reply with JSON only.', tools: [], user: `An event's audience is the fans of: ${e.signals.map(s => s.name).join(', ')}.\nScore every brand below from 0 to 100 for how likely it is to sponsor or run an activation for this audience. Use every name exactly as written.\nBrands: ${shuffled.map(b => b.name).join('; ')}\nJSON: {"scores": {"<brand>": <0-100>, ...}}` });
  const { text } = await retry(() => session.next());
  const scores = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)).scores || {};
  const byName = new Map(Object.entries(scores).map(([k, v]) => [norm(k), Number(v) || 0]));
  return pool.map(b => ({ id: b.id, score: byName.get(norm(b.name)) ?? 0 }));
}
const popularityScores = () => pool.map(b => ({ id: b.id, score: b.popularity }));

const rows = [];
for (const e of events) {
  const positives = new Set(e.resolved.map(b => b.id));
  const [q, l] = [await qlooScores(e), await llmScores(e).catch(err => { console.log(`llm failed for ${e.id}: ${err.message}`); return null; })];
  const p = popularityScores();
  const row = { id: e.id, name: e.name, year: e.year, kind: e.kind, headliners: e.signals.map(s => s.name), sponsors: e.resolved.map(b => b.name),
    qloo: { auc: auc(q, positives), top10: top10(q, positives) }, llm: l && { auc: auc(l, positives), top10: top10(l, positives) }, popularity: { auc: auc(p, positives), top10: top10(p, positives) } };
  rows.push(row);
  console.log(`${e.id.padEnd(28)} qloo ${row.qloo.auc?.toFixed(2)}  llm ${row.llm?.auc?.toFixed(2) ?? ' -- '}  pop ${row.popularity.auc?.toFixed(2)}`);
}

// 3. Summarise.
const mean = xs => { const v = xs.filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const both = rows.filter(r => r.llm);
const summary = {
  ran: new Date().toISOString(), events: rows.length, pool: pool.length,
  mean_auc: { qloo: mean(rows.map(r => r.qloo.auc)), llm: mean(both.map(r => r.llm.auc)), popularity: mean(rows.map(r => r.popularity.auc)) },
  sponsors_in_top10: { qloo: rows.reduce((s, r) => s + r.qloo.top10, 0), llm: both.reduce((s, r) => s + r.llm.top10, 0), popularity: rows.reduce((s, r) => s + r.popularity.top10, 0), total: rows.reduce((s, r) => s + Math.min(10, r.sponsors.length), 0) },
  qloo_beats_llm: both.filter(r => r.qloo.auc > r.llm.auc).length, compared: both.length, llm_model: llm.label
};
await mkdir(new URL('docs/backtest/', root), { recursive: true });
await writeFile(new URL('docs/backtest/results.json', root), JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
