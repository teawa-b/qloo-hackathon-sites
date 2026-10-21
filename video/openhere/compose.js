// Openhere's film, cinematic: every frame is a pure function of time; renderAt(t) sets the stage for t seconds.
// Captures are 1440x900 CSS px (studio shots at 2x, frame sequences at 1x) shown full-bleed in a letterboxed
// 1920x940 screen; shots.json says where each studio panel sits.
const $ = id => document.getElementById(id);
const { scenes, boxes: DATA, url } = window.TIMELINE;
const SHOTS = DATA.shots || {}, BUILD = DATA.build || { frames: 1, doneAt: 0 };
const WALK = DATA.walkFrames || 0;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const spring = x => { x = clamp(x); return 1 - Math.pow(1 - x, 3) * Math.cos(x * 4.2); };
const lerp = (a, b, k) => a + (b - a) * k;
const VW = 1920, VH = 940, PW = 1440, PH = 900;
const pad = n => String(n).padStart(3, '0');

const sources = { home: 'assets/home.png', venue: 'assets/studio-venue.png', activation: 'assets/studio-activation.png' };
for (const k of Object.keys(SHOTS)) sources[k] = `assets/${k}.png`;
for (let i = 0; i < BUILD.frames; i++) sources[`b${i}`] = `assets/build-${pad(i)}.jpg`;
for (let i = 0; i < WALK; i++) sources[`w${i}`] = `assets/walk-${pad(i)}.jpg`;
window.ready = Promise.all([document.fonts.ready, ...Object.values(sources).map(src => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = src; }))]);
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
  $('shot').style.filter = dim ? `brightness(${1 - dim * .7}) blur(${dim * 3}px)` : '';
  $('page').style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`;
  const r = $('ring');
  if (ring && k > 0) { r.style.opacity = k; r.style.left = `${cam.x + ring.x * cam.s - 10}px`; r.style.top = `${cam.y + ring.y * cam.s - 10}px`; r.style.width = `${ring.w * cam.s + 20}px`; r.style.height = `${ring.h * cam.s + 20}px`; }
  else r.style.opacity = 0;
}
function film(l, d) { $('film').style.opacity = ease(l / .4) * (1 - ease((l - (d - .35)) / .35)); }
// A studio panel: the camera glides from the full studio onto the panel, which gets an amber ring.
function panel(name, l, d, at = .8) {
  const r = SHOTS[name], focus = { x: r.x - 10, y: Math.max(0, r.y - 20), w: r.w + 20, h: Math.min(r.h + 40, 520) };
  shoot(name, mix(full, camera(focus, 30), ease((l - .2) / 1.4)), { ...r, h: Math.min(r.h, 500) }, ease((l - at) / .5));
}
const hide = () => { $('pin').style.opacity = 0; $('pulse').style.opacity = 0; $('coord').style.opacity = 0; $('labels').replaceChildren(); };

const draw = {
  title(l, d) {
    $('cardTitle').style.opacity = ease(l / .6) * (1 - ease((l - (d - .5)) / .5));
    const img = $('cardTitle').querySelector('img'); const k = spring((l - .2) / .9);
    img.style.transform = `translateY(${(1 - k) * -120}px)`; img.style.opacity = clamp((l - .2) / .3);
  },
  // The globe, then the pin drops onto Toronto.
  globe(l, d) {
    film(l, d);
    // Push toward North America on the globe; the pin is anchored to Toronto's spot in the capture, so it moves with it.
    const cam = mix(full, camera({ x: 420, y: 220, w: 320, h: 240 }, 20), ease((l - .3) / (d - .8)));
    shoot('home', cam);
    const tx = cam.x + 536 * cam.s, ty = cam.y + 318 * cam.s, k = spring((l - 1.4) / .7), pin = $('pin');
    pin.style.opacity = clamp((l - 1.4) / .15); pin.style.left = `${tx}px`; pin.style.top = `${ty - (1 - k) * 300}px`;
    const p = clamp((l - 2.0) / 1.2); $('pulse').style.left = `${tx}px`; $('pulse').style.top = `${ty}px`; $('pulse').style.opacity = (1 - p) * (l > 2 ? 1 : 0); $('pulse').style.transform = `scale(${1 + p * 5})`;
  },
  build(l, d) { film(l, d); const end = Math.max(1, BUILD.doneAt - 1), f = Math.min(end, Math.floor(clamp((l - .2) / (d - .9)) * end)); shoot(`b${f}`, mix(full, camera({ x: 0, y: 0, w: 900, h: 620 }, 10), ease(l / d) * .6)); },
  // Over the real photo: one point on the map, and what the agent learns fanning out around it.
  qloo(l, d) {
    film(l, d);
    shoot('venue', camera({ x: 12, y: 12, w: 448 * 1.6, h: 500 * 1.6 }, 0), null, 0, ease((l - .5) / .8));
    const cx = 960, cy = 450, pin = $('pin');
    pin.style.opacity = 1; pin.style.left = `${cx}px`; pin.style.top = `${cy + 40}px`;
    const p = (l % 1.6) / 1.6; $('pulse').style.left = `${cx}px`; $('pulse').style.top = `${cy + 40}px`; $('pulse').style.opacity = 1 - p; $('pulse').style.transform = `scale(${1 + p * 6})`;
    $('coord').style.left = `${cx + 60}px`; $('coord').style.top = `${cy + 20}px`; $('coord').style.opacity = ease((l - .3) / .4); $('coord').textContent = `${DATA.point}  ·  signal.location`;
    const spots = [[-520, -250], [330, -250], [-560, -60], [380, -60], [-520, 130], [360, 130]];
    if (!$('labels').children.length) $('labels').replaceChildren(...(DATA.outputs || []).map(([k, v], i) => { const el = document.createElement('div'); el.className = 'label'; el.innerHTML = '<span></span><b></b>'; el.firstChild.textContent = k; el.lastChild.textContent = v; el.style.left = `${cx + spots[i][0]}px`; el.style.top = `${cy + spots[i][1]}px`; return el; }));
    [...$('labels').children].forEach((el, i) => { const k = spring((l - 1.2 - i * .55) / .6); el.style.opacity = clamp(k); el.style.transform = `scale(${.8 + .2 * k})`; });
  },
  reveal(l, d) {
    film(l, d);
    const from = BUILD.doneAt, to = BUILD.frames - 1, sweep = Math.min(2.6, d * .45);
    if (l < sweep) shoot(`b${Math.min(to, from + Math.floor((l / sweep) * (to - from)))}`, full);
    else shoot('venue', mix(full, camera({ x: 12, y: 12, w: 806, h: 900 }, 0), ease((l - sweep) / 3)));
  },
  slate(l, d) { film(l, d); panel('slate', l, d, .6); },
  choices(l, d) { film(l, d); l < d * .55 ? panel('choices', l, d, .5) : panel('audience', l - d * .55, d * .45, .3); },
  baseline(l, d) { film(l, d); panel('baseline', l, d, .8); },
  fit(l, d) { film(l, d); l < 1.6 ? shoot('activation', mix(full, camera({ x: 12, y: 12, w: 806, h: 900 }, 0), ease(l / 1.6))) : panel('fit', l - 1.6, d - 1.6, .3); },
  walk(l, d) { film(l, d); if (!WALK) return shoot('venue', full); shoot(`w${Math.min(WALK - 1, Math.floor(clamp(l / d) * WALK))}`, full); },
  end(l, d) { $('cardEnd').style.opacity = ease(l / .6); const img = $('cardEnd').querySelector('img'); const k = spring(l / .9); img.style.transform = `translateY(${(1 - k) * -80}px)`; }
};

window.renderAt = t => {
  for (const id of ['cardTitle', 'film', 'cardEnd']) $(id).style.opacity = 0;
  const s = scenes.find(s => t >= s.start && t < s.start + s.dur) || scenes[scenes.length - 1];
  if (s.id !== 'globe' && s.id !== 'qloo') hide();
  const l = t - s.start;
  draw[s.id](l, s.dur);
  if (s.caption) sub(s.caption, l, s.dur); else $('sub').style.opacity = 0;
};
window.renderAt(0);
