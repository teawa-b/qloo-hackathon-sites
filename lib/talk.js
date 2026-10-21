import { fetchJson, UpstreamError } from './http.js';

// Talk: a live conversation coach for glasses, a headset or a phone on the table.
//
// Audio arrives in short chunks; ElevenLabs speech-to-text (via fal) turns it into words. Whoever is
// wearing it holds a button while they speak, so every other line is "them". An LLM pulls out the
// cultural things the other person mentions (bands, films, books, places, brands) and whether they like
// them; Qloo resolves each to an entity and builds their taste live: what else people with that taste
// love, and, if you add your own favourites, what you have in common. The LLM then suggests what to
// bring up next, citing only names Qloo returned.
//
// Consent first: the page will not listen until the wearer confirms the other person knows.

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const json = text => JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
const kinds = ['artist', 'movie', 'tv_show', 'book', 'podcast', 'brand', 'place', 'destination', 'videogame', 'person'];
const recTypes = ['artist', 'movie', 'tv_show', 'book', 'podcast', 'brand', 'destination'];

export async function transcribe({ key, audio, fetcher = fetch }) {
  if (!/^data:audio\/[\w.+-]+(;codecs=[\w.,-]+)?;base64,[A-Za-z0-9+/=]+$/.test(audio || '')) throw new UpstreamError('Send audio as a base64 data URI.', 400);
  const data = await fetchJson(fetcher, 'https://fal.run/fal-ai/elevenlabs/speech-to-text', {
    method: 'POST', headers: { authorization: `Key ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: audio, tag_audio_events: false })
  }, { label: 'Speech to text', secrets: [key], timeout: 30000 });
  return String(data.text || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function createTalk({ qloo, llm }) {
  const state = { lines: [], mentions: [], them: new Map(), mine: new Map(), avoid: new Map(), recs: {}, shared: [], nudges: [], updated: 0 };
  let pending = [];

  async function resolveMention(m) {
    const type = kinds.includes(m.kind) ? m.kind : null;
    const hits = await qloo.search(m.name, type, 3).catch(() => []);
    const hit = hits.find(h => h.popularity == null || h.popularity > 0.15);
    return hit && { ...hit, type: (hit.types?.[0] || '').split(':').pop() || type, said: m.name };
  }

  // Pull mentions out of new lines and resolve them. Returns true if the profile changed.
  async function absorb(lines) {
    const text = lines.map(l => `${l.who === 'me' ? 'ME' : 'THEM'}: ${l.text}`).join('\n');
    const session = llm.create({ system: 'You extract cultural references from a conversation transcript. Reply with JSON only.', tools: [], user: `Transcript:\n${text}\n\nList every specific named thing mentioned (bands, artists, films, TV shows, books, authors as "person", podcasts, brands, restaurants or bars as "place", cities or countries as "destination", games as "videogame"). Skip generic words ("pizza", "jazz") unless they are names. JSON: {"mentions": [{"name": "exact name", "kind": "${kinds.join('|')}", "who": "me|them", "feeling": "likes|dislikes|neutral"}]}` });
    const { text: out } = await session.next();
    let found = [];
    try { found = (json(out).mentions || []).slice(0, 12); } catch { return false; }
    let changed = false;
    for (const m of found) {
      const entity = await resolveMention(m);
      if (!entity) continue;
      const bucket = m.feeling === 'dislikes' ? state.avoid : m.who === 'me' ? state.mine : state.them;
      if (!bucket.has(entity.id)) { bucket.set(entity.id, { ...entity, feeling: m.feeling }); changed = true; }
      state.mentions.push({ name: entity.name, said: m.name, who: m.who, feeling: m.feeling, type: entity.type });
    }
    return changed;
  }

  async function refresh() {
    const them = [...state.them.keys()];
    if (!them.length) return;
    const said = new Set([...state.them.keys(), ...state.mine.keys(), ...state.avoid.keys()]);
    const lists = await Promise.all(recTypes.map(type => qloo.fanEntities(them, type, { take: 6 }).then(l => [type, l.filter(e => !said.has(e.id))]).catch(() => [type, []])));
    state.recs = Object.fromEntries(lists.filter(([, l]) => l.length));
    // Common ground: things both your tastes drive, from a combined signal with explainability.
    const mine = [...state.mine.keys()];
    if (mine.length) {
      const both = [...them, ...mine];
      const lists2 = await Promise.all(['artist', 'movie', 'book', 'brand'].map(type => qloo.fanEntities(both, type, { take: 10, explain: true }).catch(() => [])));
      state.shared = lists2.flat().filter(e => !said.has(e.id) && e.share).map(e => {
        const t = them.reduce((s, id) => s + (e.share[id] || 0), 0), m = mine.reduce((s, id) => s + (e.share[id] || 0), 0);
        return { name: e.name, type: e.type, affinity: e.affinity, them: Math.round(t * 100) / 100, me: Math.round(m * 100) / 100 };
      }).filter(e => e.them >= 0.25 && e.me >= 0.25).sort((a, b) => b.affinity - a.affinity).slice(0, 6);
    }
    // Nudges: short, sayable suggestions that cite a Qloo name.
    const allowed = new Map();
    Object.values(state.recs).flat().forEach(e => allowed.set(norm(e.name), e));
    state.shared.forEach(e => allowed.set(norm(e.name), e));
    const recent = state.lines.slice(-8).map(l => `${l.who === 'me' ? 'ME' : 'THEM'}: ${l.text}`).join('\n');
    const session = llm.create({ system: 'You quietly coach someone in a live conversation. Suggestions must be short enough to read at a glance. Use only names from the lists given. Reply with JSON only. Write plainly and never use em dashes.', tools: [], user: `Recent conversation:\n${recent}\n\nThey like: ${[...state.them.values()].map(e => e.name).join(', ')}\nThey dislike: ${[...state.avoid.values()].map(e => e.name).join(', ') || 'nothing yet'}\nQloo: people with their taste also love: ${Object.entries(state.recs).map(([t, l]) => `${t}s: ${l.slice(0, 4).map(e => e.name).join(', ')}`).join('; ')}\nCommon ground (both of you): ${state.shared.map(e => e.name).join(', ') || 'unknown'}\n\nJSON: {"nudges": [up to 3 of {"say": "under 14 words, something natural to say or ask next", "about": "the exact name you are suggesting, copied from the Qloo or Common ground list (not something they already mentioned)", "why": "under 12 words, the Qloo evidence"}]}` });
    const { text } = await session.next();
    try {
      // Small models sometimes put the thing they mentioned in "about"; if the sentence itself names a Qloo
      // result, that result is what the nudge builds on.
      const named = say => [...allowed.values()].find(e => norm(say).includes(norm(e.name)));
      state.nudges = (json(text).nudges || []).slice(0, 3).map(n => {
        const say = String(n.say || '').slice(0, 120), hit = allowed.has(norm(n.about)) ? null : named(say);
        return { say, about: hit ? hit.name : String(n.about || ''), why: String(n.why || '').slice(0, 100), grounded: allowed.has(norm(n.about)) || !!hit };
      });
    } catch { /* keep the last nudges */ }
  }

  return {
    state,
    async setMine(names) {
      state.mine.clear();
      for (const name of names.slice(0, 8)) { const e = await resolveMention({ name }); if (e) state.mine.set(e.id, { ...e, feeling: 'likes' }); }
    },
    // Add one utterance; mentions are extracted in batches so a fast talker does not queue LLM calls.
    async hear(text, who = 'them') {
      const line = { who: who === 'me' ? 'me' : 'them', text: String(text).slice(0, 600), t: Date.now() };
      if (!line.text) return false;
      state.lines.push(line); if (state.lines.length > 60) state.lines.shift();
      pending.push(line);
      const batch = pending; pending = [];
      const changed = await absorb(batch);
      if (changed || !state.nudges.length) await refresh();
      state.updated = Date.now();
      return changed;
    },
    view() {
      const list = m => [...m.values()].map(({ name, type, id }) => ({ name, type, id }));
      return { lines: state.lines.slice(-12), them: list(state.them), mine: list(state.mine), avoid: list(state.avoid), recs: Object.fromEntries(Object.entries(state.recs).map(([t, l]) => [t, l.slice(0, 5).map(({ name, affinity, type }) => ({ name, affinity, type }))])), shared: state.shared, nudges: state.nudges, updated: state.updated };
    }
  };
}
