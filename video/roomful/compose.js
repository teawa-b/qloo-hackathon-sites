// Every frame of the Roomful explainer is a pure function of time: renderAt(t) sets the whole stage for t seconds.
// room.png is the whole finished page at 1440 CSS px wide; boxes say where each part sits on it.
const $ = id => document.getElementById(id);
const { scenes, boxes: DATA, url } = window.TIMELINE;
const BUILD = DATA.build || { frames: 1, doneAt: 0 }, WALK = DATA.walkFrames || 0;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const spring = x => { x = clamp(x); return 1 - Math.pow(1 - x, 3) * Math.cos(x * 4.2); };
const lerp = (a, b, k) => a + (b - a) * k;
const VW = 1440, VH = 810;
const pad = n => String(n).padStart(3, '0');

const sources = { home: 'assets/home.png', form: 'assets/form.png', room: 'assets/room.png' };
for (let i = 0; i < BUILD.frames; i++) sources[`b${i}`] = `assets/build-${pad(i)}.jpg`;
for (let i = 0; i < WALK; i++) sources[`w${i}`] = `assets/walk-${pad(i)}.jpg`;
window.ready = Promise.all([document.fonts.ready, ...Object.values(sources).map(src => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = src; }))]);
$('endUrl').textContent = url || '';
$('chips').replaceChildren(...(DATA.seeds || []).map(n => Object.assign(document.createElement('div'), { className: 'chip', textContent: n })));
$('rows').replaceChildren(...(DATA.outputs || []).map(([k, v]) => { const d = document.createElement('div'); d.className = 'row'; d.innerHTML = '<span></span><b></b>'; d.firstChild.textContent = k; d.lastChild.textContent = v; return d; }));

function caption(text, local, dur) {
  const box = $('caption');
  if (box.dataset.text !== text) { box.dataset.text = text; box.replaceChildren(...text.split(' ').filter(Boolean).map(w => { const s = document.createElement('span'); s.className = `w${/qloo/i.test(w) ? ' q' : ''}`; s.textContent = w; return s; })); }
  const words = [...box.children], span = Math.min(dur * .45, 2.2);
  words.forEach((w, i) => { const k = ease((local - .15 - (i / words.length) * span) / .35); const out = ease((local - (dur - .35)) / .3); w.style.opacity = k * (1 - out); w.style.transform = `translateY(${(1 - k) * 14}px)`; });
}
// Show a rectangle of a capture (CSS px), never past the capture's edges.
function camera(rect, padding = 48, pageH = DATA.page?.h || 900) {
  const s = Math.min(VW / (rect.w + padding * 2), VH / (rect.h + padding * 2), 2.2);
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  return { s, x: clamp(VW / 2 - cx * s, Math.min(0, VW - VW * s), 0), y: clamp(VH / 2 - cy * s, Math.min(0, VH - pageH * s), 0) };
}
const mix = (a, b, k) => ({ s: lerp(a.s, b.s, k), x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
const whole = { s: 1, x: 0, y: 0 };
function shoot(img, cam, spot = null, spotK = 0) {
  if ($('shot').dataset.src !== img) { $('shot').dataset.src = img; $('shot').src = sources[img]; }
  $('page').style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`;
  const sp = $('spot');
  if (spot && spotK > 0) { sp.style.opacity = spotK; sp.style.left = `${cam.x + spot.x * cam.s - 8}px`; sp.style.top = `${cam.y + spot.y * cam.s - 8}px`; sp.style.width = `${spot.w * cam.s + 16}px`; sp.style.height = `${spot.h * cam.s + 16}px`; }
  else sp.style.opacity = 0;
}
function show(id, l, d) { $(id).style.opacity = ease(l / .35) * (1 - ease((l - (d - .3)) / .3)); }
function flow(el, x1, x2, y, k) { el.style.left = `${x1}px`; el.style.top = `${y - 2}px`; el.style.width = `${Math.max(0, x2 - x1)}px`; el.style.transform = `scaleX(${k})`; el.style.opacity = k > 0 ? 1 : 0; }
const card = id => { $(id).style.opacity = 1; };

const draw = {
  title(l, d) {
    $('cardTitle').style.opacity = 1 - ease((l - (d - .5)) / .5);
    const img = $('cardTitle').querySelector('img'); const k = spring(l / .9);
    img.style.transform = `scale(${.6 + .4 * k})`; img.style.opacity = clamp(l / .4);
    $('cardTitle').querySelector('h1').style.opacity = ease((l - .35) / .5);
    $('cardTitle').querySelector('p').style.opacity = ease((l - .7) / .5);
  },
  form(l, d) { show('app', l, d); shoot(l < 1.4 ? 'home' : 'form', mix(whole, camera({ x: 0, y: 60, w: 760, h: 560 }, 20, 900), ease((l - .6) / 1.6))); },
  build(l, d) {
    show('app', l, d);
    const end = Math.max(1, BUILD.doneAt - 1), f = Math.min(end, Math.floor(clamp((l - .2) / (d - .9)) * end));
    shoot(`b${f}`, whole);
  },
  qloo(l, d) {
    $('dia').style.opacity = ease(l / .4) * (1 - ease((l - (d - .4)) / .4));
    [...$('chips').children].forEach((c, i) => { const k = spring((l - .2 - i * .2) / .6); c.style.opacity = clamp(k); c.style.transform = `translateY(${(1 - k) * 16}px)`; });
    const q = spring((l - 1.3) / .7); $('qbox').style.opacity = clamp(q); $('qbox').style.transform = `scale(${.85 + .15 * q})`;
    [...$('rows').children].forEach((r, i) => { const k = spring((l - 2.6 - i * .5) / .6); r.style.opacity = clamp(k); r.style.transform = `translateX(${(1 - k) * 30}px)`; });
    const cb = $('chips').getBoundingClientRect(), qb = $('qbox').getBoundingClientRect(), rb = $('rows').getBoundingClientRect();
    flow($('flowA'), cb.right + 12, qb.left - 12, qb.top + qb.height / 2, ease((l - 1.0) / .5));
    flow($('flowB'), qb.right + 12, rb.left - 12, qb.top + qb.height / 2, ease((l - 2.2) / .5));
  },
  reveal(l, d) {
    show('app', l, d);
    const from = BUILD.doneAt, to = BUILD.frames - 1, sweep = Math.min(2.4, d * .45);
    if (l < sweep) shoot(`b${Math.min(to, from + Math.floor((l / sweep) * (to - from)))}`, whole);
    else shoot('room', mix(camera(DATA.head || DATA.hero, 20), camera(DATA.hero, 10), ease((l - sweep) / 2.5)));
  },
  choices(l, d) { show('app', l, d); const r = DATA.choices, focus = { x: r.x, y: r.y, w: r.w * .62, h: Math.min(r.h, 430) }; shoot('room', camera(focus, 24), focus, ease((l - .8) / .5)); },
  compare(l, d) {
    show('app', l, d);
    const r = DATA.compare, cam = camera({ ...r, h: Math.min(r.h, 640) }, 24), first = l < d * .45;
    shoot('room', cam, first ? DATA.score : DATA.cmp, first ? ease((l - .6) / .4) : 1);
  },
  walk(l, d) {
    show('app', l, d);
    if (!WALK) return shoot('room', camera(DATA.hero, 10));
    shoot(`w${Math.min(WALK - 1, Math.floor(clamp(l / d) * WALK))}`, whole);
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
