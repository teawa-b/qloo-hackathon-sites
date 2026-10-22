# Roomful: Devpost entry draft

## Project name

Roomful

## Elevator pitch (200 characters max)

Name a few things you love. Qloo reads the taste behind them, an agent designs and paints the room, plays its soundtrack, and you walk inside it in 3D or VR.

## Try it out links

- Live site: https://roomful-ten.vercel.app
- Code: https://github.com/teawa-b/roomful

## Built with

qloo, node.js, javascript, html5, css3, three.js, webxr, openrouter, claude, fal, gpt-image, moge-2, luma-photon, youtube, vercel

## About the project

## Inspiration

Ask someone what their dream room looks like and they freeze. Ask what they love, and they will talk for an hour: a band, a film, a writer, a shop. The room is already in those answers. It just needs someone who knows what people with that taste actually live with. That is what Qloo knows.

## What it does

Type a few things you love, like "Radiohead, Blade Runner, Haruki Murakami, Muji". In about 30 seconds Roomful gives you:

- **A room designed from your taste.** Qloo returns the decor and mood tags that people with your taste rate highest, and the artists, books, films and brands they love. An agent writes the room from those names only: lighting, materials, what is on the shelf and the screen.
- **A painting of it**, and the room's own soundtrack playing, built from Qloo's artist results.
- **Every choice, and the taste behind it.** Each design choice names the Qloo signal it came from. Anything the model says that Qloo did not return is marked unverified.
- **With and without Qloo.** The same favourites go to an LLM alone, and each of its 8 picks is checked against Qloo. For the Quiet Signal Room, 0 of 8 hold up: the LLM suggests Vangelis, Brian Eno and an Eames chair, which are real but not what people with this taste rate, and "Rain-Streaked Glass", which is not in Qloo at all.
- **Walk inside.** Roomful paints your room out wider, lifts it into 3D, and lets you step into it with W, A, S and D, or in a VR headset.
- **Change something.** Ask for a different lamp or a warmer floor and the painting is redone.

Three recorded examples open instantly, with no keys needed: the Quiet Signal Room, the Velvet Speakeasy Lounge and the Art Deco Court.

## How we built it

A Node 22 server with no build step streams each stage to the page over server-sent events.

1. Qloo `/search` resolves your favourites to entities. A hit only counts if it shares a real word with what you typed, so "Monocle" never becomes "Elle Magazine". Genres fall back to Qloo tags.
2. Qloo `/v2/insights` with `signal.interests.entities` set to your favourites returns the decor, ambience and interest tags people with your taste rate (`urn:tag`, filtered to places), the artists, books, films and brands they love, and who shares the taste (`urn:demographics`).
3. An LLM (Claude Haiku 5.5 via OpenRouter, with Gemini Flash Lite for quick steps) writes the room using only those names, and a check flags anything it invented.
4. GPT Image paints the room. The playlist plays the room's Qloo artists through YouTube.
5. The 3D walk: Luma Photon Reframe (on fal) paints the room out to 21:9, MoGe-2 (on fal) estimates the depth of every pixel and returns a mesh, and three.js renders it with the full painting on it, with WASD controls and an Enter VR button for WebXR headsets. About 2 cents and 30 seconds per room.

Keys never reach the browser. Tests run against a fake Qloo, LLM and fal, and every paid feature has per-visitor limits.

## Challenges we ran into

- Search matching. Qloo's search is generous, so "Monocle" first matched a magazine store tag and "superhero films" matched the film *Superhero Movie*. We now require a real shared word, and map genres to tags.
- Walking into a painting. Our first 3D attempt (a world model that builds a full 360° scene) stretched the painting around you and fell apart a step from the centre. Lifting the painting itself into 3D, after widening it, looks like your room and holds together.
- Making the comparison fair. The LLM alone gets exactly the same favourites, and its picks are judged by the same Qloo results the room was built from.

## Accomplishments that we're proud of

The room feels like it belongs to the person who typed the favourites, and every part of it can be traced back to a Qloo result.

## What we learned

Taste data is most useful when it constrains the model. Once the LLM can only name what Qloo returned, the rooms stopped feeling generic.

## What's next for Roomful

Shopping lists for the real versions of each piece, rooms for two people's combined taste, and a full 360° walk.

## Image gallery

1. docs/devpost/img/roomful-1-home.png: type what you love, or start from an example
2. docs/devpost/img/roomful-2-room.png: the Quiet Signal Room, painted, with its Qloo soundtrack
3. docs/devpost/img/roomful-3-choices.png: every design choice names the Qloo signal behind it
4. docs/devpost/img/roomful-4-compare.png: without Qloo, 0 of 8 of an LLM's picks hold up for this taste
5. docs/devpost/img/roomful-5-walk.jpg: walk inside in 3D with WASD, or in VR
