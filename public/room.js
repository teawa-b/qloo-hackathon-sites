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

// A preset fills the line and builds straight away; typing builds on Enter or the button.
$('examples').addEventListener('click', e => { const b = e.target.closest('[data-ex]'); if (b) { $('text').value = b.dataset.ex; build(b.dataset.ex); } });
$('ask').addEventListener('submit', e => { e.preventDefault(); build($('text').value.trim()); });
$('text').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('ask').requestSubmit(); } });
$('again').addEventListener('click', () => { $('build').hidden = true; $('intro').hidden = false; scrollTo({ top: 0, behavior: 'smooth' }); $('text').focus(); });
$('change').addEventListener('click', () => { $('refine').hidden = !$('refine').hidden; if (!$('refine').hidden) $('refine-input').focus(); });

async function build(text) {
  if (!text || running) return;
  if (!config.qloo) return toast('This server has no Qloo key yet.');
  running = true; render = null; concept = null; taste = null;
  $('intro').hidden = true; $('build').hidden = false; $('build').classList.remove('complete');
  scrollTo({ top: 0 });
  $('steps').replaceChildren(); $('r-body').hidden = true; $('hero-actions').hidden = true; $('refine').hidden = true;
  $('hero-img').removeAttribute('src'); $('hero').classList.remove('ready'); $('hero-shimmer').hidden = false;
  $('r-kicker').textContent = 'Reading your taste'; $('r-name').textContent = text.split(',').slice(0, 3).join(', '); $('r-tag').textContent = '';
  const pending = new Map();
  try {
    const stall = new AbortController();
    let watchdog = setTimeout(() => stall.abort(), 50000);
    const res = await fetch('/api/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: stall.signal });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'The room could not start.');
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      clearTimeout(watchdog); watchdog = setTimeout(() => stall.abort(), 50000);
      buffer += value;
      let i;
      while ((i = buffer.indexOf('\n\n')) >= 0) {
        const line = buffer.slice(0, i).split('\n').find(l => l.startsWith('data: ')); buffer = buffer.slice(i + 2);
        if (line) handle(JSON.parse(line.slice(6)), pending);
      }
    }
    clearTimeout(watchdog);
  } catch (error) { failed(error.name === 'AbortError' ? 'The server stopped responding. Try again.' : error.message); }
  finally { running = false; if (!concept) { $('hero-shimmer').hidden = true; if ($('r-kicker').textContent !== 'Something went wrong') failed('The room stopped before it was finished. Try again.'); } }
}
function failed(message) {
  $('r-kicker').textContent = 'Something went wrong'; $('r-name').textContent = 'That didn’t work'; $('r-tag').textContent = message;
  $('hero-shimmer').hidden = true;
  const again = el('button', 'btn ghost', 'Try another taste'); again.addEventListener('click', () => $('again').click());
  $('hero-actions').replaceChildren(again); $('hero-actions').hidden = false;
}

function handle(ev, pending) {
  if (ev.type === 'step') { const li = el('li', 'busy'); li.append(el('span', 'dot'), el('span', '', ev.label)); $('steps').append(li); pending.set(ev.id, li); $('r-kicker').textContent = ev.label; }
  else if (ev.type === 'step_done') { const li = pending.get(ev.id); if (li) { li.className = 'done'; if (ev.summary) li.append(el('small', '', ev.summary)); } }
  else if (ev.type === 'step_error') { const li = pending.get(ev.id); if (li) { li.className = 'err'; li.append(el('small', '', ev.message)); } }
  else if (ev.type === 'final') show(ev);
  else if (ev.type === 'error') failed(ev.message);
}

function tags(list) {
  return list.map(s => el('span', `tag${s.grounded === false ? ' no' : ''}`, s.grounded === false ? `${s.name} · unverified` : s.name));
}

function show(ev) {
  concept = ev.concept; render = ev.render; taste = ev.taste;
  const seeds = taste.seeds.map(s => s.name);
  $('r-kicker').textContent = `${concept.scripted ? 'Scripted · ' : ''}A room for someone who loves ${seeds.slice(0, 3).join(', ')}${seeds.length > 3 ? '…' : ''}`;
  $('r-name').textContent = concept.name; $('r-tag').textContent = concept.tagline; $('r-brief').textContent = concept.brief;
  const cited = [...new Set(concept.design_choices.flatMap(d => d.signals).filter(s => s.grounded).map(s => s.name))].slice(0, 8);
  $('r-chips').replaceChildren(...tags(cited.map(name => ({ name }))));
  $('r-choices').replaceChildren(...concept.design_choices.map(d => {
    const li = el('li'), t = el('div', 'tags');
    t.append(...tags(d.signals));
    li.append(el('b', '', d.element), el('p', '', d.choice), t); return li;
  }));
  const actions = [];
  if (render?.url) {
    const img = $('hero-img'); img.src = safeUrl(render.url);
    img.decode().catch(() => {}).finally(() => { $('hero').classList.add('ready'); $('hero-shimmer').hidden = true; });
    if (config.liveWorld) actions.push($('walk'));
    actions.push($('change'));
    $('walk').hidden = !config.liveWorld;
  } else {
    $('hero-shimmer').hidden = true;
    $('hero').classList.add('ready');
  }
  $('hero-actions').replaceChildren(...actions); $('hero-actions').hidden = !actions.length;
  playlist();
  charts();
  $('build').classList.add('complete');
  $('r-body').hidden = false;
}

// The playlist: Qloo's artists for this taste, played through YouTube.
function playlist() {
  const artists = taste.artist || [];
  $('player').hidden = !artists.length; if (!artists.length) return;
  const first = artists.find(a => a.name === concept.first_track) || artists[0];
  $('tracks').replaceChildren(...artists.slice(0, 8).map(a => {
    const li = el('li'), b = el('button', `track${a === first ? ' on' : ''}`, a.name);
    b.title = a.detail || ''; b.addEventListener('click', () => { document.querySelectorAll('.track').forEach(x => x.classList.toggle('on', x === b)); play(a.name); });
    li.append(b); return li;
  }));
  play(first.name);
}
async function play(name) {
  $('yt').replaceChildren(el('p', 'yt-status', `Finding ${name}…`));
  try {
    const { id } = await api(`/api/yt?q=${encodeURIComponent(`${name} official audio`)}`);
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('Bad video id.');
    const f = el('iframe'); f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
    f.allow = 'autoplay; encrypted-media; picture-in-picture'; f.referrerPolicy = 'strict-origin-when-cross-origin'; f.title = `${name} on YouTube`;
    $('yt').replaceChildren(f);
  } catch (error) { $('yt').replaceChildren(el('p', 'yt-status', `Couldn't load ${name}. ${error.message}`)); }
}

const palette = ['#e8a548', '#9db394', '#d99a8f', '#c86b4b', '#f4c27a'];
function bars(title, items, value, color, note) {
  const rows = (items || []).slice(0, 5).map(x => ({ name: x.name, v: Number(value(x)) || 0 })).filter(x => x.name);
  if (!rows.length) return null;
  const hi = Math.max(...rows.map(r => r.v)), lo = Math.min(...rows.map(r => r.v));
  const box = el('div', 'chart'), h = el('h4', '', title); if (note) h.append(el('small', '', note)); box.append(h);
  rows.forEach(r => { const row = el('div', 'hbar'), track = el('i'), fill = el('b'); fill.style.setProperty('--c', palette[color % palette.length]); fill.dataset.w = `${hi === lo ? 100 : 22 + 78 * (r.v - lo) / (hi - lo)}%`; track.append(fill); row.append(el('span', '', r.name), track); row.title = `${r.name}: ${r.v}`; box.append(row); });
  return box;
}
function charts() {
  const v = x => x.affinity ?? x.popularity;
  const list = [
    bars('Rooms you’d love', taste.decor, v, 0, 'decor'), bars('The mood', taste.ambience, v, 1, 'ambience'),
    bars('On the shelf', taste.book, v, 2), bars('On the screen', taste.movie, v, 3),
    bars('Brands', taste.brand, v, 4)
  ].filter(Boolean);
  $('chart-list').replaceChildren(...list); $('r-charts').hidden = !list.length;
  setTimeout(() => $('chart-list').querySelectorAll('b[data-w]').forEach(b => { b.style.width = b.dataset.w; }), 60);
}

$('walk').addEventListener('click', () => {
  if (!render) return;
  const q = new URLSearchParams({ render: render.id, name: concept.name, tagline: concept.tagline });
  window.open(`/live?${q}`, '_blank', 'noopener');
});
$('refine').addEventListener('submit', async e => {
  e.preventDefault();
  const instruction = $('refine-input').value.trim(); if (!instruction || !render) return;
  const button = $('refine').querySelector('button'); button.disabled = true; button.textContent = 'Repainting…';
  $('hero').classList.remove('ready'); $('hero-shimmer').hidden = false;
  try {
    const { render: next } = await api('/api/refine', { renderId: render.id, instruction });
    render = next; const img = $('hero-img'); img.src = safeUrl(next.url);
    await img.decode().catch(() => {});
    $('refine-input').value = '';
  } catch (error) { toast(error.message); }
  finally { $('hero').classList.add('ready'); $('hero-shimmer').hidden = true; button.disabled = false; button.textContent = 'Repaint'; }
});

try { config = await api('/api/config'); } catch { toast('Could not reach the server.'); }
const preset = new URLSearchParams(location.search).get('q');
if (preset) { $('text').value = preset; build(preset); }
