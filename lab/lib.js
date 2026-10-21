export const hosts = ['https://hackathon.api.qloo.com', 'https://api.qloo.com', 'https://staging.api.qloo.com'];
export const categories = ['movie', 'artist', 'videogame', 'tv_show', 'book', 'brand', 'place', 'destination', 'podcast', 'person'];

// A transparent convenience parser, not an LLM. Quoted titles preserve commas and "and".
export function parseInterests(text) {
  if (typeof text !== 'string' || text.length > 3000) throw new Error('Use a sentence of up to 3,000 characters.');
  const quoted = [];
  const protectedText = text.replace(/["“]([^"”]+)["”]/g, (_, title) => { quoted.push(title); return `__TITLE${quoted.length - 1}__`; });
  const phrases = protectedText.split(/[,;\n]+|\s+(?:and|also|plus|as well as)\s+|[.!?](?:\s+|$)/i).map(part => part
    .replace(/^\s*(?:(?:oh|well|maybe)[,\s]+)?(?:(?:i(?:'m| am)\s+(?:really\s+)?(?:into|a fan of))|(?:i\s+(?:really\s+)?(?:like|love|enjoy|have an interest in|have this interest in|listen to|watch|play))|(?:my interests (?:are|include)))\s+/i, '')
    .replace(/__TITLE(\d+)__/g, (_, i) => quoted[Number(i)])
    .trim().replace(/^["'“”]+|["'“”]+$/g, '').trim()).filter(Boolean);
  const unique = [...new Set(phrases)];
  if (!unique.length) throw new Error('Tell us at least one thing you like.');
  if (unique.length > 12) throw new Error('Try up to 12 interests at a time.');
  return unique;
}

export function entityList(data) {
  if (Array.isArray(data.results)) return data.results;
  return data.results?.entities ?? data.entities ?? [];
}

export function insightParams(body) {
  if (!categories.includes(body.category)) throw new Error('Choose a supported recommendation category.');
  const entities = body.entities ?? [], tags = body.tags ?? [];
  if (!Array.isArray(entities) || !Array.isArray(tags) || entities.length + tags.length > 24 || !entities.length && !tags.length) throw new Error('Select at least one matched interest.');
  if (entities.some(id => typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) || tags.some(id => typeof id !== 'string' || !/^urn:tag:[a-zA-Z0-9_:.-]+$/.test(id))) throw new Error('Invalid Qloo interest ID.');
  const params = { 'filter.type': `urn:entity:${body.category}`, take: '12' };
  if (entities.length) { params['signal.interests.entities'] = entities.join(','); params['filter.exclude.entities'] = entities.join(','); }
  if (tags.length) params['signal.interests.tags'] = tags.join(',');
  if (body.location && ['place', 'destination'].includes(body.category)) {
    if (typeof body.location !== 'string' || body.location.length > 200) throw new Error('Use a location of up to 200 characters.');
    params['filter.location.query'] = body.location.trim();
  }
  return params;
}
