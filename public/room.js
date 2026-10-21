const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const safeUrl = v => { try { const u = new URL(v, location.origin); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
let config = {}, render = null, concept = null, taste = null, running = false;

function toast(text, ms = 4000) { $('toast').textContent = text; $('toast').hidden = !text; clearTimeout(toast.t); if (text) toast.t = setTimeout(() => { $('toast').hidden = true; }, ms); }
async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

$('examples').addEventListener('click', e => { const b = e.target.closest('[data-ex]'); if (b) { $('text').value = b.dataset.ex; $('text').focus(); } });
$('ask').addEventListener('submit', e => { e.preventDefault(); build($('text').value.trim()); });
$('again').addEventListener('click', () => { $('build').hidden = true; $('intro').hidden = false; $('text').focus(); });

async function build(text) {
  if (!text || running) return;
  if (!config.qloo) return toast('This server has no Qloo key yet.');
  running = true; render = null; concept = null; taste = null;
  $('intro').hidden = true; $('build').hidden = false;
  $('steps').replaceChildren(); $('r-body').hidden = true; $('hero-img').removeAttribute('src'); $('hero').classList.remove('ready'); $('hero-shimmer').hidden = false;
  $('r-kicker').textContent = 'Reading your taste…'; $('r-name').textContent = 'One moment'; $('r-tag').textContent = text;
  const pending = new Map();
  try {
    const res = await fetch('/api/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'The room could not start.');
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buffer += value;
      let i;
      while ((i = buffer.indexOf('\n\n')) >= 0) {
        const line = buffer.slice(0, i).split('\n').find(l => l.startsWith('data: ')); buffer = buffer.slice(i + 2);
        if (line) handle(JSON.parse(line.slice(6)), pending);
      }
    }
  } catch (error) { toast(error.message); $('r-name').textContent = 'That didn’t work'; $('r-tag').textContent = error.message; }
  finally { running = false; $('hero-shimmer').hidden = true; }
}

function handle(ev, pending) {
  if (ev.type === 'step') { const li = el('li', 'busy'); li.append(el('span', 'dot'), el('span', '', ev.label)); $('steps').append(li); pending.set(ev.id, li); }
  else if (ev.type === 'step_done') { const li = pending.get(ev.id); if (li) { li.className = 'done'; if (ev.summary) li.append(el('small', '', ev.summary)); } }
  else if (ev.type === 'step_error') { const li = pending.get(ev.id); if (li) { li.className = 'err'; li.append(el('small', '', ev.message)); } }
  else if (ev.type === 'final') show(ev);
  else if (ev.type === 'error') { $('r-name').textContent = 'That didn’t work'; $('r-tag').textContent = ev.message; }
}

function show(ev) {
  concept = ev.concept; render = ev.render; taste = ev.taste;
  $('r-kicker').textContent = `${concept.scripted ? 'Scripted · ' : ''}a room for someone who loves ${taste.seeds.map(s => s.name).slice(0, 3).join(', ')}`;
  $('r-name').textContent = concept.name; $('r-tag').textContent = concept.tagline; $('r-brief').textContent = concept.brief;
  const chips = [...new Set(concept.design_choices.flatMap(d => d.signals).filter(s => s.grounded).map(s => s.name))].slice(0, 7);
  $('r-chips').replaceChildren(...chips.map((n, i) => el('span', `chip c${i % 4}`, n)));
  $('r-choices').replaceChildren(...concept.design_choices.map(d => {
    const li = el('li'), c = el('div', 'chips');
    d.signals.forEach((s, i) => c.append(el('span', `chip ${s.grounded ? `c${i % 4}` : 'no'}`, s.grounded ? s.name : `${s.name} · unverified`)));
    li.append(el('b', '', d.element), el('p', '', d.choice), c); return li;
  }));
  if (render?.url) {
    const img = $('hero-img'); img.src = safeUrl(render.url);
    img.decode().catch(() => {}).finally(() => { $('hero').classList.add('ready'); $('hero-shimmer').hidden = true; });
    $('walk').hidden = !(config.liveWorld); $('refine').hidden = false;
  } else { $('hero-shimmer').hidden = true; $('walk').hidden = true; $('refine').hidden = true; }
  playlist();
  charts();
  $('r-body').hidden = false;
}

// The playlist: Qloo's artists for this taste. A click plays that artist through YouTube's search embed.
function playlist() {
  const artists = taste.artist || [];
  $('player').hidden = !artists.length; if (!artists.length) return;
  const first = artists.find(a => a.name === concept.first_track) || artists[0];
  $('tracks').replaceChildren(...artists.slice(0, 8).map(a => {
    const b = el('button', `track${a === first ? ' on' : ''}`, a.name);
    b.title = a.detail || ''; b.addEventListener('click', () => { document.querySelectorAll('.track').forEach(x => x.classList.toggle('on', x === b)); play(a.name); });
    return b;
  }));
  play(first.name);
}
function play(name) {
  const f = el('iframe'); f.src = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(name + ' official')}&autoplay=1`;
  f.allow = 'autoplay; encrypted-media'; f.referrerPolicy = 'strict-origin-when-cross-origin'; f.title = `${name} on YouTube`;
  $('yt').replaceChildren(f);
}

const palette = ['#71f0bd', '#ffe276', '#ff86bb', '#cfe0ff', '#7a5cff'];
function bars(title, items, value, color, note) {
  const rows = (items || []).slice(0, 6).map(x => ({ name: x.name, v: Number(value(x)) || 0 })).filter(x => x.name);
  if (!rows.length) return null;
  const hi = Math.max(...rows.map(r => r.v)), lo = Math.min(...rows.map(r => r.v));
  const box = el('div', 'chart'), h = el('h4', '', title); if (note) h.append(el('small', '', note)); box.append(h);
  rows.forEach(r => { const row = el('div', 'hbar'), track = el('i'), fill = el('b'); fill.style.setProperty('--c', palette[color % palette.length]); fill.dataset.w = `${hi === lo ? 100 : 22 + 78 * (r.v - lo) / (hi - lo)}%`; track.append(fill); row.append(el('span', '', r.name), track); box.append(row); });
  return box;
}
function charts() {
  const v = x => x.affinity ?? x.popularity;
  const list = [
    bars('Rooms you’d love', taste.decor, v, 1, 'decor'), bars('The mood', taste.ambience, v, 2, 'ambience'),
    bars('Brands', taste.brand, v, 0, 'affinity'), bars('On the screen', taste.movie, v, 3, 'affinity'),
    bars('On the shelf', taste.book, v, 4, 'affinity'), bars('Interests', taste.interests, v, 2, 'affinity')
  ].filter(Boolean);
  $('chart-list').replaceChildren(...list); $('r-charts').hidden = !list.length;
  requestAnimationFrame(() => requestAnimationFrame(() => $('chart-list').querySelectorAll('b[data-w]').forEach(b => { b.style.width = b.dataset.w; })));
}

$('walk').addEventListener('click', () => {
  if (!render) return;
  const q = new URLSearchParams({ render: render.id, name: concept.name, tagline: concept.tagline, back: '/room' });
  window.open(`/live?${q}`, '_blank', 'noopener');
});
$('refine').addEventListener('submit', async e => {
  e.preventDefault();
  const instruction = $('refine-input').value.trim(); if (!instruction || !render) return;
  $('hero-shimmer').hidden = false;
  try { const { render: next } = await api('/api/refine', { renderId: render.id, instruction }); render = next; $('hero-img').src = safeUrl(next.url); $('refine-input').value = ''; }
  catch (error) { toast(error.message); }
  finally { $('hero-shimmer').hidden = true; }
});

try { config = await api('/api/config'); } catch { toast('Could not reach the server.'); }
const preset = new URLSearchParams(location.search).get('q');
if (preset) { $('text').value = preset; build(preset); }
