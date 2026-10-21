// Every frame of the Pitchprep explainer is a pure function of time: renderAt(t) sets the whole stage for t seconds.
// TIMELINE (from timeline.js) gives each scene's start, length and caption; BOXES gives where each part of the brief
// sits in the full-page capture (CSS pixels at 1440 wide).
const $ = id => document.getElementById(id);
const { scenes, boxes: BOXES, url } = window.TIMELINE;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const spring = x => { x = clamp(x); return 1 - Math.pow(1 - x, 3) * Math.cos(x * 4.2) * 1; };
const lerp = (a, b, k) => a + (b - a) * k;
const VW = 1440, VH = 810;
const BUILD_FRAMES = 36;

// Preload every image so frames never render half-loaded.
const sources = { home: 'assets/home.png', form: 'assets/form.png', brief: 'assets/brief.png', ...Object.fromEntries(Array.from({ length: BUILD_FRAMES }, (_, i) => [`b${i}`, `assets/build-${String(i).padStart(2, '0')}.jpg`])) };
window.ready = Promise.all([document.fonts.ready, ...Object.values(sources).map(src => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = src; }))]);
$('endUrl').textContent = url || '';

// Captions: words arrive one by one over the first part of the narration; words naming Qloo are in the accent.
function caption(text, local, dur) {
  const box = $('caption');
  if (box.dataset.text !== text) { box.dataset.text = text; box.replaceChildren(...text.split(' ').map(w => { const s = document.createElement('span'); s.className = `w${/qloo/i.test(w) ? ' q' : ''}`; s.textContent = w; return s; })); }
  const words = [...box.children], span = Math.min(dur * .45, 2.2);
  words.forEach((w, i) => { const k = ease((local - .15 - (i / words.length) * span) / .35); const out = ease((local - (dur - .35)) / .3); w.style.opacity = k * (1 - out); w.style.transform = `translateY(${(1 - k) * 14}px)`; });
}

// Camera: show a rectangle of the page (CSS px) filling the viewport, keeping aspect, with padding.
function camera(rect, pad = 60) {
  const s = Math.min(VW / (rect.w + pad * 2), VH / (rect.h + pad * 2), 2.2);
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  // Never show past the page's edges.
  const pw = (BOXES.page?.w || VW) * s, ph = (BOXES.page?.h || VH) * s;
  return { s, x: clamp(VW / 2 - cx * s, Math.min(0, VW - pw), 0), y: clamp(VH / 2 - cy * s, Math.min(0, VH - ph), 0) };
}
const mix = (a, b, k) => ({ s: lerp(a.s, b.s, k), x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
function shoot(img, cam, spot = null, spotK = 0) {
  if ($('shot').dataset.src !== img) { $('shot').dataset.src = img; $('shot').src = sources[img]; }
  $('page').style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`;
  const sp = $('spot');
  if (spot && spotK > 0) { sp.style.opacity = spotK; sp.style.left = `${cam.x + spot.x * cam.s - 10}px`; sp.style.top = `${cam.y + spot.y * cam.s - 10}px`; sp.style.width = `${spot.w * cam.s + 20}px`; sp.style.height = `${spot.h * cam.s + 20}px`; }
  else sp.style.opacity = 0;
}
const full = { x: 0, y: 0, w: VW, h: VH };
const pageCam = r => camera(r, 48);
const whole = { s: 1, x: 0, y: 0 };
function badge(text, k, x = 1180, y = 760) { const b = $('badge'); b.textContent = text; b.style.opacity = k; b.style.left = `${x}px`; b.style.top = `${y + (1 - k) * 16}px`; }

const draw = {
  title(l, d) {
    $('cardTitle').style.opacity = 1 - ease((l - (d - .5)) / .5);
    const img = $('cardTitle').querySelector('img'); const k = spring(l / .9);
    img.style.transform = `scale(${.6 + .4 * k})`; img.style.opacity = clamp(l / .4);
    $('cardTitle').querySelector('h1').style.opacity = ease((l - .35) / .5);
    $('cardTitle').querySelector('p').style.opacity = ease((l - .7) / .5);
  },
  form(l, d) {
    show('app', l, d);
    const formBox = { x: 150, y: 370, w: 545, h: 380 };
    shoot('form', mix(whole, pageCam(formBox), ease((l - .8) / 1.6)), formBox, ease((l - 2.2) / .5));
  },
  build(l, d) {
    show('app', l, d);
    const f = Math.min(BUILD_FRAMES - 1, Math.floor(clamp((l - .3) / (d - 1.2)) * BUILD_FRAMES));
    const steps = { x: 150, y: 175, w: 1140, h: 330 };
    shoot(`b${f}`, mix(whole, pageCam(steps), ease((l - .2) / 1.4)));
  },
  qloo(l, d) {
    const o = ease(l / .4) * (1 - ease((l - (d - .4)) / .4)); $('dia').style.opacity = o;
    if (!$('chips').children.length) {
      $('chips').replaceChildren(...['Ticketmaster', 'Spotify', 'Uber'].map(n => Object.assign(document.createElement('div'), { className: 'chip', textContent: n })));
      const rows = (BOXES.ranked7 || []);
      $('rows').replaceChildren(...rows.map((r, i) => { const d = document.createElement('div'); d.className = `row${i > 2 ? ' dim' : ''}`; d.innerHTML = `<span></span><i></i>`; d.firstChild.textContent = r.name; d.lastChild.textContent = r.affinity.toFixed(2); return d; }));
    }
    [...$('chips').children].forEach((c, i) => { const k = spring((l - .3 - i * .25) / .6); c.style.opacity = clamp(k); c.style.transform = `translateY(${(1 - k) * 20}px)`; });
    const q = spring((l - 1.4) / .7); $('qbox').style.opacity = clamp(q); $('qbox').style.transform = `scale(${.85 + .15 * q})`;
    [...$('rows').children].forEach((r, i) => { const k = spring((l - 3.2 - i * .35) / .6); r.style.opacity = clamp(k); r.style.transform = `translateX(${(1 - k) * 30}px)`; });
    // Flow lines: customers into Qloo, then Qloo into the ranked portfolio.
    const qb = $('qbox').getBoundingClientRect(), lastChip = $('chips').lastElementChild.getBoundingClientRect();
    flow($('flowA'), lastChip.right + 24, qb.left - 24, qb.top + qb.height / 2, ease((l - 1.0) / .6));
    flow($('flowB'), qb.right + 24, qb.right + 100, qb.top + qb.height / 2, ease((l - 2.6) / .6));
  },
  ranked(l, d) {
    show('app', l, d);
    const a = pageCam({ ...BOXES.head, h: BOXES.head.h + 40 }), b = pageCam({ x: BOXES.ranked.x, y: BOXES.ranked.y, w: BOXES.ranked.w, h: Math.min(BOXES.ranked.h, 560) });
    const k = ease((l - 2.2) / 1.2);
    shoot('brief', mix(mix(whole, a, ease(l / 1)), b, k), k > .5 ? BOXES.top3 : BOXES.fit, k > .5 ? ease((l - 3.4) / .5) : ease((l - .9) / .4) * (1 - ease((l - 2) / .3)));
  },
  compare(l, d) {
    show('app', l, d);
    // Qloo's picks first, then the LLM's picks once the narration reaches them.
    const cam = pageCam(BOXES.compare), onLlm = l > 2.6;
    shoot('brief', cam, onLlm ? BOXES.cmpLlm : BOXES.cmpQloo, onLlm ? ease((l - 2.8) / .4) : ease((l - .6) / .4) * (1 - ease((l - 2.3) / .3)));
  },
  openers(l, d) {
    show('app', l, d);
    const r = BOXES.openers;
    shoot('brief', pageCam({ ...r, h: Math.min(r.h, 520) }), BOXES.opener1, ease((l - 1.6) / .5));
  },
  trust(l, d) {
    show('app', l, d);
    const a = pageCam({ x: 150, y: BOXES.legend.y - 20, w: 1140, h: 300 }), b = pageCam({ ...BOXES.made, h: Math.min(BOXES.made.h, 520) });
    const k = ease((l - 3.0) / 1.2);
    shoot('brief', mix(a, b, k), k < .5 ? BOXES.legend : null, ease((l - .6) / .4) * (1 - ease((l - 2.6) / .3)));
    badge(`${BOXES.calls} Qloo calls, all listed. The investor's name is never sent.`, ease((l - 4.4) / .5) * (1 - ease((l - (d - .4)) / .3)), 300, 760);
  },
  end(l, d) {
    $('cardEnd').style.opacity = ease(l / .5);
    const img = $('cardEnd').querySelector('img'); const k = spring(l / .9); img.style.transform = `scale(${.7 + .3 * k})`;
  }
};
function flow(el, x1, x2, y, k) { el.style.left = `${x1}px`; el.style.top = `${y - 2}px`; el.style.width = `${Math.max(0, x2 - x1)}px`; el.style.transform = `scaleX(${k})`; el.style.opacity = k > 0 ? 1 : 0; }
function show(id, l, d) { $(id).style.opacity = ease(l / .35) * (1 - ease((l - (d - .3)) / .3)); }

window.renderAt = t => {
  for (const id of ['cardTitle', 'app', 'dia', 'cardEnd']) $(id).style.opacity = 0;
  $('badge').style.opacity = 0;
  const s = scenes.find(s => t >= s.start && t < s.start + s.dur) || scenes[scenes.length - 1];
  const l = t - s.start;
  draw[s.id](l, s.dur);
  if (s.id === 'title' || s.id === 'end') $('caption').style.opacity = 0;
  else { $('caption').style.opacity = 1; caption(s.caption, l, s.dur); }
};
window.renderAt(0);
