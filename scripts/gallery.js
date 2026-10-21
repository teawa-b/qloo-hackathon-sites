import { writeFile } from 'node:fs/promises';
import { launch, sleep } from '../video/cdp.js';
const [base, app, shots] = process.argv.slice(2);
const chrome = await launch({ port: 9000 + Math.floor(Math.random() * 500) });
const tab = await chrome.page({ width: 1500, height: 1000, scale: 1.5 });
for (const [name, url, js, waitFor] of JSON.parse(shots)) {
  await tab.go(base + url); await sleep(1500);
  if (waitFor) for (let i = 0; i < 120 && !(await tab.evaluate(waitFor)); i++) await sleep(500);
  if (js) await tab.evaluate(js);
  await sleep(1200);
  await writeFile(`docs/devpost/img/${app}-${name}.png`, await tab.shot());
  console.log('saved', name);
}
chrome.close();
