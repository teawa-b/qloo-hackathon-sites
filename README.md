# Openhere

**Click anywhere on the map, say what you want to open, and an agent designs it from what the neighborhood already loves.**

Openhere is for anyone about to sign a lease for a restaurant, café or bar, or a live-events venue: a live music room, comedy club, sports bar or founders' café with a podcast studio. Pick a spot on the globe (or use your live location), choose a business type (or type your own), then pick a real commercial listing for lease nearby and the room to redesign. You can also upload a photo of the space you're touring. An AI agent then:

1. **Profiles the local audience with Qloo.** It looks at who goes out near the address (customer identity, age ranges, interests), the ambience and decor they favour, what they eat and drink, the venues they rate highest, and the artists and brands they love.
2. **Finds the gap.** It compares that taste profile with nearby competitors and picks a concept that fits the area without cloning what's already there.
3. **Redesigns the real room.** It edits the actual listing photo with GPT Image 2.5 Flare (via fal, about 25 s), keeping the windows, columns, framing and camera angle, so the before/after is believable.
4. **Cites its sources.** Every design choice lists the Qloo signals behind it. Any signal the agent cites that Qloo never returned in that run is flagged as unverified.
5. **Shows it at any hour.** As soon as the redesign lands, Pruna p-image-edit (turbo, about 5 s each) renders morning, golden-hour and night versions in parallel, so the time-of-day buttons are ready before you reach them.
6. **Lets you walk inside.** fal's real-time world model (Lingbot World 2) streams a walkable world that starts from the redesign. You move with WASD or the touch pad, look around by dragging, and can change the time of day while you walk.
7. **Books the room (event venues).** For live music, comedy, sports and founder venues, the agent turns Qloo's cross-domain taste into a booking slate: the artists, comedians and comedy podcasts, teams and athletes, or podcasts that people near that address already love. Near Crypto.com Arena that is Lakers and Dodgers watch parties with Kendrick Lamar and Nipsey Hussle on the soundtrack. Every act is checked against the Qloo results from that run.
8. **Charts the neighborhood.** A panel of bar charts shows the Qloo data behind the concept: who goes out there, the age mix, mood, decor, drinks and interests, nearby favourites, and the artists and brands locals rate.

Without Qloo there is no product: the concept, the menu direction, the soundtrack and every visual choice come from Qloo's taste graph for that exact location.

## How the agent works

The LLM (Claude Sonnet 5.5 through OpenRouter by default; the Anthropic Messages API or OpenAI also work) runs a multi-step tool loop in [`lib/agent.js`](lib/agent.js). It decides which Qloo questions to ask, reads the answers, and adapts when a call comes back empty. Tools live in [`lib/tools.js`](lib/tools.js):

| Tool | What it calls |
|---|---|
| `get_listing` | The chosen space: rent, size, sub-type, lease terms, walk/transit scores and street traffic counts (for live listings) |
| `local_taste_tags` | `GET /v2/insights?filter.type=urn:tag&signal.location=POINT(lng lat)&filter.parents.types=urn:entity:place&filter.tag.types=urn:tag:<facet>:qloo`. On the hackathon dataset this ranks ambience and customer identity directly. For decor, age range, interests, cuisine, drinks and other facets it falls back to ranking the tags of the ~40 venues Qloo scores highest for local taste (`filter.type=urn:entity:place&filter.location=POINT&signal.location=POINT`). The tool reports which method it used. |
| `local_venues` | `GET /v2/insights?filter.type=urn:entity:place&filter.location=POINT(...)&filter.location.radius=…&filter.tags=<genre tag>` (tag resolved through `/v2/tags`) |
| `local_entities` | `GET /v2/insights?filter.type=urn:entity:artist\|brand\|…&signal.location=POINT(...)` |
| `search_tags` | `GET /v2/tags?filter.query=…` |
| `render_redesign` | Photo edit with GPT Image 2.5 Flare (`openai/gpt-image-2.5/flare/edit` on fal, medium quality; low for relights). It was chosen after a three-room bake-off against GPT Image 2, Pruna p-image-edit and FLUX 3 Edit, for photoreal, precise edits that keep the composition and render legible signage. `GPT_IMAGE_MODEL` overrides it. Pruna (with a depth-map reference) and FLUX 3 remain fallbacks; set `IMAGE_PROVIDER=pruna` to prefer Pruna. The prompt follows Pruna's edit formula: the agent writes concrete changes ("Change the grey slatwall along the left wall to exposed brick…"), and the app appends a keep-list of the room's permanent structure. That keep-list comes from a one-time vision survey of the photo (Claude via OpenRouter), which also describes the room's depth zones. A depth map (fal Depth Anything v2) goes to Pruna as image 2, so new pieces sit at the right depth and scale; in tests it raised the photo-to-redesign depth match from 0.77 to 0.93 on a room the plain edit re-framed. |
| `finalize_concept` | Validates each cited signal against the signals collected during the run |

Steps stream to the browser over server-sent events. The studio shows one live status line, and **How the agent decided** opens the full reasoning, every tool call and the raw Qloo request log.

Without an LLM key the same tools run in a fixed order, and a template turns the strongest signals into a concept. The UI labels this as scripted mode.

## Live walkthrough

`/live` plays fal's `robbyant/lingbot-world-2` over WebRTC, following fal's WMA bridge protocol (the same flow `@fal-ai/client`'s realtime `wma` transport uses):

1. `POST https://wma.fal.run/ice`: TURN credentials.
2. `POST https://wma.fal.run/session`: one complete SDP offer in, and the answer back.
3. `POST https://wma.fal.run/session/heartbeat` every 5 s keeps the lease alive.

The browser then talks to the GPU peer directly. It receives video, and sends `configure` (redesign image + description), `commands` (held movement and look keys) and `prompt` (time-of-day changes) on the `control` data channel.

All three bridge calls go through this server, so the fal key never reaches the browser. The server stops renewing a session's heartbeat after `LIVE_MAX_SECONDS` (default 180), which ends the session and bounds its cost. Sessions are also rate-limited (`LIVE_SESSIONS_PER_HOUR`, `LIVE_SESSIONS_PER_DAY`).

## Spaces

Three sources:

- **Live listings (`REALTYAPI_KEY`):** when you click the map or share your location, [RealtyAPI](https://www.realtyapi.io)'s LoopNet endpoint (`/search/bycoordinates`, `For_Lease`, restaurant and retail) returns spaces for lease within about 1.5 miles, sorted by distance. Picking one loads `/details/byid`: the full photo gallery (you choose the interior to redesign), monthly rent, size, sub-type, walk/transit scores and traffic counts. Results are cached per area to save API calls. Each card credits LoopNet and links back to the listing.
- **Sample spaces (fallback):** five real rooms that are vacant or closed, in San Francisco, Toronto, New York, Orlando and Palm Bay. Each has an openly licensed Wikimedia Commons photo (credited in [`data/spaces.json`](data/spaces.json)) and real coordinates. They are not active listings, and their rents are illustrative estimates.
- **Your own photo:** upload a photo of the space you're touring, pinned where you clicked. This works anywhere Qloo has coverage.
- (Alternative) `APIFY_TOKEN` enables an Apify LoopNet scraper instead. Scraping LoopNet is against its terms, so whether to enable it is the operator's decision.

## Run locally

Requires Node.js 22+. There are no dependencies to install.

```bash
cp .env.example .env   # add your keys
npm start              # http://127.0.0.1:3300
```

| Variable | Needed for |
|---|---|
| `QLOO_API_KEY`, `QLOO_API_HOST` | Required. Hackathon keys use `https://hackathon.api.qloo.com` |
| `OPENROUTER_API_KEY` (or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) | Agent reasoning (otherwise scripted mode). `OPENROUTER_MODEL` overrides the default `anthropic/claude-sonnet-5.5` |
| `PRUNAAI_KEY` | Optional: Pruna p-image-edit as fallback, or primary with `IMAGE_PROVIDER=pruna` |
| `FAL_KEY` | Redesign and relight edits (GPT Image 2.5 Flare via fal; `GPT_IMAGE_QUALITY` overrides), depth maps, FLUX 3 fallback |
| `REALTYAPI_KEY` | Live LoopNet listings near the clicked point |
| `FAL_KEY` | Also powers the live walkthrough (`FAL_WORLD_MODEL`, `LIVE_MAX_SECONDS`) |
| `WORLDLABS_API_KEY` | Optional alternative: Gaussian-splat 3D / VR walkthrough (used when there's no fal key) |

```bash
npm test
```

The tests use mock upstreams. They cover the documented Qloo parameters, LoopNet listing mapping and caching, the full agent loop (Qloo → image → finalize → 3D), signal grounding, scripted mode, key redaction, origin checks and rate limits.

## Deploy

This is a single Node process with no build step, so any Node host works (Railway, Render, Fly). Set the environment variables above. `PORT` is honoured, and the server binds to `0.0.0.0` when `PORT` is set. Keys stay on the server. The browser only talks to this origin, and World Labs assets are proxied. Per-IP and daily caps (`AGENT_RUNS_PER_HOUR`, `WORLDS_PER_HOUR`, `WORLDS_PER_DAY`) protect the paid APIs on a public demo. Renders and uploads are held in memory and cleared on restart.

## Stack

- Server: Node 22 `http`, no framework. Front end: vanilla JS.
- Map: [MapLibre GL](https://maplibre.org) globe with [OpenFreeMap](https://openfreemap.org) tiles.
- Live world: fal Lingbot World 2 over WebRTC (no client library; a ~150-line implementation of fal's WMA signalling). Optional World Labs splats via three.js + [Spark](https://sparkjs.dev) with WebXR.
- APIs: Qloo Insights, Claude via OpenRouter (agent and photo survey), GPT Image 2.5 Flare and Lingbot World 2 via fal, Pruna p-image-edit (fallback), RealtyAPI (LoopNet), World Labs Marble, and OpenStreetMap Nominatim for geocoding.

## License

[MIT](../LICENSE). Sample-space photos keep their own Creative Commons licences, listed per photo.
