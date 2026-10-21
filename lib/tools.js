import { placeTagTypes, entityTypes, rankVenueTags } from './qloo.js';
import { imageBytes } from './images.js';

// A vision pass names the room's permanent architecture once per photo. The agent uses it to place
// things ("counter along the left wall") and the image prompt uses it as the keep-list, following
// Pruna's edit formula: "Change [specific things]. Keep [named things] identical."
const surveys = new Map();
const surveyQuestion = `You are surveying a photo of a commercial interior before a renovation render. Reply with JSON only, no prose:
{"depth": "one sentence on how deep the room reads and its zones, e.g. long narrow room receding about 25 m; foreground floor bottom third, middle zone around the columns, back wall small at centre",
 "keep": [6-10 short phrases naming only the permanent structure you can see (walls, windows, doors, columns, beams, ceiling, stairs, ducts), each with where it sits in the frame; leave out wall coverings, flooring, furniture, signage and light fixtures, since a redesign will change those, e.g. "drop-ceiling grid with two rows of fluorescent lights", "two square white columns toward the back right", "glass storefront windows along the left wall", "dark doorway in the centre of the back wall"],
 "camera": "one short phrase on the viewpoint, e.g. eye level from the entrance looking toward the back wall",
 "surfaces": [3-6 current finishes or fixtures that a redesign could restyle, with position, e.g. "grey slatwall along the left wall", "stained white vinyl floor tiles"]}`;
const depths = new Map();
const ageBands = ['24_and_younger', '25_to_29', '30_to_34', '35_to_44', '45_to_54', '55_and_older'];
const bandLabel = { '24_and_younger': 'under 25', '25_to_29': '25–29', '30_to_34': '30–34', '35_to_44': '35–44', '45_to_54': '45–54', '55_and_older': '55+' };
function averageDemo(items) {
  const age = Object.fromEntries(ageBands.map(b => [b, 0])), gender = { male: 0, female: 0 };
  let total = 0;
  for (const { demo, w } of items) {
    if (!demo) continue;
    total += w;
    ageBands.forEach(b => { age[b] += w * (demo.age[b] || 0); });
    gender.male += w * (demo.gender.male || 0); gender.female += w * (demo.gender.female || 0);
  }
  const r = n => Math.round((total ? n / total : 0) * 100) / 100;
  return { age: Object.fromEntries(ageBands.map(b => [b, r(age[b])])), gender: { male: r(gender.male), female: r(gender.female) } };
}
// Cosine similarity of two age-skew profiles: +1 same crowd, -1 opposite crowd.
function similarity(a, b) {
  const x = ageBands.map(k => a[k] || 0), y = ageBands.map(k => b[k] || 0);
  const dot = x.reduce((s, v, i) => s + v * y[i], 0), n = Math.hypot(...x) * Math.hypot(...y);
  return n ? dot / n : 0;
}
function skew(d) {
  const top = ageBands.reduce((best, b) => (d.age[b] ?? -9) > (d.age[best] ?? -9) ? b : best, ageBands[0]);
  const g = (d.gender?.female || 0) - (d.gender?.male || 0);
  return `${bandLabel[top]}${Math.abs(g) >= 0.3 ? `, ${g > 0 ? 'female' : 'male'}` : ''}`;
}
// What each kind of event venue books, which local rooms seed it, and roughly how much floor a guest takes.
const slatePlans = {
  music: { venue: 'live music venue', types: ['artist'], sqftPerGuest: 9, label: 'acts' },
  comedy: { venue: 'comedy club', types: ['person', 'podcast'], sqftPerGuest: 12, label: 'comedians and live-taping podcasts' },
  sports: { venue: 'sports bar', types: ['person', 'brand'], sqftPerGuest: 15, label: 'athletes and teams' },
  talks: { venue: 'coworking space', types: ['podcast', 'brand'], sqftPerGuest: 15, label: 'podcasts and brands' }
};
const genericKeep = ['the walls, windows and doors in their current positions', 'the ceiling and its height', 'every column and structural beam', 'the floor plan'];

// Tools the agent can call. Each returns { forModel, ui, summary }: compact JSON for the LLM,
// richer data for the browser, and a one-line summary for the activity feed.
// Every Qloo tag, venue or entity the agent sees is recorded so finalize_concept can
// check that each cited signal really came from Qloo.

const definitions = [
  {
    name: 'get_listing',
    description: 'Read the commercial space: address, neighborhood, size, rent, former use and photo.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'local_taste_tags',
    description: "Qloo taste around the listing for one facet. ambience and customer_identity come from Qloo's location taste analysis (ranked by affinity); other facets are ranked from the tags of the ~40 venues Qloo scores highest for local taste. Call once per facet you care about.",
    parameters: { type: 'object', properties: { facet: { type: 'string', enum: Object.keys(placeTagTypes), description: 'Which facet to rank.' } }, required: ['facet'], additionalProperties: false }
  },
  {
    name: 'local_venues',
    description: 'Qloo place insights: venues near the listing ranked for local taste, with price level, rating, popularity and their Qloo tags. Use for competitors and to see what locals already love.',
    parameters: { type: 'object', properties: {
      category: { type: 'string', description: 'Venue category to look up, e.g. "cafe", "cocktail bar", "ramen". Defaults to the business type.' },
      radius_m: { type: 'integer', minimum: 200, maximum: 5000, description: 'Search radius in meters (default 1200).' },
      price_max: { type: 'integer', minimum: 1, maximum: 4 }
    }, additionalProperties: false }
  },
  {
    name: 'local_entities',
    description: 'Cross-domain Qloo insights: the artists, brands, movies, TV shows, books or podcasts with the highest affinity for people in this location. Use for soundtrack, decor references and brand partnerships.',
    parameters: { type: 'object', properties: {
      type: { type: 'string', enum: entityTypes },
      tag_query: { type: 'string', description: 'Optional genre to narrow results, resolved to a Qloo tag in the right family: music genres for artists ("hip hop", "jazz"), media genres for tv_show/podcast ("comedy"), brand genres for brands. Leave empty for the area\'s overall favourites; for sports teams use type brand with no tag_query.' }
    }, required: ['type'], additionalProperties: false }
  },
  {
    name: 'book_slate',
    description: 'For event venues: Qloo picks who to book (or which games/teams to programme). It sizes the room from the listing, caps Qloo popularity so acts can realistically fill (not oversell) it, seeds the search with similar local venues so results reflect their audiences, and returns ranked candidates. Programming acts must come from this tool.',
    parameters: { type: 'object', properties: {
      kind: { type: 'string', enum: ['music', 'comedy', 'sports', 'talks'], description: 'Kind of programming; defaults from the business type.' },
      genre: { type: 'string', description: 'Optional genre to narrow artists, e.g. "jazz", "hip hop".' }
    }, additionalProperties: false }
  },
  {
    name: 'check_audience_fit',
    description: 'Qloo demographic check, required before render_redesign. Compares the age and gender skew of each design tag you plan to use (decor, ambience, cuisine…) against the skew of the venues locals rank highest here. Drop or replace any tag marked mismatch, and explain it in finalize_concept.',
    parameters: { type: 'object', properties: { tags: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string' }, description: 'Exact tag names returned by local_taste_tags or other tools.' } }, required: ['tags'], additionalProperties: false }
  },
  {
    name: 'search_tags',
    description: 'Look up Qloo tag ids by keyword, optionally inside one facet.',
    parameters: { type: 'object', properties: { query: { type: 'string' }, facet: { type: 'string', enum: Object.keys(placeTagTypes) } }, required: ['query'], additionalProperties: false }
  },
  {
    name: 'render_redesign',
    description: 'Edit the real listing photo into the redesigned interior (shown as a before/after wipe of the same photo). Call once, after profiling.',
    parameters: { type: 'object', properties: {
      edit_prompt: { type: 'string', description: 'What changes, 40–90 words of plain sentences that start with "Change" or "Restyle". Name each surface or zone from the room survey and exactly what it becomes (material, colour as a name or hex, finish), which furniture goes where in the frame, and which light fixtures replace which. Describe only changes: the app appends the keep-list of permanent architecture. Positive phrasing (say what is there, never "no X"); no filler like stunning, 8k or cinematic. Place things by depth zone from room_depth (foreground, middle, back) so they keep the right scale. Any sign or lettering must give its exact words in double quotes, e.g. a neon sign reading "Aisle Nine"; otherwise describe signs without text.' },
      signals_used: { type: 'array', items: { type: 'string' }, description: 'Names of Qloo signals reflected in this edit.' }
    }, required: ['edit_prompt', 'signals_used'], additionalProperties: false }
  },
  {
    name: 'finalize_concept',
    description: 'Submit the final concept. Every design choice must cite the exact names of Qloo signals returned by earlier calls.',
    parameters: { type: 'object', properties: {
      name: { type: 'string', description: 'Concept name.' },
      tagline: { type: 'string' },
      audience: { type: 'string', description: 'Who lives and goes out here, per Qloo, in 2–3 sentences.' },
      gap: { type: 'string', description: 'What the local venue set is missing that this concept fills.' },
      offer: { type: 'string', description: 'Menu or offer and price point.' },
      design_choices: { type: 'array', minItems: 3, maxItems: 7, items: { type: 'object', properties: {
        element: { type: 'string', description: 'e.g. Lighting, Seating, Materials, Soundtrack, Signage' },
        choice: { type: 'string' },
        signals: { type: 'array', items: { type: 'string' }, minItems: 1 }
      }, required: ['element', 'choice', 'signals'], additionalProperties: false } },
      risks: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      programming: { type: 'array', maxItems: 6, description: 'For venues that host events (live music, comedy, sports, talks): a booking slate drawn from local_entities results, e.g. who to book or which games to show.', items: { type: 'object', properties: {
        slot: { type: 'string', description: 'e.g. Friday headliner, Thursday residency, Sunday watch party' },
        act: { type: 'string', description: 'Exact name of the artist, comedian, team, show or podcast as Qloo returned it' },
        why: { type: 'string', description: 'One short line on the local fit' },
        signals: { type: 'array', items: { type: 'string' }, minItems: 1 }
      }, required: ['slot', 'act', 'why', 'signals'], additionalProperties: false } }
    }, required: ['name', 'tagline', 'audience', 'gap', 'offer', 'design_choices'], additionalProperties: false }
  }
];

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function createTools({ qloo, listing, business, imageModel, saveRender, look }) {
  const state = { signals: new Map(), render: null, final: null, tagCache: new Map(), venuePool: null };
  const where = listing.lat != null ? { lat: listing.lat, lng: listing.lng } : { query: listing.locationQuery || listing.city };
  const record = (name, kind, source, extra = {}) => { if (name && !state.signals.has(norm(name))) state.signals.set(norm(name), { name, kind, source, ...extra }); };

  async function resolveTag(query, tagType) {
    const key = `${tagType || ''}|${norm(query)}`;
    if (!state.tagCache.has(key)) state.tagCache.set(key, (await qloo.tags(query, tagType))[0] || null);
    return state.tagCache.get(key);
  }

  // The depth map is fetched alongside the survey so it is ready by the time the agent renders.
  async function depthOf() {
    const key = listing.photo || listing.id;
    if (!imageModel?.depth || !(listing.photo || listing.photoBytes)) return null;
    if (!depths.has(key)) depths.set(key, imageModel.depth(listing.photoBytes ? { bytes: listing.photoBytes, type: listing.photoType } : { url: listing.photo }).catch(() => null));
    return depths.get(key);
  }

  async function survey() {
    const key = listing.photo || listing.id;
    if (!look || !(listing.photo || listing.photoBytes)) return null;
    if (!surveys.has(key)) surveys.set(key, (async () => {
      const img = await imageBytes(listing.photoBytes ? { bytes: listing.photoBytes, type: listing.photoType } : { url: listing.photo });
      const text = await look(`data:${img.type};base64,${Buffer.from(img.bytes).toString('base64')}`, surveyQuestion);
      const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      return { keep: (json.keep || []).slice(0, 10).map(String), camera: String(json.camera || ''), depth: String(json.depth || ''), surfaces: (json.surfaces || []).slice(0, 6).map(String) };
    })().catch(() => null));
    return surveys.get(key);
  }

  const handlers = {
    async get_listing() {
      const { photoBytes, photos, details, aspect, ...info } = listing;
      const forModel = {
        ...info, photo: listing.photo ? 'available' : 'none', credit: undefined,
        rentNote: listing.kind === 'demo' ? 'Rent is an illustrative estimate, not an asking price.' : listing.kind === 'live' ? 'Live LoopNet listing; rent is the asking rate.' : undefined,
        ...(details ? { listing_name: details.name, subtype: details.subtype, size: details.sizeText, lease: details.lease, built: details.built, description: details.description, highlights: details.highlights, walk_transit_bike_scores: details.scores, street_traffic: details.traffic, transit: details.transit } : {})
      };
      depthOf();
      const room = await survey();
      if (room) Object.assign(forModel, { room_architecture: room.keep, camera_viewpoint: room.camera, room_depth: room.depth, current_finishes: room.surfaces });
      return { forModel, ui: { listing: info, room }, summary: `${listing.title}, ${listing.neighborhood || listing.city}${room ? ` · surveyed ${room.keep.length} permanent features` : ''}` };
    },
    async local_taste_tags({ facet }) {
      const tagType = placeTagTypes[facet];
      if (!tagType) throw new Error(`Unknown facet ${facet}.`);
      let tags = await qloo.areaTags(where, tagType), method = 'location taste analysis';
      if (!tags.length) {
        state.venuePool ||= qloo.localVenuePool(where);
        const pool = await state.venuePool;
        tags = rankVenueTags(pool, tagType).slice(0, 15);
        method = `tags of the ${pool.length} venues Qloo ranks highest for local taste`;
      }
      tags.forEach(t => record(t.name, 'tag', `local_taste_tags:${facet}`, { id: t.id, affinity: t.affinity }));
      return { forModel: { facet, method, tags: tags.map(({ name, affinity, venues }) => ({ name, affinity, venues })) }, ui: { facet, method, tags }, summary: tags.length ? `${facet.replace(/_/g, ' ')}: ${tags.slice(0, 5).map(t => t.name).join(', ')}` : `No ${facet} tags returned here` };
    },
    async local_venues({ category, radius_m = 1200, price_max } = {}) {
      const query = category || business;
      const tag = await resolveTag(query, 'urn:tag:genre:place');
      const venues = await qloo.places(where, { tagId: tag?.id, radius: radius_m, priceMax: price_max });
      venues.forEach(v => { record(v.name, 'place', 'local_venues', { id: v.id, affinity: v.affinity }); v.tags.forEach(t => record(t, 'tag', `venue:${v.name}`)); });
      return {
        forModel: { category: query, matched_tag: tag?.name || null, radius_m, venues: venues.map(({ image, id, ...v }) => v) },
        ui: { category: query, tag, venues },
        summary: venues.length ? `${venues.length} ${tag?.name || query} venues: ${venues.slice(0, 3).map(v => v.name).join(', ')}` : `No ${query} venues within ${radius_m} m`
      };
    },
    async local_entities({ type, tag_query }) {
      const family = { artist: 'urn:tag:genre:music', brand: 'urn:tag:genre:brand', movie: 'urn:tag:genre:media', tv_show: 'urn:tag:genre:media', podcast: 'urn:tag:genre:media', book: 'urn:tag:genre:media' }[type];
      const tag = tag_query ? await resolveTag(tag_query, family) : null;
      const entities = await qloo.entities(where, type, { tagId: tag?.id });
      entities.forEach(e => record(e.name, type, 'local_entities', { id: e.id, affinity: e.affinity }));
      return { forModel: { type, theme: tag?.name || null, entities: entities.map(({ image, id, ...e }) => e) }, ui: { type, tag, entities }, summary: entities.length ? `${type}s: ${entities.slice(0, 4).map(e => e.name).join(', ')}` : `No ${type} results for this area` };
    },
    async book_slate({ kind, genre } = {}) {
      kind ||= /comedy|stand.?up|improv/i.test(business) ? 'comedy' : /sport/i.test(business) ? 'sports' : /founder|startup|podcast|cowork/i.test(business) ? 'talks' : 'music';
      const plan = slatePlans[kind];
      // Room size → audience → how big an act can be before the room is the wrong fit.
      const capacity = listing.sqftApprox ? Math.round(listing.sqftApprox / plan.sqftPerGuest) : null;
      const popularityMax = capacity == null ? 0.93 : capacity <= 120 ? 0.85 : capacity <= 300 ? 0.9 : capacity <= 800 ? 0.94 : capacity <= 2000 ? 0.97 : 0.99;
      // Seed with similar local rooms, widening the search if none are close by.
      const tag = await resolveTag(plan.venue, 'urn:tag:genre:place');
      let seedVenues = [];
      for (const radius of [3000, 8000, 20000]) {
        seedVenues = tag ? await qloo.places(where, { tagId: tag.id, radius, take: 6 }) : [];
        if (seedVenues.length >= 2) break;
      }
      const seeds = seedVenues.slice(0, 5).map(v => v.id).filter(Boolean);
      const genreTag = genre && plan.types[0] === 'artist' ? await resolveTag(genre, 'urn:tag:genre:music') : null;
      const candidates = {};
      for (const type of plan.types) {
        const list = await qloo.entities(where, type, { seeds, popularityMax, take: 12, tagId: type === 'artist' ? genreTag?.id : undefined });
        candidates[type] = list.map(({ image, id, tags, ...e }) => e);
        list.forEach(e => record(e.name, type, 'book_slate', { id: e.id, affinity: e.affinity }));
      }
      seedVenues.forEach(v => record(v.name, 'place', 'book_slate'));
      state.slate = { kind, capacity, popularityMax, seededBy: seedVenues.map(v => v.name), genre: genreTag?.name || null };
      const total = Object.values(candidates).reduce((n, l) => n + l.length, 0);
      return {
        forModel: { ...state.slate, note: `Acts are capped at Qloo popularity ${popularityMax} for a room of about ${capacity ?? 'unknown'} guests, and ranked for fans of ${seedVenues.length ? seedVenues.map(v => v.name).join(', ') : 'this area'}.`, candidates },
        ui: { ...state.slate, candidates },
        summary: `${total} ${plan.label} for ~${capacity ?? '?'} guests${seedVenues.length ? `, seeded by ${seedVenues.slice(0, 3).map(v => v.name).join(', ')}` : ''}`
      };
    },
    async check_audience_fit({ tags = [] }) {
      // The area: average Qloo demographics of the venues ranked highest for local taste (rank-weighted).
      state.venuePool ||= qloo.localVenuePool(where);
      const pool = (await state.venuePool).slice(0, 8);
      const areaDemo = await qloo.demographics({ entities: pool.map(e => e.entity_id).filter(Boolean) });
      const area = averageDemo(pool.map((e, i) => ({ demo: areaDemo[e.entity_id], w: 1 / (1 + i * 0.2) })));
      // The candidate tags: ids come from earlier tool results, or are resolved by name.
      const named = [];
      for (const raw of tags.slice(0, 10)) {
        const name = String(raw).replace(/^[a-z_]+:\s*/i, '').trim();
        const id = state.signals.get(norm(name))?.id || (await resolveTag(name))?.id;
        if (id && /^urn:tag:/.test(id)) named.push({ name, id });
      }
      // Review-based design tags skew older almost everywhere, so an absolute threshold rejects nearly
      // everything. Judge each tag against the other design options surfaced for this area instead:
      // a tag fits if its crowd is clearly closer to the locals' than the typical option's is.
      const baseline = [...state.signals.values()].filter(s => /^local_taste_tags:(decor|ambience|cuisine|culinary_style|beverage_offering|menu_highlight)/.test(s.source) && /^urn:tag:/.test(s.id || '')).slice(0, 30);
      const ids = [...new Set([...named.map(t => t.id), ...baseline.map(s => s.id)])];
      state.tagDemo ||= {};
      const missing = ids.filter(id => !state.tagDemo[id]);
      if (missing.length) Object.assign(state.tagDemo, await qloo.demographics({ tags: missing }));
      const sims = ids.map(id => state.tagDemo[id]).filter(Boolean).map(d => similarity(d.age, area.age));
      const mean = sims.reduce((s, v) => s + v, 0) / (sims.length || 1);
      const sd = Math.sqrt(sims.reduce((s, v) => s + (v - mean) ** 2, 0) / (sims.length || 1)) || 0.1;
      const checks = named.map(t => {
        const d = state.tagDemo[t.id];
        if (!d) return { tag: t.name, verdict: 'unknown' };
        const fit = similarity(d.age, area.age), z = (fit - mean) / sd;
        const verdict = z >= 0.5 ? 'fits' : z <= -0.5 && fit < 0.2 ? 'mismatch' : 'neutral';
        return { tag: t.name, fit: Math.round(fit * 100) / 100, relative: Math.round(z * 10) / 10, verdict, tagSkew: skew(d), reason: `${t.name} draws a ${skew(d)} crowd in Qloo's data, further from the locals (${skew(area)}) than most design options here` };
      });
      state.audience = { area: { ...area, skew: skew(area), venues: pool.map(e => e.name) }, checks };
      const bad = checks.filter(c => c.verdict === 'mismatch');
      return {
        forModel: { area_skew: skew(area), area_age: area.age, checks, instruction: bad.length ? `Replace ${bad.map(c => c.tag).join(', ')} with tags that fit, and say why in finalize_concept.` : 'All checked tags fit or are neutral.' },
        ui: state.audience,
        summary: `Locals skew ${skew(area)}; ${checks.filter(c => c.verdict === 'fits').length} fit, ${bad.length} mismatch${bad.length ? ` (${bad.map(c => c.tag).join(', ')})` : ''}`
      };
    },
    async search_tags({ query, facet }) {
      const tags = await qloo.tags(query, facet ? placeTagTypes[facet] : undefined);
      tags.forEach(t => record(t.name, 'tag', 'search_tags', { id: t.id }));
      return { forModel: { tags: tags.map(({ name, id, type }) => ({ name, id, type })) }, ui: { tags }, summary: `${tags.length} tags for “${query}”` };
    },
    async render_redesign({ edit_prompt, signals_used = [] }) {
      if (!imageModel) throw new Error('No image model is configured (set FAL_KEY or OPENAI_API_KEY).');
      if (!listing.photo && !listing.photoBytes) throw new Error('This listing has no photo to edit.');
      if (!state.audience) throw new Error('Call check_audience_fit with the design tags you plan to use before rendering.');
      if (state.render) return { forModel: { note: 'Already rendered; continue to finalize_concept.' }, ui: state.render, summary: 'Render already exists' };
      const [room, depth] = await Promise.all([survey(), depthOf()]);
      const keep = room?.keep?.length ? room.keep : genericKeep;
      // Pruna's formula: what changes (the agent's concrete edit), then a named keep-list, positive phrasing.
      // With a depth map, image 2 anchors depth and scale so the room keeps its perspective.
      const keepClause = `Keep ${keep.join('; ')} identical, seen from the same viewpoint${room?.camera ? ` (${room.camera})` : ''} with the same framing.`;
      const plain = `${edit_prompt.trim()} ${keepClause} Photorealistic interior photograph of an empty, finished room.`;
      const prompt = depth
        ? `Image 1 is the room photo to edit; image 2 is its depth map, where brighter areas are closer to the camera and darker areas are farther away. Make these changes clearly and completely: ${edit_prompt.trim()} Place every new piece at the depth and scale that image 2 shows for that part of the room, so the room keeps its full depth and perspective. ${keepClause} Output a photorealistic photo of the edited image 1 only, an empty finished room.`
        : plain;
      const image = listing.photoBytes ? { bytes: listing.photoBytes, type: listing.photoType } : { url: listing.photo };
      const result = await imageModel.edit({ image, prompt, depth, fallbackPrompt: plain, aspect: listing.aspect });
      state.render = await saveRender({ ...result, prompt, aspect: listing.aspect, listingId: listing.id, signals: signals_used });
      return { forModel: { rendered: true, render_id: state.render.id }, ui: state.render, summary: `Redesign rendered with ${result.model}` };
    },
    async finalize_concept(input) {
      // Some models send nested arrays as JSON strings; accept both shapes.
      const parse = v => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
      const concept = { ...input, design_choices: parse(input.design_choices), risks: parse(input.risks), programming: parse(input.programming) };
      if (!Array.isArray(concept.design_choices)) throw new Error('design_choices must be an array of { element, choice, signals }.');
      concept.design_choices = concept.design_choices.map(d => ({ ...d, signals: Array.isArray(parse(d.signals)) ? parse(d.signals) : [String(d.signals || '')].filter(Boolean) }));
      // A cited signal must be a name Qloo actually returned in this run (case and punctuation aside).
      // Models sometimes prefix a citation with its tool ("book_slate: Bambu"); strip that before matching.
      const clean = name => String(name).replace(/^[a-z_]+:\s*/i, '').trim();
      const check = list => (list || []).map(raw => { const name = clean(raw); return { name, grounded: state.signals.has(norm(name)) }; });
      const draft = {
        ...concept,
        design_choices: concept.design_choices.map(d => ({ ...d, signals: check(d.signals) })),
        programming: Array.isArray(concept.programming) ? concept.programming.map(p => ({ ...p, grounded: check([p.act])[0].grounded, signals: check(Array.isArray(parse(p.signals)) ? parse(p.signals) : [p.act]) })) : undefined
      };
      const ungrounded = [...draft.design_choices.flatMap(d => d.signals), ...(draft.programming || []).flatMap(p => p.signals)].filter(s => !s.grounded).map(s => s.name);
      // First time round, send unverified citations back so the agent swaps in real Qloo names.
      state.finalizeAttempts = (state.finalizeAttempts || 0) + 1;
      if (ungrounded.length && state.finalizeAttempts === 1) {
        return { forModel: { accepted: false, ungrounded, fix: 'These cited signals are not names Qloo returned in this run. Replace each with the exact name of a tag, venue or entity from your earlier tool results (or drop it), then call finalize_concept again.' }, ui: { ungrounded }, summary: `Sent back ${ungrounded.length} unverified citation${ungrounded.length > 1 ? 's' : ''}` };
      }
      state.final = { ...draft, slateMeta: state.slate || undefined, audience: state.audience || undefined };
      return { forModel: { accepted: true, ungrounded }, ui: state.final, summary: `Concept: ${concept.name}` };
    }
  };

  return {
    definitions, state,
    async run(name, input) {
      const handler = handlers[name];
      if (!handler) throw new Error(`Unknown tool ${name}.`);
      return handler(input || {});
    },
    signals: () => [...state.signals.values()]
  };
}
