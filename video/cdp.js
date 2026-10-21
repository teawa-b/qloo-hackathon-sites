// A tiny Chrome DevTools Protocol client for the video scripts: headless Chrome, one tab per call, no dependencies.
import { spawn } from 'node:child_process';

const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ port = 9334 } = {}) {
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 40 && !ws; i++) { try { ws = (await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json())).webSocketDebuggerUrl; } catch { await sleep(250); } }
  const socket = new WebSocket(ws);
  await new Promise(r => socket.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}, sessionId) => new Promise(r => { const n = ++id; pending.set(n, r); socket.send(JSON.stringify({ id: n, method, params, sessionId })); });

  // Open a page at a given viewport; returns helpers bound to that tab.
  async function page({ width, height, scale = 1, scheme = 'light', ua }) {
    const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    // Some embeds (YouTube) refuse headless browsers; a regular desktop user agent lets them load.
    if (ua) await send('Network.setUserAgentOverride', { userAgent: ua }, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false }, sessionId);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }, sessionId);
    const evaluate = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)).result?.result?.value;
    return {
      go: async url => { await send('Page.navigate', { url }, sessionId); },
      evaluate,
      // A page that is mid-navigation has nothing to capture yet; retry briefly before giving up.
      shot: async ({ format = 'png', quality, clip, beyond = false } = {}) => {
        for (let i = 0; ; i++) {
          const r = await send('Page.captureScreenshot', { format, quality, clip, captureBeyondViewport: beyond, fromSurface: true }, sessionId);
          if (r.result?.data) return Buffer.from(r.result.data, 'base64');
          if (i >= 10) throw new Error(`Screenshot failed: ${r.error?.message || 'no data'}`);
          await sleep(300);
        }
      },
      resize: async (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: false }, sessionId),
      close: () => send('Target.closeTarget', { targetId })
    };
  }
  return { page, close: () => { socket.close(); proc.kill(); } };
}
export { sleep };
