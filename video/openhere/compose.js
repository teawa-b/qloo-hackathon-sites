// Every frame of the Openhere explainer is a pure function of time: renderAt(t) sets the whole stage for t seconds.
// Captures are 1440x900 CSS pixels (studio shots at 2x, frame sequences at 1x); shots.json says where each part sits.
const $ = id => document.getElementById(id);
const { scenes, boxes: DATA, url } = window.TIMELINE;
const SHOTS = DATA.shots || {}, BUILD = DATA.build || { frames: 1, doneAt: 0 };
const WALK = DATA.walkFrames || 140;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const spring = x => { x = clamp(x); return 1 - Math.pow(1 - x, 3) * Math.cos(x * 4.2); };
const lerp = (a, b, k) => a + (b - a) * k;
const VW = 1440, VH = 810, PH = 900;
const pad = n => String(n).padStart(3, '0');

const sources = { home: 'assets/home.png', venue: 'assets/studio-venue.png', activation: 'assets/studio-activation.png' };
for (const k of Object.keys(SHOTS)) sources[k] = `assets/${k}.png`;
for (let i = 0; i < BUILD.frames; i++) sources[`b${i}`] = `assets/build-${pad(i)}.jpg`;
for (let i = 0; i < WALK; i++) sources[`w${i}`] = `assets/walk-${pad(i)}.jpg`;
window.ready = Promise.all([document.fonts.ready, ...Object.values(sources).map(src => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = src; }))]);
$('endUrl').textContent = url || '';
$('point').textContent = DATA.point || '';
$('rows').replaceChildren(...(DATA.outputs || []).map(([k, v]) => { const d = document.createElement('div'); d.className = 'row'; d.innerHTML = '<span></span><b></b>'; d.firstChild.textContent = k; d.lastChild.textContent = v; return d; }));

function caption(text, local, dur) {
  const box = $('caption');
  if (box.dataset.text !== text) { box.dataset.text = text; box.replaceChildren(...text.split(' ').filter(Boolean).map(w => { const s = document.createElement('span'); s.className = `w${/qloo/i.test(w) ? ' q' : ''}`; s.textContent = w; return s; })); }
  const words = [...box.children], span = Math.min(dur * .45, 2.2);
  words.forEach((w, i) => { const k = ease((local - .15 - (i / words.length) * span) / .35); const out = ease((local - (dur - .35)) / .3); w.style.opacity = k * (1 - out); w.style.transform = `translateY(${(1 - k) * 14}px)`; });
}
function camera(rect, padding = 48) {
  const s = Math.min(VW / (rect.w + padding * 2), VH / (rect.h + padding * 2), 2.2);
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  return { s, x: clamp(VW / 2 - cx * s, Math.min(0, VW - VW * s), 0), y: clamp(VH / 2 - cy * s, Math.min(0, VH - PH * s), 0) };
}
const mix = (a, b, k) => ({ s: lerp(a.s, b.s, k), x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
const whole = { s: VW / 1440, x: 0, y: -40 };
function shoot(img, cam, spot = null, spotK = 0) {
  if ($('shot').dataset.src !== img) { $('shot').dataset.src = img; $('shot').src = sources[img]; }
  $('page').style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`;
  const sp = $('spot');
  if (spot && spotK > 0) { sp.style.opacity = spotK; sp.style.left = `${cam.x + spot.x * cam.s - 8}px`; sp.style.top = `${cam.y + spot.y * cam.s - 8}px`; sp.style.width = `${spot.w * cam.s + 16}px`; sp.style.height = `${spot.h * cam.s + 16}px`; }
  else sp.style.opacity = 0;
}
function show(id, l, d) { $(id).style.opacity = ease(l / .35) * (1 - ease((l - (d - .3)) / .3)); }
function flow(el, x1, x2, y, k) { el.style.left = `${x1}px`; el.style.top = `${y - 2}px`; el.style.width = `${Math.max(0, x2 - x1)}px`; el.style.transform = `scaleX(${k})`; el.style.opacity = k > 0 ? 1 : 0; }
// The studio's photo occupies the left of the screen; the redesign card sits on the right.
const photo = { x: 12, y: 12, w: 448 * 1.8, h: 500 * 1.8 };
const card = (name, l, d, spotIn = 1) => { const r = SHOTS[name]; shoot(name, camera({ x: r.x - 20, y: Math.max(0, r.y - 30), w: r.w + 40, h: Math.min(r.h + 60, 470) }, 30), { ...r, h: Math.min(r.h, 440) }, ease((l - spotIn) / .5)); };

const draw = {
  title(l, d) {
    $('cardTitle').style.opacity = 1 - ease((l - (d - .5)) / .5);
    const img = $('cardTitle').querySelector('img'); const k = spring(l / .9);
    img.style.transform = `scale(${.6 + .4 * k})`; img.style.opacity = clamp(l / .4);
    $('cardTitle').querySelector('h1').style.opacity = ease((l - .35) / .5);
    $('cardTitle').querySelector('p').style.opacity = ease((l - .7) / .5);
  },
  globe(l, d) { show('app', l, d); const k = ease(l / d); shoot('home', { s: 1 + .08 * k, x: -40 * k, y: -60 * k }); },
  build(l, d) {
    show('app', l, d);
    const end = Math.max(1, BUILD.doneAt - 1), f = Math.min(end, Math.floor(clamp((l - .2) / (d - .9)) * end));
    shoot(`b${f}`, whole);
  },
  qloo(l, d) {
    $('dia').style.opacity = ease(l / .4) * (1 - ease((l - (d - .4)) / .4));
    const p = spring((l - .2) / .6); $('pin').style.opacity = clamp(p); $('pin').style.transform = `translateY(${(1 - p) * 20}px)`;
    const q = spring((l - 1.2) / .7); $('qbox').style.opacity = clamp(q); $('qbox').style.transform = `scale(${.85 + .15 * q})`;
    [...$('rows').children].forEach((r, i) => { const k = spring((l - 2.6 - i * .45) / .6); r.style.opacity = clamp(k); r.style.transform = `translateX(${(1 - k) * 30}px)`; });
    const pb = $('pin').getBoundingClientRect(), qb = $('qbox').getBoundingClientRect(), rb = $('rows').getBoundingClientRect();
    flow($('flowA'), pb.right + 12, qb.left - 12, qb.top + qb.height / 2, ease((l - .9) / .5));
    flow($('flowB'), qb.right + 12, rb.left - 12, qb.top + qb.height / 2, ease((l - 2.2) / .5));
  },
  reveal(l, d) {
    show('app', l, d);
    // The real wipe sweep from the capture, then the finished studio with a slow push onto the redesign.
    const from = BUILD.doneAt, to = BUILD.frames - 1, sweep = Math.min(2.6, d * .45);
    if (l < sweep) shoot(`b${Math.min(to, from + Math.floor((l / sweep) * (to - from)))}`, whole);
    else shoot('venue', mix(whole, camera({ x: 0, y: 20, w: 1000, h: 600 }, 10), ease((l - sweep) / 2.5)));
  },
  slate(l, d) { show('app', l, d); card('slate', l, d, .6); },
  choices(l, d) { show('app', l, d); l < d * .55 ? card('choices', l, d, .5) : card('audience', l - d * .55, d, .4); },
  fit(l, d) { show('app', l, d); l < 1.6 ? shoot('activation', whole) : card('fit', l - 1.6, d, .3); },
  baseline(l, d) { show('app', l, d); card('baseline', l, d, .8); },
  walk(l, d) {
    show('app', l, d);
    const n = DATA.walkFrames || 0;
    if (!n) return shoot('venue', camera({ x: 0, y: 20, w: 1000, h: 600 }, 10));
    shoot(`w${Math.min(n - 1, Math.floor(clamp(l / d) * n))}`, whole);
  },
  end(l, d) { $('cardEnd').style.opacity = ease(l / .5); const img = $('cardEnd').querySelector('img'); const k = spring(l / .9); img.style.transform = `scale(${.7 + .3 * k})`; }
};

window.renderAt = t => {
  for (const id of ['cardTitle', 'app', 'dia', 'cardEnd']) $(id).style.opacity = 0;
  const s = scenes.find(s => t >= s.start && t < s.start + s.dur) || scenes[scenes.length - 1];
  const l = t - s.start;
  draw[s.id](l, s.dur);
  if (!s.caption) $('caption').style.opacity = 0;
  else { $('caption').style.opacity = 1; caption(s.caption, l, s.dur); }
};
window.renderAt(0);
