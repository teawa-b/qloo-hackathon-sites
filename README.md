# Openhere

**Pick a real space on the globe. Say who it's for. An agent designs it from what those people actually love, paints it into the real photo, and lets you walk inside.**

Openhere is a taste-grounded design agent for physical spaces, built on [Qloo](https://www.qloo.com)'s taste graph. It has three modes:

| Mode | Who it's for | What Qloo decides |
|---|---|---|
| **Venues** (`/`) | Anyone about to sign a lease: a restaurant, café, bar, live-music room, comedy club, sports bar or founders' café | What the people who go out *near that address* want a room to feel like, what they eat, drink and listen to, who to book, and which brands to partner with |
| **Activations** (`/`, "Brand activation") | Sponsorship and experiential teams: a brand's pop-up, booth or takeover for one event's fans, inside a real room near the venue | How well the brand fits that fanbase, what the fans want a room to feel like, the playlist, the co-sponsors both audiences already love, local partners, and where the fans live around the venue |
| **Taste room** (`/room`) | Anyone: name a few things you love and walk into the room they make | Which decor and mood people with that taste rate highest, their playlist, the brands, films and books on the shelves |

A fourth page, **Lab** (`/lab`), is the raw Qloo explorer the project started from: type interests, review every match, and see the exact request and response behind each recommendation.

In every mode the result is a concept, a photoreal render, a live walkthrough and an evidence trail. **Every design choice cites the exact Qloo signal behind it, and anything the model cites that Qloo did not return in that run is flagged as unverified.** A "Why not just ask a chatbot?" panel answers the same brief with no tools and checks each of its picks against what Qloo actually ranks for that crowd.

## Venues: open the right thing here

1. Click anywhere on the globe (or use your location), choose what you want to open, then pick a real commercial listing for lease nearby and the room to redesign. You can also upload a photo of the space you're touring.
2. The agent **profiles the local audience with Qloo**: who goes out near the address (customer identity, age, interests), the ambience and decor they favour, what they eat and drink, the venues they rate highest, the artists and brands they love.
3. It **checks each design idea against the crowd**. Qloo knows the age and gender skew of every decor and ambience tag; tags that draw a different crowd from the locals are dropped and the swap is explained.
4. It **finds the gap** against nearby competitors, then **redesigns the real photo** (GPT Image 2.5 Flare via fal, ~25 s) keeping the windows, columns, framing and camera angle, so the before/after wipe is believable. Morning, golden-hour and night versions render in parallel.
5. For event venues it **books the room**: a slate of artists, comedians, teams or podcasts that people near that address already love, sized to the room's capacity so acts can fill it, and seeded with similar venues nearby.
6. **Walk inside.** fal's real-time world model (Lingbot World 2) streams a walkable world that starts from the redesign; change the time of day while you walk. With a World Labs key, a Gaussian-splat world with WebXR is the alternative.

## Activations: a brand's night for the fans who'll show up

Type a brand and an event (a headliner, a team, a show) and pick the room near the venue. The agent:

1. **Resolves both audiences** in Qloo (`/search`): the fans of the event and the brand's own followers.
2. **Measures the overlap.** Qloo's demographics for each side, the similarity of their age profiles, how much their top-15 brands and artists overlap (Jaccard), and the combined-signal results with `feature.explainability`, so each shared pick shows how much the fans and the followers each drove it. That becomes a plain **fit score** out of 100 with the arithmetic shown.
3. **Profiles the fans** the way the venue mode profiles a neighborhood, but signalled by interests: the ambience, decor, drinks and interests of the venues the fans rate highest; the brands both audiences love (co-sponsors); the playlist; the places near the venue the fans rate (bar partner, pre-show pop-up); and a **heatmap** of where the fans live around the venue (drawn on the globe when you close the studio).
4. **Checks the design tags against the fans' own skew**, renders the room with the brand unmistakable in it, and finalizes: concept, design choices, **partners and playlist**, **run of show**, fit. Partners and acts must be names Qloo returned; anything else is sent back once and then flagged.

## Taste room

Name what you love. Qloo turns the favourites into entities, says what rooms people with that taste rate highest and who is on their playlist, an LLM writes the room (every choice cites a Qloo name), GPT Image paints it, and the first track plays. "Walk inside" opens the same live walkthrough. Change the room in a sentence.

## Why Qloo is the product, not a feature

Ask an LLM what a bar for this neighborhood should look like and it answers the same for every neighborhood. Ask it to design a brand's booth for a fanbase and it guesses. Here the audience comes from Qloo: a point on the map, or two sets of entities, turned into the ambience, decor, drinks, music, brands, venues and demographics that crowd actually rates. The model only chooses among what Qloo returned and writes the prose; the scores (fit, audience checks, booking caps) are computed in code from Qloo's numbers. The chatbot check makes the difference visible on every run.

## How the agent works

The LLM (Claude Sonnet 5.5 through OpenRouter by default; the Anthropic Messages API or OpenAI also work) runs a multi-step tool loop in [`lib/agent.js`](lib/agent.js). It decides which Qloo questions to ask, reads the answers, and adapts when a call comes back empty. Tools live in [`lib/tools.js`](lib/tools.js); the Qloo client in [`lib/qloo.js`](lib/qloo.js).

| Tool | What it calls |
|---|---|
| `get_listing` | The chosen space: rent, size, sub-type, lease terms, walk/transit scores and street traffic counts (live listings), plus a one-time vision survey of the photo (permanent architecture, camera, depth zones) |
| `local_taste_tags` | `GET /v2/insights?filter.type=urn:tag&signal.location=POINT(lng lat)&filter.parents.types=urn:entity:place&filter.tag.types=urn:tag:<facet>:qloo`. Where Qloo ranks a facet directly for a location it uses that; otherwise it ranks the tags of the ~40 venues Qloo scores highest for local taste and says so |
| `local_venues` | `GET /v2/insights?filter.type=urn:entity:place&filter.location=POINT&filter.location.radius=…&filter.tags=<genre tag>` (tag resolved through `/v2/tags`) |
| `local_entities` | `GET /v2/insights?filter.type=urn:entity:artist\|brand\|…&signal.location=POINT` |
| `book_slate` | Sizes the room from the listing, caps `filter.popularity.max` so acts fit it, seeds `signal.interests.entities` with similar venues nearby, returns candidates per type |
| `check_audience_fit` | `filter.type=urn:demographics` for the design tags and for the crowd (top local venues, or the event's fans); cosine similarity of age profiles, judged against the other options surfaced for that run |
| `resolve_audience` | `GET /search?types=urn:entity:artist\|brand\|person…` for the event and the brand |
| `audience_overlap` | Demographics of both sides; each side's top-15 brands and artists; combined `signal.interests.entities` with `feature.explainability=true`; `GET /v2/analysis/compare` for how Qloo describes each audience |
| `fan_taste_tags` | `filter.type=urn:tag&filter.parents.types=urn:entity:place&filter.tag.types=…&signal.interests.entities=<fans>` |
| `fan_favourites` | `filter.type=urn:entity:<type>&signal.interests.entities=<fans and/or followers>` with explainability for shared picks, optional genre `filter.tags` |
| `fan_places` | `filter.type=urn:entity:place&filter.location=POINT&filter.location.radius=…&signal.interests.entities=<fans>` |
| `fan_heatmap` | `filter.type=urn:heatmap&filter.location=POINT&filter.location.radius=12000&signal.interests.entities=<fans>` |
| `render_redesign` | Photo edit with GPT Image 2.5 Flare (`openai/gpt-image-2.5/flare/edit` on fal). The agent writes concrete changes; the app appends a keep-list of the room's permanent structure from the vision survey. Pruna p-image-edit (with a depth map) and FLUX 3 Edit are fallbacks |
| `finalize_concept` | Validates every cited signal, partner and act against the names collected during the run; sends unverified citations back once |

The taste room runs a fixed pipeline over the same client ([`lib/room.js`](lib/room.js)); the chatbot check lives in `server.js` (`/api/baseline`).

Steps stream to the browser over server-sent events. The studio shows one live status line, and **How the agent decided** opens the full reasoning, every tool call and the raw Qloo request log. Without an LLM key the venue mode runs the same tools in a fixed order and labels the result as scripted.

## Live walkthrough

`/live` plays fal's `robbyant/lingbot-world-2` over WebRTC, following fal's WMA bridge protocol: `POST /ice` for TURN credentials, `POST /session` with one complete SDP offer, `POST /session/heartbeat` every 5 s. The browser then talks to the GPU peer directly and sends movement, look and time-of-day prompts on the `control` data channel. All three bridge calls go through this server, so the fal key never reaches the browser, and the server stops renewing the heartbeat after `LIVE_MAX_SECONDS` to bound cost.

## Spaces

- **Live listings (`REALTYAPI_KEY`):** LoopNet spaces for lease within about 1.5 miles of the point, with the full gallery (interiors ranked first by a vision pass), rent, size and traffic counts. Each card credits LoopNet and links back.
- **Sample spaces:** five real rooms that are vacant or closed, with openly licensed Wikimedia Commons photos (credited in [`data/spaces.json`](data/spaces.json)). Their rents are illustrative.
- **Your own photo:** upload the space you're touring, pinned where you clicked.

## Run locally

Requires Node.js 22+. No dependencies to install.

```bash
cp .env.example .env   # add your keys
npm start              # http://127.0.0.1:3300
```

| Variable | Needed for |
|---|---|
| `QLOO_API_KEY`, `QLOO_API_HOST` | Required. Hackathon keys use `https://hackathon.api.qloo.com` |
| `OPENROUTER_API_KEY` (or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) | Agent reasoning, the taste-room brief, the chatbot check (venues fall back to scripted mode without one; activations need one) |
| `FAL_KEY` | Redesigns and relights (GPT Image 2.5 Flare), taste-room paintings (text to image), depth maps, the live walkthrough |
| `PRUNAAI_KEY` | Optional: Pruna p-image-edit as fallback or primary (`IMAGE_PROVIDER=pruna`) |
| `REALTYAPI_KEY` | Live LoopNet listings near the clicked point |
| `WORLDLABS_API_KEY` | Optional alternative walkthrough: Gaussian-splat worlds with WebXR |

```bash
npm test
```

Tests use mock upstreams and cover the documented Qloo parameters, the full venue agent loop, the activation loop (audience resolution, explainability-based overlap, heatmap, grounded partners), the chatbot check, listing mapping, the live-walkthrough signalling, image fallbacks, key redaction, origin checks and rate limits. Live access needs real keys.

## Deploy

One Node process, no build step: Railway, Render or Fly all work. Set the variables above; `PORT` is honoured and the server binds to `0.0.0.0` when it is set. Keys stay on the server; the browser only talks to this origin (plus map tiles, fonts and the YouTube embed). Per-IP and daily caps (`AGENT_RUNS_PER_HOUR`, `WORLDS_PER_HOUR`, `LIVE_SESSIONS_PER_HOUR`, `BASELINES_PER_HOUR`…) protect the paid APIs on a public demo. Renders and uploads live in memory and clear on restart.

## Stack

- Server: Node 22 `http`, no framework. Front end: vanilla JS, Bricolage Grotesque and DM Mono.
- Map: MapLibre GL globe with OpenFreeMap tiles; Qloo heatmaps as a heatmap layer.
- Images: GPT Image 2.5 Flare (edit and text-to-image) via fal; Pruna and FLUX 3 as fallbacks; fal Depth Anything v2.
- Worlds: fal Lingbot World 2 over WebRTC; optional World Labs Marble via three.js + Spark with WebXR.
- Music: YouTube embeds, resolved server-side without an API key.
- APIs: Qloo Insights, Search, Tags, Analysis Compare, Demographics and Heatmaps; Claude via OpenRouter; RealtyAPI (LoopNet); OpenStreetMap Nominatim.

## License

[MIT](LICENSE). Sample-space photos keep their own Creative Commons licences, listed per photo. Generated images are labelled as generated.
