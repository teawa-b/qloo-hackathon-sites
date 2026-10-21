// Roomful's film, soft and warm: every frame is a pure function of time; renderAt(t) sets the stage for t seconds.
// The painted room is the hero (full-bleed, drifting slowly, or as a polaroid); the app's own pages float as cards
// over a blurred copy of the painting. room.png is the finished page at 1440 CSS px wide; boxes say where parts sit.
const $ = id => document.getElementById(id);
const { scenes, boxes: DATA, url } = window.TIMELINE;
const BUILD = DATA.build || { frames: 1, doneAt: 0 }, WALK = DATA.walkFrames || 0;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const spring = x => { x = clamp(x); return 1 - Math.pow(1 - x, 3) * Math.cos(x * 4.2); };
const pad = n => String(n).padStart(3, '0');
const PAINTING = '../../public/img/demo-room-rain-1.jpg';

const sources = { home: 'assets/home.png', form: 'assets/form.png', room: 'assets/room.png', painting: PAINTING };
for (let i = 0; i < BUILD.frames; i++) sources[`b${i}`] = `assets/build-${pad(i)}.jpg`;
for (let i = 0; i < WALK; i++) sources[`w${i}`] = `assets/walk-${pad(i)}.jpg`;
window.ready = Promise.all([document.fonts.ready, ...Object.values(sources).map(src => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = src; }))]);
$('endUrl').textContent = url || '';

// Captions: each word comes into focus, one after another.
function cap(text, l, d) {
  const el = $('cap');
  if (el.dataset.t !== text) { el.dataset.t = text; el.replaceChildren(...text.split(' ').filter(Boolean).map(w => Object.assign(document.createElement('span'), { className: `w${/qloo/i.test(w) ? ' q' : ''}`, textContent: w }))); }
  const words = [...el.children];
  words.forEach((w, i) => { const k = ease((l - .2 - i * .12) / .5), out = ease((l - (d - .4)) / .35); w.style.opacity = k * (1 - out); w.style.filter = `blur(${(1 - k) * 8}px)`; });
}
function bg(src, scale = 1.08, dx = 0, dy = 0, soft = false) {
  const b = $('bg'); if (b.dataset.src !== src) { b.dataset.src = src; b.src = sources[src]; }
  b.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})`;
  b.classList.toggle('soft', soft);
}
function polaroid(show, src = '', note = '', x = 0, y = 0, w = 0, rot = 0, k = 1) {
  const p = $('pol'); p.style.display = show ? 'block' : 'none'; if (!show) return;
  if ($('polImg').dataset.src !== src) { $('polImg').dataset.src = src; $('polImg').src = sources[src]; }
  $('polNote').textContent = note;
  p.style.left = `${x}px`; p.style.top = `${y}px`; p.style.width = `${w}px`; p.style.opacity = k; p.style.transform = `translateY(${(1 - k) * 60}px) rotate(${rot}deg)`;
}
// A page of the app as a floating card: frame a rectangle of the capture inside a card of size cw x ch.
function floating(show, src, rect, cw = 1100, ch = 680, k = 1, rot = 1) {
  const f = $('flo'); f.style.display = show ? 'block' : 'none'; if (!show) return;
  if ($('shot').dataset.src !== src) { $('shot').dataset.src = src; $('shot').src = sources[src]; }
  const s = Math.min(cw / rect.w, ch / rect.h, 2);
  f.style.width = `${rect.w * s}px`; f.style.height = `${rect.h * s}px`; f.style.left = `${(1920 - rect.w * s) / 2}px`; f.style.top = `${(1000 - rect.h * s) / 2 - 30}px`;
  f.style.opacity = k; f.style.transform = `translateY(${(1 - k) * 60}px) rotate(${rot}deg)`;
  $('page').style.transform = `translate(${-rect.x * s}px, ${-rect.y * s}px) scale(${s})`;
}
function reset() { polaroid(false); floating(false); $('clogo').style.opacity = 0; $('chips').replaceChildren(); $('notes').replaceChildren(); }
const inOut = (l, d) => ease(l / .5) * (1 - ease((l - (d - .45)) / .45));

const draw = {
  // The line-drawn room opens out of a growing circle.
  title(l, d) {
    $('cardTitle').style.opacity = 1 - ease((l - (d - .5)) / .5);
    const r = ease((l - .1) / 1.1) * 75; $('titleLogo').style.clipPath = `circle(${r}% at 50% 55%)`;
    $('cardTitle').querySelector('h1').style.opacity = ease((l - .8) / .6);
    $('cardTitle').querySelector('p').style.opacity = ease((l - 1.2) / .6);
  },
  form(l, d) { bg('painting', 1.15, 0, 0, true); const k = inOut(l, d); floating(true, l < 1.2 ? 'home' : 'form', { x: 90, y: 150, w: 1260, h: 560 }, 1200, 640, k, -1); },
  build(l, d) { bg('painting', 1.15, 0, 0, true); const end = Math.max(1, BUILD.doneAt - 1), f = Math.min(end, Math.floor(clamp((l - .2) / (d - .9)) * end)); floating(true, `b${f}`, { x: 0, y: 0, w: 1440, h: 860 }, 1240, 720, inOut(l, d), .8); },
  // What you love floats in; what Qloo says people with that taste love gets pinned around the room.
  qloo(l, d) {
    bg('painting', 1.2, 0, 0, true);
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
  // The painting arrives as a polaroid, then fills the screen.
  reveal(l, d) {
    const k = spring(l / .9), grow = ease((l - 2.2) / 1.6);
    bg('painting', 1.06 + .04 * ease(l / d), 0, 0, grow < .98);
    $('bg').style.opacity = 1;
    polaroid(grow < .99, 'painting', 'Quiet Signal Room', 960 - (820 + grow * 1100) / 2, 140 - grow * 140, 820 + grow * 1100, -2 * (1 - grow), clamp(k) * (1 - grow));
  },
  choices(l, d) { bg('painting', 1.2, 30, 0, true); const r = DATA.choices; floating(true, 'room', { x: r.x, y: r.y, w: r.w * .62, h: Math.min(r.h, 430) }, 1200, 700, inOut(l, d), -.8); },
  compare(l, d) { bg('painting', 1.2, -30, 0, true); const r = DATA.compare; floating(true, 'room', { x: r.x - 10, y: r.y - 10, w: r.w + 20, h: Math.min(r.h, 620) }, 1200, 720, inOut(l, d), .8); },
  walk(l, d) { const n = WALK; if (!n) return bg('painting', 1.1); bg(`w${Math.min(n - 1, Math.floor(clamp(l / d) * n))}`, 1.34, 0, 0, false); },
  end(l, d) { $('cardEnd').style.opacity = ease(l / .6); }
};

window.renderAt = t => {
  for (const id of ['cardTitle', 'scene', 'cardEnd']) $(id).style.opacity = 0;
  const s = scenes.find(s => t >= s.start && t < s.start + s.dur) || scenes[scenes.length - 1];
  const l = t - s.start;
  if (s.id !== 'title' && s.id !== 'end') { $('scene').style.opacity = ease(l / .35) * (1 - ease((l - (s.dur - .3)) / .3)); }
  if (s.id !== 'qloo') reset(); else { polaroid(false); floating(false); }
  draw[s.id](l, s.dur);
  if (s.caption) cap(s.caption, l, s.dur); else $('cap').replaceChildren();
};
window.renderAt(0);
