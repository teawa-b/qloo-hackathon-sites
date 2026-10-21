// Every frame of the SmallTalk explainer is a pure function of time: renderAt(t) sets the whole stage for t seconds.
// Captures are 1440 CSS px wide (home at 2x, the rest at 1x); boxes say where each part of the live view sits.
const $ = id => document.getElementById(id);
const { scenes, boxes: DATA, url } = window.TIMELINE;
const FRAMES = DATA.frames || 1;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const spring = x => { x = clamp(x); return 1 - Math.pow(1 - x, 3) * Math.cos(x * 4.2); };
const lerp = (a, b, k) => a + (b - a) * k;
const VW = 1440, VH = 810;
const pad = n => String(n).padStart(3, '0');

const sources = { home: 'assets/home.png', live: 'assets/live.png', compare: 'assets/compare.png', glasses: 'assets/glasses.png' };
for (let i = 0; i < FRAMES; i++) sources[`t${i}`] = `assets/talk-${pad(i)}.jpg`;
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
function camera(rect, padding = 40, pageH = 900) {
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
// The conversation footage: the first half up to the point Qloo has their taste, the rest after.
const half = Math.floor(FRAMES * .5);
const near = camera({ x: 150, y: 70, w: 1140, h: 560 }, 10);
const play = (from, to, l, d) => shoot(`t${Math.min(to, from + Math.floor(clamp(l / (d - .4)) * (to - from)))}`, mix(whole, near, ease(l / 1.5)));

const draw = {
  title(l, d) {
    $('cardTitle').style.opacity = 1 - ease((l - (d - .5)) / .5);
    const img = $('cardTitle').querySelector('img'); const k = spring(l / .9);
    img.style.transform = `scale(${.6 + .4 * k})`; img.style.opacity = clamp(l / .4);
    $('cardTitle').querySelector('h1').style.opacity = ease((l - .35) / .5);
    $('cardTitle').querySelector('p').style.opacity = ease((l - .7) / .5);
  },
  home(l, d) { show('app', l, d); shoot('home', mix(whole, camera({ x: 140, y: 80, w: 560, h: 520 }, 20), ease((l - .8) / 2))); },
  talk1(l, d) { show('app', l, d); play(0, half, l, d); },
  qloo(l, d) {
    $('dia').style.opacity = ease(l / .4) * (1 - ease((l - (d - .4)) / .4));
    [...$('chips').children].forEach((c, i) => { const k = spring((l - .2 - i * .25) / .6); c.style.opacity = clamp(k); c.style.transform = `translateY(${(1 - k) * 16}px)`; });
    const q = spring((l - 1.3) / .7); $('qbox').style.opacity = clamp(q); $('qbox').style.transform = `scale(${.85 + .15 * q})`;
    [...$('rows').children].forEach((r, i) => { const k = spring((l - 2.6 - i * .6) / .6); r.style.opacity = clamp(k); r.style.transform = `translateX(${(1 - k) * 30}px)`; });
    const cb = $('chips').getBoundingClientRect(), qb = $('qbox').getBoundingClientRect(), rb = $('rows').getBoundingClientRect();
    flow($('flowA'), cb.right + 12, qb.left - 12, qb.top + qb.height / 2, ease((l - 1.0) / .5));
    flow($('flowB'), qb.right + 12, rb.left - 12, qb.top + qb.height / 2, ease((l - 2.2) / .5));
  },
  talk2(l, d) { show('app', l, d); play(half, FRAMES - 1, l, d); },
  nudges(l, d) {
    show('app', l, d);
    shoot('live', mix(whole, camera({ ...DATA.nudges, h: DATA.nudges.h + 20 }, 30), ease((l - .3) / 1.4)), DATA.lead, ease((l - 1.8) / .5));
  },
  compare(l, d) {
    show('app', l, d);
    const r = DATA.cmp;
    shoot('compare', camera({ ...r, h: Math.min(r.h, 520) }, 30, DATA.page?.h || 1557), l < d * .45 ? DATA.cmpScore : { ...r, h: Math.min(r.h, 480) }, ease((l - .6) / .4));
  },
  glasses(l, d) { show('app', l, d); shoot('glasses', whole); },
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
