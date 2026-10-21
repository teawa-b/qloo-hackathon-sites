// Roomful's film, soft and warm: every frame is a pure function of time; renderAt(t) sets the stage for t seconds.
// The app's own screens float as labelled cards over a blurred copy of the painting; rings and callouts point at
// the exact thing being described. boxes.json (from capture.js) says where everything sits in the captures.
const $ = id => document.getElementById(id);
const { scenes, boxes: DATA, url } = window.TIMELINE;
const BUILD = DATA.build || { frames: 1, doneAt: 0 }, TYPE = DATA.typeFrames || 1, WALK = DATA.walkFrames || 0;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const spring = x => { x = clamp(x); return 1 - Math.pow(1 - x, 3) * Math.cos(x * 4.2); };
const pad = (n, w = 3) => String(n).padStart(w, '0');
const PAINTING = '../../public/img/demo-room-rain-1.jpg';

const sources = { room: 'assets/room.png', painting: PAINTING };
for (let i = 0; i < TYPE; i++) sources[`t${i}`] = `assets/type-${pad(i, 2)}.jpg`;
for (let i = 0; i < BUILD.frames; i++) sources[`b${i}`] = `assets/build-${pad(i)}.jpg`;
for (let i = 0; i < WALK; i++) sources[`w${i}`] = `assets/walk3d/f-${pad(i)}.jpg`;
window.ready = Promise.all([document.fonts.ready, ...Object.values(sources).map(src => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = src; }))]);
$('endUrl').textContent = url || '';
$('withList').replaceChildren(...(DATA.withQloo || []).map(n => { const li = document.createElement('li'); li.innerHTML = '<span></span><em class="ok">From Qloo</em>'; li.firstChild.textContent = n; return li; }));
const verdict = { known: 'Not what this taste rates', unknown: 'Not in Qloo', ranked: 'Holds up' };
$('withoutList').replaceChildren(...(DATA.without || []).map(p => { const li = document.createElement('li'); li.innerHTML = `<span></span><em class="${p.verdict === 'ranked' ? 'ok' : p.verdict}"></em>`; li.firstChild.textContent = p.name; li.lastChild.textContent = verdict[p.verdict]; return li; }));
$('withoutScore').textContent = `${(DATA.without || []).filter(p => p.verdict === 'ranked').length} of ${(DATA.without || []).length} hold up for this taste`;

function cap(text, l, d) {
  const el = $('cap');
  if (el.dataset.t !== text) { el.dataset.t = text; el.replaceChildren(...text.split(' ').filter(Boolean).map(w => Object.assign(document.createElement('span'), { className: `w${/qloo/i.test(w) ? ' q' : ''}`, textContent: w }))); }
  [...el.children].forEach((w, i) => { const k = ease((l - .2 - i * .12) / .5), out = ease((l - (d - .4)) / .35); w.style.opacity = k * (1 - out); w.style.filter = `blur(${(1 - k) * 8}px)`; });
}
function bg(src, scale = 1.08, soft = false) {
  const b = $('bg'); if (b.dataset.src !== src) { b.dataset.src = src; b.src = sources[src]; }
  b.style.transform = `translate(-50%, -50%) scale(${scale})`; b.classList.toggle('soft', soft);
}
function polaroid(show, src = '', note = '', x = 0, y = 0, w = 0, rot = 0, k = 1) {
  const p = $('pol'); p.style.display = show ? 'block' : 'none'; if (!show) return;
  if ($('polImg').dataset.src !== src) { $('polImg').dataset.src = src; $('polImg').src = sources[src]; }
  $('polNote').textContent = note;
  p.style.left = `${x}px`; p.style.top = `${y}px`; p.style.width = `${w}px`; p.style.opacity = k; p.style.transform = `translateY(${(1 - k) * 60}px) rotate(${rot}deg)`;
}
// A screen of the app framing `rect` (capture CSS px) in a card; returns where the card is and its scale.
let card = null;
function floating(show, src, rect, cw = 1100, ch = 620, k = 1) {
  const f = $('flo'); f.style.display = show ? 'block' : 'none'; card = null; if (!show) return;
  if ($('shot').dataset.src !== src) { $('shot').dataset.src = src; $('shot').src = sources[src]; }
  const s = Math.min(cw / rect.w, ch / rect.h, 2.4), w = rect.w * s, h = rect.h * s, x = (1920 - w) / 2, y = (1000 - h) / 2 + 10;
  Object.assign(f.style, { width: `${w}px`, height: `${h}px`, left: `${x}px`, top: `${y}px`, opacity: k, transform: `translateY(${(1 - k) * 50}px)` });
  $('page').style.transform = `translate(${-rect.x * s}px, ${-rect.y * s}px) scale(${s})`;
  card = { x, y, w, h, s, rect };
}
// The label sits just above the card's top-left corner.
function label(n, text, k) { const el = $('label'); $('labelN').textContent = n; $('labelT').textContent = text; el.style.opacity = k; if (card) { el.style.left = `${card.x}px`; el.style.top = `${card.y - 78}px`; } el.style.transform = `translateY(${(1 - k) * 14}px)`; }
// A ring on an element of the capture (inside the card), with a callout tag above it.
function ring(id, calloutId, target, text, k) {
  const r = $(id), c = $(calloutId);
  if (!card || !target || k <= 0) { r.style.opacity = 0; c.style.opacity = 0; return; }
  const x = (target.x - card.rect.x) * card.s, y = (target.y - card.rect.y) * card.s, w = target.w * card.s, h = target.h * card.s;
  Object.assign(r.style, { left: `${x - 8}px`, top: `${y - 8}px`, width: `${w + 16}px`, height: `${h + 16}px`, opacity: k });
  c.textContent = text; c.style.opacity = k; c.style.left = `${card.x + x}px`; c.style.top = `${card.y + y + h + 22}px`; c.style.transform = `translateY(${(1 - k) * 10}px)`;
}
function reset() { polaroid(false); floating(false); $('label').style.opacity = 0; ring('ringA', 'calloutA', null, '', 0); ring('ringB', 'calloutB', null, '', 0); $('clogo').style.opacity = 0; $('chips').replaceChildren(); $('notes').replaceChildren(); $('vs').style.opacity = 0; }
const inOut = (l, d) => ease(l / .5) * (1 - ease((l - (d - .45)) / .45));

const draw = {
  title(l, d) {
    $('cardTitle').style.opacity = 1 - ease((l - (d - .5)) / .5);
    $('titleLogo').style.clipPath = `circle(${ease((l - .1) / 1.1) * 75}% at 50% 55%)`;
    $('cardTitle').querySelector('h1').style.opacity = ease((l - .8) / .6);
    $('cardTitle').querySelector('p').style.opacity = ease((l - 1.2) / .6);
  },
  // The favourites being typed, filmed from the app, framed on the search box.
  form(l, d) {
    bg('painting', 1.15, true);
    const f = Math.min(TYPE - 1, Math.floor(clamp((l - .4) / (d * .6)) * TYPE));
    const box = DATA.input, go = DATA.go, rect = { x: box.x - 30, y: box.y - 125, w: go.x + go.w - box.x + 60, h: 245 };
    floating(true, `t${f}`, rect, 1300, 560, inOut(l, d));
    label('1', 'You type what you love', ease((l - .5) / .5));
    ring('ringA', 'calloutA', { x: box.x, y: box.y, w: go.x + go.w - box.x, h: box.h }, 'Bands, films, books, brands', ease((l - 1) / .5) * (1 - ease((l - (d - .5)) / .3)));
  },
  // The steps arriving as Qloo answers, framed on the progress list under the painting.
  build(l, d) {
    bg('painting', 1.15, true);
    const end = Math.max(1, BUILD.doneAt - 1), f = Math.min(end, Math.floor(clamp((l - .2) / (d - .9)) * end));
    floating(true, `b${f}`, { x: 100, y: 660, w: 800, h: 240 }, 1400, 600, inOut(l, d));
    label('2', 'Qloo reads the taste', ease((l - .4) / .5));
  },
  qloo(l, d) {
    bg('painting', 1.2, true);
    $('clogo').style.opacity = inOut(l, d); $('clogo').style.transform = `scale(${.9 + .1 * ease(l / 1)})`;
    if (!$('chips').children.length) {
      const spots = [[160, 220], [1420, 230], [210, 760], [1400, 770]];
      $('chips').replaceChildren(...(DATA.seeds || []).map((n, i) => Object.assign(document.createElement('div'), { className: 'chip', textContent: n, style: `left:${spots[i % 4][0]}px;top:${spots[i % 4][1]}px` })));
      const slots = [[120, 380], [1440, 380], [560, 120], [1000, 120], [560, 800], [1000, 800]];
      $('notes').replaceChildren(...(DATA.outputs || []).map(([k, v], i) => { const n = document.createElement('div'); n.className = 'pinned'; n.innerHTML = '<span></span><b></b>'; n.firstChild.textContent = k; n.lastChild.textContent = v; n.style.left = `${slots[i][0]}px`; n.style.top = `${slots[i][1]}px`; return n; }));
    }
    const out = 1 - ease((l - (d - .45)) / .45);
    [...$('chips').children].forEach((c, i) => { const k = spring((l - .2 - i * .25) / .6), drift = ease((l - 1.6) / 1); c.style.opacity = clamp(k) * (1 - drift); c.style.transform = `translate(${(960 - parseFloat(c.style.left) - 120) * drift * .8}px, ${(500 - parseFloat(c.style.top)) * drift * .8}px) scale(${1 - drift * .4})`; });
    [...$('notes').children].forEach((n, i) => { const k = spring((l - 2.4 - i * .45) / .6); n.style.opacity = clamp(k) * out; n.style.transform = `translateY(${(1 - k) * 30}px) rotate(${i % 2 ? 2 : -2}deg)`; });
  },
  reveal(l, d) {
    const k = spring(l / .9), grow = ease((l - 2.2) / 1.6);
    bg('painting', 1.06 + .04 * ease(l / d), grow < .98);
    polaroid(grow < .99, 'painting', 'Quiet Signal Room', 960 - (820 + grow * 1100) / 2, 140 - grow * 140, 820 + grow * 1100, -2 * (1 - grow), clamp(k) * (1 - grow));
  },
  // One design choice, with what it cites: a Qloo name, and the one name Qloo didn't return.
  choices(l, d) {
    bg('painting', 1.2, true);
    const c = DATA.choiceNo || DATA.firstChoice;
    floating(true, 'room', { x: c.x - 20, y: c.y - 20, w: c.w + 40, h: c.h + 40 }, 1200, 520, inOut(l, d));
    label('3', 'Every choice cites Qloo', ease((l - .4) / .5));
    const fade = 1 - ease((l - (d - .5)) / .3);
    ring('ringA', 'calloutA', DATA.tagOk, 'From Qloo', ease((l - 1.2) / .5) * fade);
    ring('ringB', 'calloutB', DATA.tagNo, 'Not from Qloo, flagged', ease((l - 2.6) / .5) * fade);
  },
  // With and without Qloo, side by side, built from the run itself.
  compare(l, d) {
    bg('painting', 1.2, true);
    $('vs').style.opacity = inOut(l, d);
    $('withList').querySelectorAll('li').forEach((li, i) => { li.style.opacity = ease((l - .4 - i * .12) / .3); });
    $('withoutList').querySelectorAll('li').forEach((li, i) => { li.style.opacity = ease((l - 1.8 - i * .2) / .3); });
  },
  // A real walk through the 3D room, WASD lighting up as it moves.
  walk(l, d) {
    const n = WALK; if (!n) return bg('painting', 1.1);
    bg(`w${Math.min(n - 1, Math.floor(clamp(l / d) * n))}`, 1, false);
  },
  end(l, d) { $('cardEnd').style.opacity = ease(l / .6); }
};

window.renderAt = t => {
  for (const id of ['cardTitle', 'scene', 'cardEnd']) $(id).style.opacity = 0;
  const s = scenes.find(s => t >= s.start && t < s.start + s.dur) || scenes[scenes.length - 1];
  const l = t - s.start;
  if (s.id !== 'title' && s.id !== 'end') $('scene').style.opacity = ease(l / .35) * (1 - ease((l - (s.dur - .3)) / .3));
  reset();
  draw[s.id](l, s.dur);
  // The compare scene has its own headings; captions would crowd it.
  if (s.caption && s.id !== 'compare') cap(s.caption, l, s.dur); else $('cap').replaceChildren();
};
window.renderAt(0);
