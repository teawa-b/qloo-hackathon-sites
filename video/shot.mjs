// node video/shot.mjs <url> <out.png> [width] [height] [light|dark] [wait ms]: one screenshot with headless Chrome.
import { writeFile } from 'node:fs/promises';
import { launch } from './cdp.js';
const [url, out, w = 1440, h = 900, scheme = 'light', wait = 4000] = process.argv.slice(2);
const chrome = await launch({ port: 9400 + Math.floor(Math.random() * 400) });
const p = await chrome.page({ width: Number(w), height: Number(h), scheme });
await p.go(url);
await new Promise(r => setTimeout(r, Number(wait)));
await writeFile(out, await p.shot());
await chrome.close?.();
process.exit(0);
