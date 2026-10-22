# Pitchprep: Devpost entry draft

Paste each part into the matching Devpost field.

## Project name

Pitchprep

## Elevator pitch (200 characters max)

Know your investor before you pitch. Pitchprep researches them on the web, then Qloo ranks their portfolio by what your customers already love and hands you an opener.

## Try it out links

- Live site: https://pitchprep-seven.vercel.app
- Code: https://github.com/teawa-b/pitchprep

## Video demo link

(YouTube or Vimeo link to docs/video/pitchprep.mp4)

## Built with

qloo, node.js, javascript, html5, css3, openrouter, claude-haiku, gemini, server-sent-events, railway

## About the project

### Inspiration

Founders walk into investor meetings with a deck about themselves and almost nothing about the person across the table. The usual prep is an hour of tabs: a Crunchbase page, a few podcast clips, a guess at which portfolio company to mention. The guess is the weak part. You can read what an investor funded, but not which of those companies your own customers actually care about. That is a taste question, and Qloo answers taste questions.

### What it does

Type an investor's name, your startup, and a few apps your customers use. In about 30 seconds Pitchprep gives you a brief:

- **Web research** on the investor's public, professional record, every fact linked to its source.
- **Their portfolio, ranked by Qloo** for your customers. Qloo scores each company against your comparables, so you know which two or three to name.
- **How alike the two crowds are**, from Qloo's age data for both sides.
- **Openers**: what fans of the investor's public interests also love, phrased as crowds, never as claims about the person.
- **With and without Qloo**: the same question asked of an LLM with only the web research, with each of its picks placed in Qloo's ranking. In the Todd Boehly example the LLM alone picks Gopuff, Cloud9 and Overtime, which Qloo ranks 5th, 6th and 7th of 7 for that audience. With Qloo it's Chelsea F.C., the Dodgers and A24.

Each section is labelled Web, Qloo or Interpretation, and a "How this brief was made" panel lists every step and every Qloo call.

### How we built it

A small Node 22 server with no build step streams each stage to the page over server-sent events.

1. An LLM (Claude Haiku 5.5 through OpenRouter, with web search) researches the investor and returns cited JSON: portfolio, public interests, sources.
2. Qloo `/search` resolves the portfolio, the interests and your comparables to Qloo entities.
3. Qloo `/v2/insights` with `signal.interests.entities` set to your comparables and `filter.results.entities` set to their portfolio scores every company for your customers.
4. Qloo `urn:demographics` insights compare the age profiles of both crowds. The fit score is plain arithmetic shown on the page: half mean affinity, half cosine similarity of the age profiles.
5. Qloo insights on the investor's public interests give the openers.
6. A final model call writes the brief using only what came back. Anything it names that Qloo did not return is flagged "not from Qloo".

The Qloo key never reaches the browser, and the investor's name is never sent to Qloo. Tests run against a fake Qloo and a fake LLM and check both.

### Challenges we ran into

- Research JSON from a model with web search is sometimes malformed. Pitchprep repairs it, then asks the model to fix it, and only then searches again.
- Name matching: "FEVO" matched a person called Alex Fevola until we switched to whole-word matching.
- Keeping it honest. Some investors' portfolios simply aren't in Qloo. The Michael Abrams example shows that case instead of hiding it.

### Accomplishments that we're proud of

The with/without comparison. It shows in one table what Qloo adds: the LLM alone knows what the investor funded, and only Qloo knows which of those your customers love.

### What we learned

Grounding matters more than prompting. Once every name in the brief has to come from a Qloo result or a cited source, the brief stops inventing things, and the labels make that visible to the reader.

### What's next for Pitchprep

Briefs for a whole list of investors at once, ranked by fit, and a calendar hook that prepares the brief the night before a meeting.

## Image gallery (3:2, under 5 MB each)

1. docs/devpost/img/pitchprep-1-home.png: the home page with three recorded examples
2. docs/devpost/img/pitchprep-2-brief.png: a finished brief for Todd Boehly
3. docs/devpost/img/pitchprep-3-compare.png: with and without Qloo
4. docs/devpost/img/pitchprep-4-calls.png: how the brief was made, every Qloo call
