const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
let session = null, view = null, stream = null, recording = false, meDown = false, meMs = 0, meSince = 0, demoTimer = null, xr = null;

function toast(text, ms = 4000) { $('toast').textContent = text; $('toast').hidden = !text; clearTimeout(toast.t); if (text) toast.t = setTimeout(() => { $('toast').hidden = true; }, ms); }
async function api(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

async function start() {
  if (!$('consent').checked) { toast('Tick the box first: the other person should know.'); $('consent').focus(); return false; }
  const { id, view: v } = await api('/api/talk/start', { consent: true, mine: $('mine').value });
  session = id; render(v);
  $('setup').hidden = true; $('hud').hidden = false;
  if (navigator.xr) navigator.xr.isSessionSupported('immersive-ar').then(ar => ar || navigator.xr.isSessionSupported('immersive-vr')).then(ok => { $('xr').hidden = !ok; if (ok) $('xr').textContent = '🥽 Enter AR / VR'; }).catch(() => {});
  return true;
}

// --- Listening: 6-second chunks, each a complete recording, so each can be transcribed on its own. ---
$('listen').addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch { return toast('Microphone blocked. Allow it, or play the sample conversation.'); }
  try { if (!(await start())) { stream.getTracks().forEach(t => t.stop()); return; } } catch (error) { stream.getTracks().forEach(t => t.stop()); return toast(error.message); }
  recording = true; status('Listening'); loop();
});
async function loop() {
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
  while (recording) {
    const chunks = [];
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    meMs = 0; meSince = meDown ? Date.now() : 0;
    const started = Date.now();
    const done = new Promise(r => { rec.onstop = r; });
    rec.start(); await new Promise(r => setTimeout(r, 6000)); if (rec.state !== 'inactive') rec.stop(); await done;
    if (meDown) meMs += Date.now() - meSince;
    const who = meMs > (Date.now() - started) / 2 ? 'me' : 'them';
    const blob = new Blob(chunks, { type: chunks[0]?.type || type || 'audio/webm' });
    if (blob.size < 2000) continue;
    send({ audio: await dataUri(blob), who });
  }
}
const dataUri = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).replace(/^data:audio\/webm;codecs=opus;/, 'data:audio/webm;')); f.readAsDataURL(blob); });

// Turns are sent in order; the server answers with the whole updated view.
let queue = Promise.resolve();
function send(body) {
  queue = queue.then(async () => {
    status('Thinking', true);
    try { const r = await api('/api/talk/hear', { id: session, ...body }); if (r.heard) line(r.who, r.heard); render(r.view); }
    catch (error) { toast(error.message); }
    finally { status(recording ? 'Listening' : demoTimer ? 'Sample conversation' : 'Paused'); }
  });
}
function status(text, busy = false) { $('status').querySelector('span').textContent = text; $('status').classList.toggle('busy', busy); }
function line(who, text) { const li = el('li', who); li.append(el('b', '', who === 'me' ? 'You' : 'Them'), el('span', '', text)); $('lines').prepend(li); }

// "I'm talking": hold the button, Space, or (in a headset) the trigger.
function setMe(down) {
  if (down === meDown) return;
  if (down) meSince = Date.now(); else if (meSince) meMs += Date.now() - meSince;
  meDown = down; $('me').classList.toggle('on', down);
}
$('me').addEventListener('pointerdown', () => setMe(true));
['pointerup', 'pointerleave', 'pointercancel'].forEach(t => $('me').addEventListener(t, () => setMe(false)));
addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|TEXTAREA/.test(e.target.tagName) && !$('hud').hidden) { e.preventDefault(); setMe(true); } });
addEventListener('keyup', e => { if (e.code === 'Space') setMe(false); });

$('say').addEventListener('submit', e => { e.preventDefault(); const t = $('say-input').value.trim(); if (!t || !session) return; $('say-input').value = ''; send({ text: t, who: meDown ? 'me' : 'them' }); });

// --- A scripted sample conversation, so anyone can try it without a second person. ---
const sample = [
  ['them', 'Sorry I was late, I was finishing the new Sally Rooney on the train.'],
  ['me', 'No worries. Is it as good as Normal People?'],
  ['them', 'Better, honestly. I have been on such a reading kick. That and Phoebe Bridgers on repeat.'],
  ['them', 'We went to see Past Lives again last weekend and I cried the whole second half.'],
  ['me', 'I have not seen it yet. Is it sad?'],
  ['them', 'Quietly sad. Oh, and I cannot stand superhero films, I fell asleep in the last Marvel one.'],
  ['them', 'Next month I am going to Lisbon, mostly to eat pastries and walk around.']
];
$('demo').addEventListener('click', async () => {
  try { if (!(await start())) return; } catch (error) { return toast(error.message); }
  status('Sample conversation');
  let i = 0;
  const next = () => { if (i >= sample.length) { demoTimer = null; status('Sample finished'); return; } const [who, text] = sample[i++]; send({ text, who }); demoTimer = setTimeout(next, 5200); };
  next();
});

$('stop').addEventListener('click', () => {
  recording = false; clearTimeout(demoTimer); demoTimer = null;
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  xr?.end(); status('Ended');
});

// --- Rendering ------------------------------------------------------------------------------------
function chips(list, cls) { return (list || []).map((x, i) => el('span', `chip ${cls || `c${i % 4}`}`, x.name)); }
function render(v) {
  view = v;
  const n = v.nudges || [];
  $('nudges').replaceChildren(...(n.length ? n.map((x, i) => { const c = el('div', `nudge${i ? '' : ' lead'}${x.grounded ? '' : ' unverified'}`); c.append(el('p', '', x.say), el('small', '', `${x.about} · ${x.why}`)); return c; }) : [el('p', 'nudge-empty', 'Waiting for them to mention something they love…')]));
  $('them').replaceChildren(...chips(v.them));
  $('shared').replaceChildren(...(v.shared?.length ? chips(v.shared, 'c0') : [el('span', 'muted', v.mine?.length ? 'Nothing yet' : 'Add your favourites to see this')]));
  $('avoid').replaceChildren(...(v.avoid?.length ? chips(v.avoid, 'no') : [el('span', 'muted', 'Nothing yet')]));
  const label = { artist: 'Music', movie: 'Films', tv_show: 'TV', book: 'Books', podcast: 'Podcasts', brand: 'Brands', destination: 'Places' };
  $('recs').replaceChildren(...Object.entries(v.recs || {}).map(([t, l]) => { const row = el('div', 'rec-row'); row.append(el('b', '', label[t] || t), el('span', '', l.map(e => e.name).join(' · '))); return row; }));
  if (n[0]) { $('glass-say').textContent = n[0].say; $('glass-why').textContent = `${n[0].about} · ${n[0].why}`; }
  xr?.update(v);
}

// Glasses view: one nudge, huge, white on black, for display glasses mirroring a phone.
$('glasses').addEventListener('click', () => { $('glass').hidden = false; document.documentElement.requestFullscreen?.().catch(() => {}); });
$('glass-x').addEventListener('click', () => { $('glass').hidden = true; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); });

// AR / VR: the nudges float in front of you in the headset (Quest passthrough when available).
$('xr').addEventListener('click', async () => {
  try {
    const { enterXR } = await import('/talk-xr.js');
    xr = await enterXR({ view, onTalking: setMe, onEnd: () => { xr = null; } });
  } catch (error) { toast(`Couldn't start AR/VR: ${error.message}`); }
});
