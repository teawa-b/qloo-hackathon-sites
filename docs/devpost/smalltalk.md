# SmallTalk: Devpost entry draft

## Project name

SmallTalk

## Elevator pitch (200 characters max)

It listens for what the other person loves, builds their taste with Qloo, and tells you what to say next. On a phone on the table, display glasses or a Quest headset.

## Try it out links

- Live site: https://smalltalk-flax.vercel.app
- Code: https://github.com/teawa-b/smalltalk

## Video

None. SmallTalk is shown live on a Quest headset instead of in an edited video.

## Built with

qloo, node.js, javascript, html5, css3, three.js, webxr, openrouter, gemini, fal, elevenlabs, vercel

## About the project

## Inspiration

First dates, networking events, a new colleague at lunch. The other person mentions a band or a show, you nod, and the moment passes. Later you think of the perfect thing to say. The information was all there: people tell you what they love within the first few minutes. What's missing is knowing what someone with that taste would light up about. Qloo knows that.

## What it does

Tick that the other person knows you're using a conversation assistant, then let SmallTalk listen.

- **They love.** Every film, band, book, place or brand they mention is found in Qloo and added to their taste, live.
- **You share.** Add a few of your own favourites and SmallTalk finds the common ground: picks that both your taste and theirs drive, using Qloo's explainability.
- **Steer clear.** Things they dislike are kept apart. "I can't stand superhero films" becomes a Qloo genre tag, never a film that happens to share a word.
- **Say next.** Three short things you could say, each tied to a Qloo result for their taste. Anything that isn't from Qloo is marked.
- **With and without Qloo.** The same conversation goes to an LLM alone. In the recorded sample, 1 of its 6 suggestions fits their taste (Aftersun). The rest are real but not what people with this taste rate.
- **Three ways to see it.** The full view on a phone or laptop, a glasses view (one nudge, huge, white on black, for display glasses) and an AR/VR view where the nudges float in front of you in a Quest headset.

A recorded first coffee replays line by line, with no keys needed, so anyone can try it in seconds.

## How we built it

A Node 22 server with no build step. The browser records 6-second chunks of audio and sends them up; the server holds every key.

1. Speech to text with ElevenLabs on fal. The audio is not stored.
2. A fast model (Gemini 2.5 Flash Lite through OpenRouter) picks out the cultural references in each line: what was mentioned, who said it, and whether they like it.
3. Qloo `/search` finds each one (a hit only counts if it shares a real word with what was said), and `/v2/tags` handles genres.
4. Qloo `/v2/insights` with `signal.interests.entities` set to their taste returns what people like them also love, across music, film, TV, books, podcasts, brands and places. With your favourites added and `feature.explainability=true`, a pick counts as shared when both of you drive at least a quarter of it.
5. The model writes three nudges using only names Qloo returned; a check flags anything else.
6. The AR/VR view uses three.js and WebXR, with passthrough on Quest.

On a serverless host each turn can land on a fresh instance, so the page sends the conversation's state back with each line. Tests run against a fake Qloo, LLM and speech service, and every paid call has per-visitor limits.

## Challenges we ran into

- Speed. A nudge that arrives after the moment has passed is useless, so the per-line work uses a fast model and short Qloo calls.
- Matching what people actually say. "The new Sally Rooney" or "that Lucy Dacus album" needs to find the right entity, and "superhero films" must never match a film called Superhero Movie.
- Consent and privacy. It refuses to listen until you confirm the other person knows, and Qloo only ever receives names of things, never names of people.

## Accomplishments that we're proud of

The nudges feel like something a well-read friend would whisper, and each one can be traced to a Qloo result for that person's taste.

## What we learned

The difference between a generic suggestion and a good one is taste, not knowledge. The LLM alone knows plenty of films; Qloo knows which ones this person would actually care about.

## What's next for SmallTalk

Native display-glasses apps, a quiet earpiece mode, and remembering people you've met (with their permission) so the next conversation starts warmer.

## Image gallery

1. smalltalk-1-home.png: consent first, then it listens
2. smalltalk-2-live.png: they love, you share, steer clear, and what to say next
3. smalltalk-3-compare.png: without Qloo, 1 of 6 suggestions fits their taste
4. smalltalk-4-glasses.png: the glasses view, one nudge at a time
