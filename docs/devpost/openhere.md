# Openhere: Devpost entry draft

## Project name

Openhere

## Elevator pitch (200 characters max)

Pick a real empty space on the map. An agent asks Qloo what the people around it love, designs the right business into the real photo, books what locals love, and lets you walk inside.

## Try it out links

- Live site: https://openhere-cyan.vercel.app
- Code: https://github.com/teawa-b/openhere

## Video

https://youtu.be/zOnStiNlY_c

## Built with

qloo, node.js, javascript, maplibre, three.js, webxr, webrtc, openrouter, claude, fal, gpt-image, lingbot-world, moge-2, luma-photon, vercel

## About the project

## Inspiration

Every street has an empty shop, and every empty shop gets the same question: what should go here? Today the answer is a hunch, or a chain that fits anywhere. The people who live around that address already know what they want. They have rated the cafés, booked the bands and bought the brands. Qloo holds that taste, by place. Openhere asks it.

## What it does

Spin the globe, pick a spot, and Openhere finds real spaces for lease nearby (or use a sample space, or upload a photo of one you are touring). Choose what to open, a café, a music room, a bar, and an agent goes to work:

- **It reads the neighbourhood through Qloo.** Who goes out near that exact point, the ambience and decor they rate, what they eat and drink, the venues they love, the artists and brands they would pay for.
- **It checks itself.** Each design idea is tested against the crowd's age skew in Qloo; ideas that draw a different crowd are dropped and the swap is explained.
- **It redesigns the real photo**, keeping the walls, windows and camera, so the before and after is believable. Drag the wipe to compare.
- **It books the room** from acts locals already love, sized to the room's capacity with Qloo's popularity filter.
- **Every choice cites Qloo**, and anything Qloo did not return is flagged.
- **With and without Qloo.** The same brief goes to an LLM alone. For the Parkdale music room, 0 of its 8 picks hold up for this crowd, and some are not in Qloo at all.
- **Brand activations.** Give it a brand and a fanbase (Red Bull and Phoebe Bridgers fans) and it measures the fit out of 100, shows the arithmetic, and designs the pop-up around what both already love.
- **Walk inside.** A live world model (Lingbot World 2 on fal) streams the redesign as a space you walk through with your keyboard and relight from morning to late night. Or step into the redesign itself in 3D, with WASD or a VR headset.

Three recorded examples open instantly: a live-music room in an emptied Dollarama in Parkdale, Toronto; a café in the Empire Diner car in Chelsea, New York; and Red Bull × Phoebe Bridgers fans in Parkdale.

## How we built it

A Node 22 server with no build step streams the agent's steps to the page over server-sent events, with a MapLibre globe in front.

- **The agent** (Claude Haiku 5.5 through OpenRouter) runs a tool loop. It decides which Qloo questions to ask and adapts when an answer comes back empty.
- **Qloo, from one point on the map:** `/v2/insights` with `signal.location=POINT(lng lat)` for taste tags by facet (ambience, decor, drinks, customer identity), places with `filter.location` and a radius, artists and brands; `urn:demographics` to check each design tag against the crowd (cosine similarity of age profiles); `filter.popularity.max` to size the booking slate to the room; `feature.explainability`, `/v2/analysis/compare` and `urn:heatmap` for brand activations.
- **Grounding:** `finalize_concept` checks every cited signal, partner and act against the names the run actually collected, and sends ungrounded ones back once before flagging them.
- **The redesign** is a photo edit with GPT Image 2.5 Flare on fal, with a keep-list of the room's permanent structure.
- **The live walk** is fal's Lingbot World 2 over WebRTC. The server holds the key and the heartbeat, so the browser never sees the key and every session stops at three minutes.
- **The 3D walk** widens the redesign with Luma Photon Reframe, lifts it into 3D with MoGe-2 (both on fal), and renders it in three.js with WebXR.

Tests run against fake Qloo, LLM, image and world-model services. Every paid feature has per-visitor limits.

## Challenges we ran into

- Making the before and after believable. An image edit can quietly move windows or columns, so a one-time survey of the photo's permanent structure goes into every edit as a keep-list.
- Keeping the agent honest. It can cite plausible names Qloo never returned (the Parkdale run sent one back), so the final step validates every name and flags what is left.
- Walking inside. A world model streams in real time but costs money every second, so sessions are capped and paid for by the server, never exposed.

## Accomplishments that we're proud of

You can point at an empty shop anywhere in the world and, in about a minute, see it redesigned for the people who actually live there, with every decision traceable to Qloo, and then walk around inside it.

## What we learned

Location and audience change everything. The same emptied Dollarama becomes an indie music room for the people of Parkdale and a very different pop-up for Red Bull and Phoebe Bridgers fans, and Qloo explains each choice.

## What's next for Openhere

Lease and foot-traffic data side by side with the taste fit, a shareable pitch pack for landlords and investors, and comparing two spots at once.

## Image gallery

1. docs/devpost/img/openhere-1-home.png: pick a real space on the globe, or open an example
2. docs/devpost/img/openhere-2-studio.png: the redesign over the real photo, with the concept and the crowd
3. docs/devpost/img/openhere-3-choices.png: every design choice cites the Qloo signal behind it
4. docs/devpost/img/openhere-4-compare.png: with and without Qloo
5. docs/devpost/img/openhere-5-walk.jpg: walk inside the redesign, live
