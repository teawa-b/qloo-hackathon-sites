// The agent loop: an LLM plans, calls Qloo/listing/image tools, reads the results and decides
// what to do next until it calls finalize_concept. Every step is emitted so the UI can show its work.

export const maxSteps = 16;

// Event venues get a booking brief (most specific first: "comedy club" must not match music): Qloo's cross-domain taste turns into who to book or what to show.
const venueGuides = [
  [/comedy|stand.?up|improv/i, 'This is a comedy club. Call book_slate (kind comedy) and build programming: a lineup of nights from its comedians and live-taping podcasts. In the design, put a low stage with a brick or curtain backdrop and a single spotlight, seats close and facing it, and the bar at the back.'],
  [/sport/i, 'This is a sports bar. Call book_slate (kind sports) and build programming: a watch-party calendar around the athletes and teams it returns (name the team each athlete plays for). In the design, plan screen walls visible from every seat, a big main screen on the deepest wall and team-colour accents.'],
  [/founder|startup|podcast|cowork/i, 'This is a founders\' café with a podcast studio. Call book_slate (kind talks) and build programming: recurring recordings, demo nights and talks anchored on the podcasts and brands it returns. In the design, include a glass-walled podcast booth, long work tables with power and a small stage for demo nights.'],
  [/music|concert|gig|jazz|dj|nightclub/i, 'This is a live music venue. Call book_slate (kind music; add a genre the area leans into if useful) and build programming: a booking slate from its artists (headliner, residency, opener nights), sized for the room. In the design, place a stage with clear sightlines from the room\'s depth, the bar away from the stage, and acoustic treatment that fits the decor tags.']
];
export const venueGuide = business => venueGuides.find(([re]) => re.test(business))?.[1] || '';

export function systemPrompt(business) {
  const guide = venueGuide(business);
  return `You are Openhere, a site-strategy agent helping someone open a ${business} in one specific commercial space.
Ground every decision in Qloo cultural-taste data for the people who live and go out near the listing. Never invent Qloo data; only cite names that tools returned.

Work like this, calling tools as you go:
1. get_listing to read the space.
2. Profile the local audience with Qloo: local_taste_tags for at least four facets (customer_identity, ambience, decor, and age_range or interests; add cuisine, culinary_style, beverage_offering or menu_highlight when food or drink matters), local_venues for existing ${business}s nearby, and at least one local_entities call (artist and/or brand) so the soundtrack and styling are culturally specific.
3. Before rendering, call check_audience_fit with the decor, ambience and other design tags you plan to build on. Qloo knows which crowd each tag actually draws; drop or replace any tag marked mismatch and mention the swap in the design choices.
4. Pick one concept that fits the audience but fills a gap rather than cloning the top existing venue. If a call returns nothing, adapt (wider radius, different category or facet) rather than guessing.
5. Call render_redesign once. get_listing gives you a survey of the photo (room_architecture, camera_viewpoint, current_finishes); write the edit against it, e.g. "Change the grey slatwall along the left wall to exposed red brick with a long walnut bar counter in front of it." Only restyle surfaces, furniture, light fixtures and decor in place; the walls, windows, doors, columns and ceiling stay where they are. Each visual choice should trace to signals you saw.
6. Call finalize_concept. Each design choice cites the exact Qloo signal names behind it.
Between tool calls, write one short sentence on what you learned and what you will check next.${guide ? `\n\n${guide} Every programming act must be a name book_slate returned.` : ''}`;
}

export async function runAgent({ llm, tools, business, listing, notes = '', emit }) {
  const session = llm.create({
    system: systemPrompt(business),
    tools: tools.definitions,
    user: `I want to open a ${business} in "${listing.title}" (${listing.address}).${notes ? ` My notes: ${notes.slice(0, 500)}` : ''} Profile the local audience with Qloo, choose the concept, render the redesign and finalize.`
  });
  emit({ type: 'start', mode: 'agent', provider: session.provider, model: session.model });
  let nudged = false;
  for (let step = 1; step <= maxSteps; step++) {
    const { text, calls } = await session.next();
    if (text) emit({ type: 'thought', text });
    if (!calls.length) {
      if (nudged) break;
      nudged = true;
      session.say?.('Please continue: use the tools, render the redesign and call finalize_concept.');
      continue;
    }
    const results = [];
    for (const call of calls) {
      emit({ type: 'tool_call', id: call.id, name: call.name, input: call.input });
      try {
        const output = await tools.run(call.name, call.input);
        emit({ type: 'tool_result', id: call.id, name: call.name, summary: output.summary, data: output.ui });
        results.push({ id: call.id, content: JSON.stringify(output.forModel) });
      } catch (error) {
        emit({ type: 'tool_error', id: call.id, name: call.name, message: error.message });
        results.push({ id: call.id, content: JSON.stringify({ error: error.message }), error: true });
      }
    }
    if (tools.state.final) break;
    session.reply(results);
  }
  finish(tools, emit);
}

// Without an LLM key the same tools run in a fixed order and a template turns the strongest
// signals into a concept. The UI labels this mode so nobody mistakes it for the agent.
export async function runScripted({ tools, business, emit, hasImages }) {
  emit({ type: 'start', mode: 'scripted' });
  const step = async (name, input) => {
    const id = `s${Math.random().toString(36).slice(2, 8)}`;
    emit({ type: 'tool_call', id, name, input });
    try { const out = await tools.run(name, input); emit({ type: 'tool_result', id, name, summary: out.summary, data: out.ui }); return out.ui; }
    catch (error) { emit({ type: 'tool_error', id, name, message: error.message }); return null; }
  };
  const { listing } = await step('get_listing', {});
  const food = /restaurant|cafe|café|bakery|bistro|kitchen|diner|food/i.test(business);
  const facets = ['customer_identity', 'ambience', 'decor', food ? 'cuisine' : 'beverage_offering'];
  const tags = {};
  for (const facet of facets) tags[facet] = (await step('local_taste_tags', { facet }))?.tags || [];
  const venues = (await step('local_venues', {}))?.venues || [];
  const artists = (await step('local_entities', { type: 'artist' }))?.entities || [];
  const brands = (await step('local_entities', { type: 'brand' }))?.entities || [];
  const top = (list, n = 2) => list.slice(0, n).map(x => x.name);
  const pick = (facet, n) => top(tags[facet] || [], n);
  const ambience = pick('ambience', 2), decor = pick('decor', 3), audience = pick('customer_identity', 3), menu = pick(food ? 'cuisine' : 'beverage_offering', 2);
  const choices = [
    decor.length && { element: 'Materials & finishes', choice: `Build the palette around ${decor.join(', ')}.`, signals: decor },
    ambience.length && { element: 'Lighting & mood', choice: `Tune lighting and volume for a ${ambience.join(' / ').toLowerCase()} feel.`, signals: ambience },
    artists.length && { element: 'Soundtrack', choice: `Programme music around ${top(artists, 3).join(', ')}.`, signals: top(artists, 3) },
    menu.length && { element: food ? 'Menu' : 'Programming', choice: `Lead with ${menu.join(' and ').toLowerCase()}.`, signals: menu },
    brands.length && { element: 'Partnerships & retail', choice: `Stock or collaborate with brands locals rate highly: ${top(brands, 2).join(', ')}.`, signals: top(brands, 2) }
  ].filter(Boolean);
  if (decor.length || ambience.length) await step('check_audience_fit', { tags: [...decor, ...ambience] });
  if (hasImages && (decor.length || ambience.length)) {
    await step('render_redesign', {
      edit_prompt: `Restyle this room as a ${business} with ${(decor.join(', ') || 'warm natural').toLowerCase()} finishes. Change the walls to warm limewash plaster, change the floor to polished concrete, add a walnut ${food ? 'service counter and small dining tables with bentwood chairs' : 'bar counter with stools and low lounge seating'} on the open floor, brass pendant lights over the counter, and potted plants. The mood is ${(ambience.join(' and ') || 'relaxed').toLowerCase()}.`,
      signals_used: [...decor, ...ambience]
    });
  }
  if (choices.length >= 1) {
    const competitor = venues[0]?.name;
    await step('finalize_concept', {
      name: `${ambience[0] || 'Neighborhood'} ${business}`.replace(/^\w/, c => c.toUpperCase()),
      tagline: `A ${business} shaped by what ${listing.neighborhood || listing.city} already loves.`,
      audience: audience.length ? `Qloo's strongest audience tags near this address: ${audience.join(', ')}.` : 'Qloo returned no audience tags for this location.',
      gap: competitor ? `Nearby, ${competitor} leads Qloo's local ranking; this concept leans into ${ambience[0] || decor[0] || 'a different mood'} instead of copying it.` : 'Qloo found few comparable venues nearby, which suggests room for a new entrant.',
      offer: menu.length ? `Built around ${menu.join(' and ')}.` : `A focused ${business} offer.`,
      design_choices: choices,
      risks: ['Scripted mode: no LLM reviewed these signals. Add an LLM key for agent reasoning.']
    });
  }
  finish(tools, emit);
}

function finish(tools, emit) {
  if (tools.state.final) emit({ type: 'final', concept: tools.state.final, render: tools.state.render, signals: tools.signals() });
  else emit({ type: 'error', message: 'The agent stopped before finalizing a concept.' });
}
