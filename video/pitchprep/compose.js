// Pitchprep's film, a dossier: every frame is a pure function of time; renderAt(t) sets the stage for t seconds.
// The brief (brief.png, the whole page at 1440 CSS px wide) sits on a sheet of paper; a camera inside the sheet
// frames one part at a time and a highlighter sweeps over it. Captions are typed in the left column.
const $ = id => document.getElementById(id);
const { scenes, boxes: BOXES, url } = window.TIMELINE;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const spring = x => { x = clamp(x); return 1 - Math.pow(1 - x, 3) * Math.cos(x * 4.2); };
const lerp = (a, b, k) => a + (b - a) * k;
const SW = 1060, SH = 740;
const BUILD_FRAMES = 36;
const files = { form: 'The ask', build: 'Research, with sources', ranked: 'Portfolio, ranked by Qloo', compare: 'Without Qloo', openers: 'Openers', trust: 'Provenance' };

const sources = { home: 'assets/home.png', form: 'assets/form.png', brief: 'assets/brief.png', ...Object.fromEntries(Array.from({ length: BUILD_FRAMES }, (_, i) => [`b${i}`, `assets/build-${String(i).padStart(2, '0')}.jpg`])) };
window.ready = Promise.all([document.fonts.ready, ...Object.values(sources).map(src => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = src; }))]);
$('endUrl').textContent = url || '';
$('rows').replaceChildren(...(BOXES.ranked7 || []).slice(0, 5).map(r => { const d = document.createElement('div'); d.className = 'row'; d.innerHTML = '<span></span><i></i>'; d.firstChild.textContent = r.name; d.lastChild.textContent = r.affinity.toFixed(2); return d; }));

// Typewriter: characters arrive over the first part of the scene; a block cursor blinks after them.
function type(el, text, local, dur) {
  const n = Math.round(clamp((local - .25) / Math.min(1.8, dur * .4)) * text.length);
  if (el.dataset.n === String(n) && el.dataset.t === text) return;
  el.dataset.n = n; el.dataset.t = text;
  el.replaceChildren(...text.slice(0, n).split(/(Qloo)/).map(part => { const s = document.createElement('span'); if (part === 'Qloo') s.className = 'q'; s.textContent = part; return s; }), Object.assign(document.createElement('span'), { className: 'cur' }));
  el.lastChild.style.opacity = n < text.length || Math.floor(local * 2) % 2 ? 1 : 0;
}
function camera(rect, pad = 30, pageH = BOXES.page?.h || 900) {
  const s = Math.min(SW / (rect.w + pad * 2), SH / (rect.h + pad * 2), 2.2);
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  return { s, x: clamp(SW / 2 - cx * s, Math.min(0, SW - 1440 * s), 0), y: clamp(SH / 2 - cy * s, Math.min(0, SH - pageH * s), 0) };
}
const mix = (a, b, k) => ({ s: lerp(a.s, b.s, k), x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
const whole = { s: SW / 1440, x: 0, y: 0 };
// Highlighter: sweeps left to right across the part being talked about.
function shoot(img, cam, mark = null, k = 0) {
  if ($('shot').dataset.src !== img) { $('shot').dataset.src = img; $('shot').src = sources[img]; }
  $('page').style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`;
  const m = $('mark');
  if (mark && k > 0) { m.style.opacity = 1; m.style.left = `${cam.x + mark.x * cam.s - 6}px`; m.style.top = `${cam.y + mark.y * cam.s - 4}px`; m.style.width = `${mark.w * cam.s + 12}px`; m.style.height = `${mark.h * cam.s + 8}px`; m.style.transform = `scaleX(${k})`; }
  else m.style.opacity = 0;
}
// The sheet slides in from below and settles; it leaves the same way.
function desk(l, d, id) {
  $('desk').style.opacity = 1;
  const inK = ease(l / .6), outK = ease((l - (d - .45)) / .45);
  $('sheet').style.transform = `translateY(${(1 - inK) * 60 + outK * 40}px) rotate(-1.2deg)`;
  $('sheet').style.opacity = inK * (1 - outK);
  $('file').textContent = files[id] || '';
  type($('typed'), window.SCENE.caption, l, d);
  $('desk').querySelector('.copy').style.opacity = 1 - outK;
}

const draw = {
  title(l, d) {
    $('cardTitle').style.opacity = 1 - ease((l - (d - .5)) / .5);
    const img = $('cardTitle').querySelector('img'); const k = spring(l / .9);
    img.style.transform = `scale(${.6 + .4 * k})`; img.style.opacity = clamp(l / .4);
    $('cardTitle').querySelector('h1').style.opacity = ease((l - .35) / .5);
    $('cardTitle').querySelector('p').style.opacity = ease((l - .7) / .5);
    const st = clamp((l - 1.6) / .25); $('stamp').style.opacity = st; $('stamp').style.transform = `rotate(-12deg) scale(${1.6 - .6 * st})`;
  },
  form(l, d) { desk(l, d, 'form'); const box = { x: 150, y: 370, w: 545, h: 380 }; shoot('form', mix(whole, camera(box), ease((l - .6) / 1.4)), { x: 150, y: 600, w: 545, h: 60 }, ease((l - 2.4) / .6)); },
  build(l, d) { desk(l, d, 'build'); const f = Math.min(BUILD_FRAMES - 1, Math.floor(clamp((l - .3) / (d - 1.2)) * BUILD_FRAMES)); shoot(`b${f}`, camera({ x: 150, y: 175, w: 1140, h: 380 })); },
  qloo(l, d) {
    $('dia').style.opacity = ease(l / .4) * (1 - ease((l - (d - .4)) / .4));
    type($('typed2'), window.SCENE.caption, l, d);
    [['ixA', .3], ['ixQ', 1.2], ['ixB', 2.4]].forEach(([id, at]) => { const k = spring((l - at) / .6); $(id).style.opacity = clamp(k); $(id).style.transform = `translateY(${(1 - k) * 40}px) rotate(${id === 'ixQ' ? 0 : id === 'ixA' ? -2 : 2}deg)`; });
    $('ixA').querySelectorAll('.row').forEach((r, i) => { r.style.opacity = ease((l - .6 - i * .2) / .3); });
    $('ixB').querySelectorAll('.row').forEach((r, i) => { r.style.opacity = ease((l - 2.9 - i * .35) / .3); });
    const dash = (el, x, w, k) => { el.style.left = `${x}px`; el.style.top = '170px'; el.style.width = `${w}px`; el.style.transform = `scaleX(${k})`; };
    dash($('dashA'), 330, 45, ease((l - 1.0) / .4)); dash($('dashB'), 705, 45, ease((l - 2.2) / .4));
  },
  ranked(l, d) {
    desk(l, d, 'ranked');
    const a = camera({ ...BOXES.head, h: BOXES.head.h + 40 }), b = camera({ x: BOXES.ranked.x, y: BOXES.ranked.y, w: BOXES.ranked.w, h: Math.min(BOXES.ranked.h, 520) });
    const k = ease((l - 2.2) / 1.2);
    shoot('brief', mix(a, b, k), k > .5 ? BOXES.top3 : BOXES.fit, k > .5 ? ease((l - 3.4) / .7) : ease((l - .9) / .5));
  },
  compare(l, d) {
    desk(l, d, 'compare');
    // Both columns first, then a push onto the LLM's picks when the narration reaches them.
    const q = BOXES.cmpQloo, m = BOXES.cmpLlm, both = { x: q.x, y: q.y, w: m.x + m.w - q.x, h: Math.max(q.h, m.h) }, onLlm = l > 2.6;
    shoot('brief', mix(camera(both, 20), camera(m, 24), ease((l - 2.4) / 1)), onLlm ? m : q, onLlm ? ease((l - 2.8) / .6) : ease((l - .6) / .6));
  },
  openers(l, d) { desk(l, d, 'openers'); const r = BOXES.openers; shoot('brief', camera({ ...r, h: Math.min(r.h, 520) }), BOXES.opener1, ease((l - 1.6) / .6)); },
  trust(l, d) {
    desk(l, d, 'trust');
    const a = camera({ x: 150, y: BOXES.legend.y - 20, w: 1140, h: 300 }), b = camera({ ...BOXES.made, h: Math.min(BOXES.made.h, 520) });
    const k = ease((l - 3.0) / 1.2);
    shoot('brief', mix(a, b, k), k < .5 ? BOXES.legend : null, ease((l - .6) / .5));
  },
  end(l, d) { $('cardEnd').style.opacity = ease(l / .5); const img = $('cardEnd').querySelector('img'); const k = spring(l / .9); img.style.transform = `scale(${.7 + .3 * k})`; }
};

window.renderAt = t => {
  for (const id of ['cardTitle', 'desk', 'dia', 'cardEnd']) $(id).style.opacity = 0;
  const s = scenes.find(s => t >= s.start && t < s.start + s.dur) || scenes[scenes.length - 1];
  window.SCENE = s;
  draw[s.id](t - s.start, s.dur);
};
window.renderAt(0);
