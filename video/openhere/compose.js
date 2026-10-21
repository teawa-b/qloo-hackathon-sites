// Openhere's film, cinematic: every frame is a pure function of time; renderAt(t) sets the stage for t seconds.
// Footage: the app's globe filmed frame by frame (globe.js), the studio captures (1440x900 CSS px, shots.json says
// where each panel sits), the real photos and their redesigns for the before and after, and the live walk.
const $ = id => document.getElementById(id);
const { scenes, boxes: DATA, url } = window.TIMELINE;
const SHOTS = DATA.shots || {}, BUILD = DATA.build || { frames: 1, doneAt: 0 };
const WALK = DATA.walkFrames || 0, GLOBE = DATA.globe || { frames: 0 };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const out = x => 1 - Math.pow(1 - clamp(x), 3);
const spring = x => { x = clamp(x); return 1 - Math.pow(1 - x, 3) * Math.cos(x * 4.2); };
const lerp = (a, b, k) => a + (b - a) * k;
const VW = 1920, VH = 940, PW = 1440, PH = 900;
const pad = n => String(n).padStart(3, '0');

const sources = { home: 'assets/home.png', venue: 'assets/studio-venue.png', activation: 'assets/studio-activation.png' };
for (const k of Object.keys(SHOTS)) sources[k] = `assets/${k}.png`;
for (let i = 0; i < BUILD.frames; i++) sources[`b${i}`] = `assets/build-${pad(i)}.jpg`;
for (let i = 0; i < WALK; i++) sources[`w${i}`] = `assets/walk-${pad(i)}.jpg`;
for (let i = 0; i < GLOBE.frames; i++) sources[`g${i}`] = `assets/globe-${pad(i)}.jpg`;
const photos = { parkdale: 'assets/space-1.jpg', chelsea: 'assets/space-2.jpg', afterParkdale: 'assets/after-parkdale.jpg', afterChelsea: 'assets/after-chelsea.jpg', afterRedbull: 'assets/after-redbull.jpg' };
window.ready = Promise.all([document.fonts.ready, ...[...Object.values(sources), ...Object.values(photos)].map(src => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = src; }))]);
$('endUrl').textContent = url || '';

// Subtitles: the whole line fades up, as in a film; words naming Qloo are amber.
function sub(text, l, d) {
  const el = $('sub');
  if (el.dataset.t !== text) { el.dataset.t = text; el.replaceChildren(...text.split(/(Qloo)/).map(p => p === 'Qloo' ? Object.assign(document.createElement('b'), { textContent: p }) : document.createTextNode(p))); }
  el.style.opacity = ease((l - .2) / .4) * (1 - ease((l - (d - .4)) / .3));
}
function camera(rect, padding = 40) {
  // Always full-bleed: never zoom out past the frame width.
  const s = Math.max(VW / PW, Math.min(VW / (rect.w + padding * 2), VH / (rect.h + padding * 2), 2.6));
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  return { s, x: clamp(VW / 2 - cx * s, Math.min(0, VW - PW * s), 0), y: clamp(VH / 2 - cy * s, Math.min(0, VH - PH * s), 0) };
}
const mix = (a, b, k) => ({ s: lerp(a.s, b.s, k), x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
const full = { s: VW / PW, x: 0, y: (VH - PH * VW / PW) / 2 };
function shoot(img, cam, ring = null, k = 0, dim = 0) {
  if ($('shot').dataset.src !== img) { $('shot').dataset.src = img; $('shot').src = sources[img]; }
  // Globe frames are filmed at the screen's own size; everything else is a 1440 px capture.
  $('shot').style.width = img[0] === 'g' ? '1920px' : '';
  $('shot').style.filter = dim ? `brightness(${1 - dim * .7}) blur(${dim * 3}px)` : '';
  $('page').style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`;
  const r = $('ring');
  if (ring && k > 0) { r.style.opacity = k; r.style.left = `${cam.x + ring.x * cam.s - 10}px`; r.style.top = `${cam.y + ring.y * cam.s - 10}px`; r.style.width = `${ring.w * cam.s + 20}px`; r.style.height = `${ring.h * cam.s + 20}px`; }
  else r.style.opacity = 0;
}
// A stretch of the globe footage played across [t0, t1] of the scene, with an optional slow push in.
function globe(from, to, l, t0, t1, push = 0) {
  const k = clamp((l - t0) / (t1 - t0)), s = 1 + push * k;
  shoot(`g${Math.round(lerp(from, to - 1, k))}`, { s, x: VW / 2 * (1 - s), y: VH / 2 * (1 - s) });
}
// Scenes in the same studio flow into each other without a dip to black; only real changes of place fade.
const studio = new Set(['slate', 'choices', 'baseline']);
let edges = { in: true, out: true };
function film(l, d) { $('film').style.opacity = (edges.in ? ease(l / .3) : 1) * (edges.out ? 1 - ease((l - (d - .3)) / .3) : 1); }
// A studio panel: it lifts out of the page (the studio dims and blurs behind it) into a centred card with an
// amber edge, then scrolls slowly through its own content. glide 0 starts already centred, for panels that follow
// one another in the same place.
function panel(name, l, d, glide = 1) {
  const r = SHOTS[name], k = 2, viewH = Math.min(r.h, 330), W = r.w * k, H = viewH * k;
  const home = { x: full.x + r.x * full.s, y: full.y + r.y * full.s, w: r.w * full.s, h: viewH * full.s };
  const goal = { x: (VW - W) / 2, y: Math.max(30, (VH - 150 - H) / 2), w: W, h: H };
  const m = glide ? ease(l / glide) : 1, box = { x: lerp(home.x, goal.x, m), y: lerp(home.y, goal.y, m), w: lerp(home.w, goal.w, m), h: lerp(home.h, goal.h, m) };
  shoot(name, full, null, 0, .9 * m);
  const card = $('pcard'), img = $('pcardImg'), sc = box.w / r.w;
  if (img.dataset.src !== name) { img.dataset.src = name; img.src = sources[name]; }
  // Scroll through what doesn't fit, gently, after the card has landed.
  const scroll = Math.max(0, r.h - viewH) * ease((l - glide - .9) / Math.max(2, d - glide - 1.4));
  Object.assign(card.style, { opacity: 1, left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
  img.style.width = '1440px';
  img.style.transform = `scale(${sc}) translate(${-r.x}px, ${-(r.y + scroll)}px)`;
  $('pcardEdge').style.opacity = ease((l - glide) / .4);
}
// Before and after: k is how far the redesign has been wiped across (0 = all before, 1 = all after).
function wipe(before, after, k, zoom = 1, where = '') {
  $('wipe').style.opacity = 1;
  if ($('before').dataset.src !== before) { $('before').dataset.src = before; $('before').src = photos[before]; }
  if ($('after').dataset.src !== after) { $('after').dataset.src = after; $('after').src = photos[after]; }
  $('after').style.clipPath = `inset(0 ${(1 - k) * 100}% 0 0)`;
  $('wipeImgs').style.transform = `scale(${zoom})`;
  $('wipeLine').style.left = $('wipeKnob').style.left = `${k * 100}%`;
  $('wipeLine').style.opacity = $('wipeKnob').style.opacity = k > .01 && k < .99 ? 1 : 0;
  $('wipeWhere').textContent = where;
}
// A wipe's path through time: [time, position] keys, eased between them.
function path(keys, l) {
  if (l <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (l <= keys[i][0]) { const [t0, a] = keys[i - 1], [t1, b] = keys[i]; return lerp(a, b, ease((l - t0) / (t1 - t0))); }
  return keys[keys.length - 1][1];
}
function place(x, y, img, where, name, k) {
  const p = $('place'); p.style.opacity = clamp(k); p.style.left = `${x}px`; p.style.top = `${y}px`; p.style.transform = `translateY(${(1 - spring(k)) * 30}px)`;
  if ($('placeImg').dataset.src !== img) { $('placeImg').dataset.src = img; $('placeImg').src = photos[img]; }
  $('placeWhere').textContent = where; $('placeName').textContent = name;
}
// Kinetic type: each word springs up on its own beat.
function kicker(words, l, at = 0, gap = .18) {
  const el = $('kicker');
  if (el.dataset.t !== words.join(' ')) { el.dataset.t = words.join(' '); el.replaceChildren(...words.map((w, i) => { const s = document.createElement('span'); s.innerHTML = w; if (i) s.style.marginLeft = '0.25em'; return s; })); }
  [...el.children].forEach((s, i) => { const k = spring((l - at - i * gap) / .5); s.style.opacity = clamp(k * 1.5); s.style.transform = `translateY(${(1 - k) * 60}px)`; });
}
const hide = () => {
  for (const id of ['pin', 'pulse', 'coord', 'place', 'wipe', 'log', 'pcard', 'livetag']) $(id).style.opacity = 0;
  $('labels').replaceChildren(); $('kicker').replaceChildren(); $('kicker').dataset.t = '';
};

const draw = {
  // The globe is already turning behind the name, so the film opens on motion.
  title(l, d) {
    film(l, d + 1);
    globe(GLOBE.spin, GLOBE.dive, l, 0, d, .08);
    if (l < d * .45) kicker(['Open<b>here</b>'], l, .1);
    else kicker(['Pick', 'a', 'space.', 'Design', 'it', 'for', 'locals.'], l, d * .45, .12);
  },
  // The real globe dives into Parkdale; the space's photo and name land beside its pin.
  globe(l, d) {
    film(l, d);
    globe(GLOBE.dive, GLOBE.hop, l, 0, d - .2);
    place(1060, 380, 'parkdale', 'Parkdale, Toronto', 'Emptied Dollarama, Queen St W', (l - (d - 2.6)) / .5);
  },
  // The agent's run over the street map, one line per step: Qloo's answers in amber, its own reasoning in italics.
  build(l, d) {
    film(l, d);
    globe(GLOBE.hold, GLOBE.hop, l, 0, d, .05);
    $('shot').style.filter = 'brightness(.45) blur(2px)';
    const rows = DATA.agent || [], step = (d - 1.2) / rows.length, box = $('log'), list = $('logRows');
    if (list.children.length !== rows.length) list.replaceChildren(...rows.map(r => { const el = document.createElement('div'); el.className = `row${r.qloo ? ' q' : ''}${r.tool === 'thinking' ? ' t' : ''}`; el.innerHTML = '<span></span><b></b>'; el.firstChild.textContent = r.tool; el.lastChild.textContent = r.text; return el; }));
    box.style.opacity = 1;
    const n = clamp(Math.floor((l - .3) / step) + 1, 0, rows.length), k = clamp(((l - .3) % step) / .35);
    [...list.children].forEach((el, i) => { const on = i < n - 1 ? 1 : i === n - 1 ? k : 0; el.style.opacity = on; el.style.transform = `translateY(${(1 - out(on)) * 24}px)`; });
    // Scroll so the newest line sits at the bottom of the box.
    const bottom = i => i < 0 ? 0 : Math.max(0, list.children[i].offsetTop + list.children[i].offsetHeight - box.clientHeight);
    list.style.transform = `translateY(${-lerp(bottom(n - 2), bottom(n - 1), out(k))}px)`;
  },
  // Over the street map: one point, and what Qloo returns fanning out around it.
  qloo(l, d) {
    film(l, d);
    globe(GLOBE.hold, GLOBE.hop, l, 0, d, .06);
    $('shot').style.filter = `brightness(${1 - .45 * ease((l - .3) / .6)})`;
    const cx = 960, cy = 480, pin = $('pin');
    pin.style.opacity = clamp((l - .2) / .2); pin.style.left = `${cx}px`; pin.style.top = `${cy + 40}px`;
    const p = (l % 1.6) / 1.6; $('pulse').style.left = `${cx}px`; $('pulse').style.top = `${cy + 40}px`; $('pulse').style.opacity = 1 - p; $('pulse').style.transform = `scale(${1 + p * 6})`;
    $('coord').style.left = `${cx + 60}px`; $('coord').style.top = `${cy + 20}px`; $('coord').style.opacity = ease((l - .3) / .4); $('coord').textContent = `${DATA.point}  ·  signal.location`;
    const spots = [[-560, -280], [330, -280], [-600, -80], [380, -80], [-560, 130], [360, 130]];
    $('labels').replaceChildren(...(DATA.outputs || []).map(([k, v], i) => { const el = document.createElement('div'); el.className = 'label'; el.innerHTML = '<span></span><b></b>'; el.firstChild.textContent = k; el.lastChild.textContent = v; el.style.left = `${cx + spots[i][0]}px`; el.style.top = `${cy + spots[i][1]}px`; return el; }));
    [...$('labels').children].forEach((el, i) => { const k = spring((l - .9 - i * .45) / .5); el.style.opacity = clamp(k); el.style.transform = `scale(${.8 + .2 * k})`; });
  },
  // The real photo, with the redesign wiped across it and back, so you can see what stayed and what changed.
  reveal(l, d) {
    film(l, d);
    const k = path([[.4, 0], [1.6, 1], [2.6, .3], [3.5, .75], [4.3, .15], [5.3, 1]], l);
    wipe('parkdale', 'afterParkdale', k, 1 + .07 * clamp(l / d), 'Parkdale, Toronto  ·  same walls, windows and camera');
  },
  slate(l, d) { film(l, d); panel('slate', l, d); },
  // Panels that follow one another cut straight from card to card, already centred.
  choices(l, d) { film(l, d); l < d * .55 ? panel('choices', l, d * .55, 0) : panel('audience', l - d * .55, d * .45, 0); },
  baseline(l, d) { film(l, d); panel('baseline', l, d, 0); },
  // The same room for a brand: wipe to the Red Bull version, then the fit score.
  fit(l, d) {
    film(l, d);
    if (l < 3.2) wipe('parkdale', 'afterRedbull', path([[.2, 0], [1.2, 1], [1.9, .4], [2.6, 1]], l), 1 + .05 * clamp(l / 3.2), 'Red Bull  ×  Phoebe Bridgers fans');
    else panel('fit', l - 3.2, d - 3.2);
  },
  // Back out to the map and over to Chelsea, New York: the same idea anywhere.
  anywhere(l, d) {
    film(l, d);
    const hop = Math.min(3.6, d * .45);
    if (l < hop) {
      globe(GLOBE.hop, GLOBE.frames, l, 0, hop);
      place(1060, 380, 'chelsea', 'Chelsea, New York', 'Empire Diner dining car', (l - (hop - 1.3)) / .4);
    } else wipe('chelsea', 'afterChelsea', path([[hop + .2, 0], [hop + 1.3, 1], [hop + 2.1, .35], [hop + 2.9, 1]], l), 1 + .06 * clamp((l - hop) / (d - hop)), 'Chelsea, New York  ·  a café for the people around it');
  },
  walk(l, d) {
    film(l, d);
    if (!WALK) return shoot('venue', full);
    const tag = $('livetag'), k = spring((l - .5) / .6); tag.style.opacity = clamp(k); tag.style.transform = `translateY(${(1 - k) * -20}px)`;
    const s = 1 + .05 * clamp(l / d);
    shoot(`w${Math.min(WALK - 1, Math.floor(clamp(l / d) * WALK))}`, { s: full.s * s, x: VW / 2 * (1 - s), y: full.y * s + VH / 2 * (1 - s) });
  },
  end(l, d) { $('cardEnd').style.opacity = ease(l / .6); const img = $('cardEnd').querySelector('img'); const k = spring(l / .9); img.style.transform = `translateY(${(1 - k) * -80}px)`; }
};

window.renderAt = t => {
  for (const id of ['cardTitle', 'film', 'cardEnd']) $(id).style.opacity = 0;
  const found = scenes.findIndex(s => t >= s.start && t < s.start + s.dur), i = found < 0 ? scenes.length - 1 : found, s = scenes[i];
  edges = { in: !(studio.has(s.id) && studio.has(scenes[i - 1]?.id)), out: !(studio.has(s.id) && studio.has(scenes[i + 1]?.id)) };
  hide();
  const l = t - s.start;
  draw[s.id](l, s.dur);
  if (s.caption) sub(s.caption, l, s.dur); else $('sub').style.opacity = 0;
};
window.renderAt(0);
