const $ = id => document.getElementById(id);
const categoryNames = { movie: 'Movies', artist: 'Artists', videogame: 'Games', tv_show: 'TV shows', book: 'Books', brand: 'Brands', place: 'Places', destination: 'Destinations', podcast: 'Podcasts', person: 'People' };
let apiKey = '', hasServerKey = false, category = 'movie', matches = [], selected = [], busy = false, debug = {};
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; $('message').hidden = !text; }
function setBusy(value) { busy = value; $('resolve').disabled = value; $('recommend').disabled = value || !selected.some(Boolean); document.querySelectorAll('.category, .examples button, .match select, #connection, #location, #interests').forEach(node => node.disabled = value); }
function showDebug() { $('debug').hidden = false; $('raw').textContent = JSON.stringify(debug, null, 2); }
async function request(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, apiKey, host: $('host').value }) });
  const data = await response.json();
  if (!response.ok) { debug.error = data; showDebug(); throw new Error(data.error || 'Request failed.'); }
  return data;
}
function clearResults() { $('results-section').hidden = true; $('empty').hidden = false; $('empty').querySelector('h3').textContent = 'Your next discovery is waiting.'; $('empty').querySelector('p').textContent = 'Review the matches above, choose a category, and explore your connections.'; }
function showMatches() {
  $('matches').replaceChildren(); selected = matches.map(m => m.candidates[0] || null);
  matches.forEach((match, i) => {
    const row = el('div', 'match'), label = el('label', '', match.phrase), select = el('select');
    select.id = `match-${i}`; label.htmlFor = select.id;
    match.candidates.forEach((candidate, index) => { const type = candidate.kind === 'tag' ? 'tag' : (candidate.type || 'entity').split(':').at(-1).replaceAll('_', ' '); const option = el('option', '', `${candidate.name} · ${type}${candidate.detail ? ` · ${candidate.detail}` : ''}`); option.value = index; select.append(option); });
    const skip = el('option', '', match.candidates.length ? 'Skip this interest' : 'No match — try a more specific name'); skip.value = ''; select.append(skip);
    if (!match.candidates.length) select.value = '';
    select.addEventListener('change', () => { selected[i] = select.value === '' ? null : match.candidates[Number(select.value)]; clearResults(); setBusy(false); });
    row.append(label, select); $('matches').append(row);
  });
  $('match-section').hidden = false; $('match-count').textContent = `${matches.filter(m => m.candidates.length).length}/${matches.length} matched`;
}
$('interest-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  if (!apiKey && !hasServerKey) { $('settings').showModal(); $('api-key').focus(); return; }
  setBusy(true); message('Finding your interests in Qloo…');
  matches = []; selected = []; $('match-section').hidden = true; clearResults(); debug = {}; $('debug').hidden = true;
  try { const data = await request('/api/resolve', { text: $('interests').value }); matches = data.matches; debug.lookups = data; showMatches(); showDebug(); message(selected.some(Boolean) ? 'Matches found. Check the selections, then explore connections.' : 'No matches found. Try specific titles, artists, brands, or simpler interests.'); }
  catch (error) { message(error.message, true); }
  finally { setBusy(false); }
});
$('interests').addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); $('interest-form').requestSubmit(); } });
$('interests').addEventListener('input', () => { if (matches.length) { matches = []; selected = []; $('match-section').hidden = true; clearResults(); message('Your interests changed. Find the new matches before exploring.'); setBusy(false); } });
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => { $('interests').value = button.dataset.example; $('interests').dispatchEvent(new Event('input')); $('interests').focus(); }));
for (const [id, name] of Object.entries(categoryNames)) {
  const button = el('button', 'category', name); button.setAttribute('aria-pressed', String(id === category));
  button.addEventListener('click', () => { category = id; document.querySelectorAll('.category').forEach(b => b.setAttribute('aria-pressed', String(b === button))); $('location-label').hidden = !['place', 'destination'].includes(id); $('selected-category').hidden = ['place', 'destination'].includes(id); $('selected-category').textContent = `Discover ${name.toLowerCase()} that connect to your interests.`; if (matches.length) clearResults(); });
  $('categories').append(button);
}
$('location').addEventListener('input', () => { if (matches.length) clearResults(); });
function safeUrl(value) { try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null; } catch { return null; } }
function renderResults(entities) {
  $('results').replaceChildren();
  entities.forEach((entity, index) => {
    const card = el('article', 'result'), properties = entity.properties || {}, imageUrl = safeUrl(properties.image?.url);
    const fallback = () => el('div', 'image-fallback', (entity.name || '?').slice(0, 2).toUpperCase());
    if (imageUrl) { const image = el('img', 'result-image'); image.src = imageUrl; image.alt = entity.name || ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.addEventListener('error', () => image.replaceWith(fallback()), { once: true }); card.append(image); } else card.append(fallback());
    const body = el('div', 'result-body'), meta = el('div', 'result-meta'); meta.append(el('span', '', `${String(index + 1).padStart(2, '0')} / ${categoryNames[category]}`), el('span', '', properties.release_year || ''));
    body.append(meta, el('h3', '', entity.name || 'Untitled'), el('p', '', properties.description || properties.address || entity.disambiguation || 'Open the entity details to inspect Qloo’s metadata.'));
    const details = el('details'); details.append(el('summary', '', 'Entity details'), el('pre', '', JSON.stringify(entity, null, 2))); body.append(details); card.append(body); $('results').append(card);
  });
  $('empty').hidden = true; $('results-section').hidden = false;
  $('results-title').textContent = entities.length ? `Your taste, through ${categoryNames[category].toLowerCase()}.` : 'No connections returned this time.';
  $('result-count').textContent = `${entities.length} results`;
  $('result-context').textContent = entities.length ? `Based on ${selected.filter(Boolean).map(s => s.name).join(', ')}. Ranked by Qloo; raw scores and metadata are available below.` : 'Try another category, adjust the matches, or broaden your location.';
}
$('recommend').addEventListener('click', async () => {
  if (busy) return; setBusy(true); message(`Asking Qloo for ${categoryNames[category].toLowerCase()}…`); clearResults(); delete debug.insights; delete debug.error;
  try { const signals = selected.filter(Boolean); const data = await request('/api/insights', { category, entities: [...new Set(signals.filter(s => s.kind === 'entity').map(s => s.id))], tags: [...new Set(signals.filter(s => s.kind === 'tag').map(s => s.id))], location: $('location').value }); debug.insights = data; showDebug(); renderResults(data.entities); message(''); }
  catch (error) { message(error.message, true); }
  finally { setBusy(false); }
});
$('connection').addEventListener('click', () => $('settings').showModal());
$('close-settings').addEventListener('click', () => $('settings').close());
$('settings-form').addEventListener('submit', event => { event.preventDefault(); apiKey = $('api-key').value.trim(); $('api-key').value = ''; $('connection').firstChild.textContent = apiKey || hasServerKey ? 'Connection set ' : 'Add API key '; $('settings').close(); matches = []; selected = []; $('match-section').hidden = true; setBusy(false); clearResults(); debug = {}; $('debug').hidden = true; message(apiKey || hasServerKey ? 'Connection saved. Find your interests to test it.' : 'Add a key to make a Qloo request.'); });
$('download').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify(debug, null, 2)], { type: 'application/json' })); const link = el('a'); link.href = url; link.download = 'qloo-taste-results.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
try { const config = await fetch('/api/config').then(r => r.json()); hasServerKey = config.hasKey; $('host').value = config.host; if (hasServerKey) { $('connection').firstChild.textContent = 'Server key ready '; $('api-key').disabled = true; $('key-note').textContent = 'Your local server uses QLOO_API_KEY from .env. The key is never returned to the browser.'; } }
catch { message('Could not reach the app. Refresh the page and try again.', true); }
