const $ = id => document.getElementById(id);
// Model-written text never shows an em or en dash used as punctuation (house style); a comma reads the same.
const tidy = v => typeof v === 'string' ? v.replace(/(\d)\s*–\s*(\d)/g, '$1-$2').replace(/\s*[—–]\s*/g, ', ') : v;
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = tidy(text); return n; };
const safeUrl = v => { try { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
let running = false;

function toast(text, ms = 4000) { $('toast').textContent = text; $('toast').hidden = !text; clearTimeout(toast.t); if (text) toast.t = setTimeout(() => { $('toast').hidden = true; }, ms); }

// A judge button opens that judge's recorded brief instantly (for the sample startup); the form runs live.
const sample = { startup: 'A live-events app that turns a concert ticket into a night out: pre-show bars, merch and rides, picked for each fanbase', comps: 'Ticketmaster, Spotify, Uber' };
document.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
  $('investor').value = b.dataset.i; $('firm').value = b.dataset.f;
  $('startup').value = sample.startup; $('comps').value = sample.comps;
  run(b.dataset.i.toLowerCase().split(' ').pop());
}));
$('ask').addEventListener('submit', e => { e.preventDefault(); run(); });
$('again').addEventListener('click', () => { $('out').hidden = true; $('intro').hidden = false; scrollTo({ top: 0 }); });

async function run(demo = null) {
  if (running) return;
  running = true;
  const body = { investor: $('investor').value.trim(), firm: $('firm').value.trim(), startup: $('startup').value.trim(), comps: $('comps').value, ...(demo ? { demo } : {}) };
  $('demo-note').hidden = !demo;
  $('intro').hidden = true; $('out').hidden = false; $('o-body').hidden = true; $('o-fit').hidden = true; $('steps').replaceChildren();
  $('o-kicker').textContent = 'Researching…'; $('o-name').textContent = body.investor; $('o-role').textContent = body.firm;
  const pending = new Map();
  try {
    const stall = new AbortController(); let watchdog = setTimeout(() => stall.abort(), 90000);
    const res = await fetch('/api/pitch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: stall.signal });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'The brief could not start.');
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      clearTimeout(watchdog); watchdog = setTimeout(() => stall.abort(), 90000);
      buffer += value; let i;
      while ((i = buffer.indexOf('\n\n')) >= 0) {
        const line = buffer.slice(0, i).split('\n').find(l => l.startsWith('data: ')); buffer = buffer.slice(i + 2);
        if (line) handle(JSON.parse(line.slice(6)), pending);
      }
    }
    clearTimeout(watchdog);
  } catch (error) { const m = error.name === 'AbortError' ? 'The server stopped responding. Try again.' : error.message; toast(m); $('o-kicker').textContent = 'That didn’t work'; $('o-role').textContent = m; }
  finally { running = false; }
}

function handle(ev, pending) {
  if (ev.type === 'step') { const li = el('li', 'busy'); li.append(el('span', 'dot'), el('span', '', ev.label)); $('steps').append(li); pending.set(ev.id, li); }
  else if (ev.type === 'step_done') { const li = pending.get(ev.id); if (li) { li.className = 'done'; if (ev.summary) li.append(el('small', '', ev.summary)); } }
  else if (ev.type === 'step_error') { const li = pending.get(ev.id); if (li) { li.className = 'err'; li.append(el('small', '', ev.message)); } }
  else if (ev.type === 'error') { $('o-kicker').textContent = 'That didn’t work'; $('o-role').textContent = ev.message; }
  else if (ev.type === 'final') show(ev);
}

function show({ dossier, resolved, fit, rapport, brief }) {
  $('o-kicker').textContent = `Pitch brief · ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  $('o-name').textContent = dossier.name || $('investor').value;
  $('o-role').textContent = [dossier.role, dossier.firm].filter(Boolean).join(', ');
  if (fit?.score != null) { $('o-fit').hidden = false; $('o-fit').style.setProperty('--p', `${fit.score}%`); $('o-fit').querySelector('b').textContent = fit.score; }
  $('o-headline').textContent = tidy(brief?.headline || '');
  $('o-thesis').textContent = tidy(dossier.thesis || 'No public thesis found.');
  const facts = [['Stages', dossier.stages], ['Cheque', dossier.cheque], ['Recent', (dossier.recent || []).join(' · ')]].filter(([, v]) => v);
  $('o-facts').replaceChildren(...facts.flatMap(([k, v]) => [el('dt', '', k), el('dd', '', v)]));
  $('o-looks').replaceChildren(...(dossier.looks_for || []).map((t, i) => el('span', `chip c${i % 4}`, t)));
  // Portfolio bars: how much your customers like each of their companies, per Qloo.
  const ranked = fit?.ranked || [];
  const box = $('o-portfolio'); box.replaceChildren();
  if (ranked.length) {
    const hi = Math.max(...ranked.map(r => r.affinity || 0)), lo = Math.min(...ranked.map(r => r.affinity || 0));
    ranked.slice(0, 8).forEach((r, i) => { const row = el('div', 'hbar'), track = el('i'), fill = el('b'); fill.style.setProperty('--c', ['#0052ff', '#18b47b', '#ff5fa2', '#f5b700'][i % 4]); fill.dataset.w = `${hi === lo ? 100 : 22 + 78 * ((r.affinity || 0) - lo) / (hi - lo)}%`; track.append(fill); row.append(el('span', '', r.name), track); row.title = `${r.name}: ${r.affinity}`; box.append(row); });
    requestAnimationFrame(() => requestAnimationFrame(() => box.querySelectorAll('b[data-w]').forEach(b => { b.style.width = b.dataset.w; })));
  } else box.append(el('p', 'doc-small', 'None of their portfolio companies are in Qloo yet.'));
  const unresolved = (dossier.portfolio || []).filter(n => !(resolved?.portfolio || []).some(p => p.name.toLowerCase().includes(n.toLowerCase().split(' ')[0])));
  $('o-fit-note').textContent = fit?.score != null ? `Fit ${fit.score}/100 = half your customers' mean affinity for their portfolio (${fit.mean}), half how alike the two crowds' ages are (${fit.ageMatch}). Your crowd skews ${fit.yourCrowd}; theirs ${fit.theirCrowd}. Compared via ${resolved.comps.map(c => c.name).join(', ')}.${unresolved.length ? ` Not in Qloo: ${unresolved.slice(0, 5).join(', ')}.` : ''}` : '';
  $('o-angle').textContent = tidy(brief?.angle || '');
  $('o-drops').replaceChildren(...(brief?.name_drop || []).map(d => { const c = el('div', `drop-card${d.grounded ? '' : ' unverified'}`); c.append(el('b', '', d.company), el('p', '', d.line)); if (!d.grounded) c.append(el('span', 'chip no', 'not from Qloo')); return c; }));
  $('o-deck').replaceChildren(...(brief?.deck || []).map(t => el('li', '', t)));
  $('o-openers').replaceChildren(...(brief?.openers || []).map(o => { const c = el('div', 'opener'); c.append(el('p', '', `“${o.line}”`), el('span', `chip ${o.grounded ? 'c3' : 'no'}`, o.grounded ? o.based_on : `${o.based_on} · unverified`)); return c; }));
  const interests = resolved?.interests || [];
  if (interests.length) $('o-openers').append(el('p', 'doc-small', `Their public interests in Qloo: ${interests.map(i => `${i.name} (${i.why})`).join(', ')}.`));
  $('o-questions').replaceChildren(...(brief?.questions || []).map(t => el('li', '', t)));
  $('o-avoid').replaceChildren(...(brief?.avoid || []).map(t => el('li', '', t)));
  $('o-sources').replaceChildren(...(dossier.sources || []).map(s => { const li = el('li'), a = el('a', '', s.title); a.href = safeUrl(s.url); a.target = '_blank'; a.rel = 'noreferrer'; li.append(a, el('small', '', new URL(s.url).hostname)); return li; }));
  if (!(dossier.sources || []).length) $('o-sources').append(el('li', '', 'The research step returned no citations; treat the dossier as unverified.'));
  $('o-body').hidden = false;
}

const preset = new URLSearchParams(location.search);
if (preset.get('investor')) { $('investor').value = preset.get('investor'); $('firm').value = preset.get('firm') || ''; $('startup').value = preset.get('startup') || ''; $('comps').value = preset.get('comps') || ''; if ($('startup').value && $('comps').value) run(); }
