// One Durable Object per page: strongly consistent text + version + limit.
const MAX_LIMIT = 100000;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const len = s => [...s].length;
const validLimit = n => Number.isInteger(n) && n >= 1 && n <= MAX_LIMIT;
const sha256 = async s => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
};
const randomId = bytes => {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean); // ['api','pages',id?,'limit'?]
    if (parts[0] !== 'api' || parts[1] !== 'pages') return json({ error: 'not found' }, 404);

    if (parts.length === 2 && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (!validLimit(body.limit)) return json({ error: `limit must be 1-${MAX_LIMIT}` }, 400);
      const id = randomId(12), key = randomId(16);
      const stub = env.PAGES.get(env.PAGES.idFromName(id));
      await stub.fetch('https://do/init', { method: 'POST', body: JSON.stringify({ limit: body.limit, keyHash: await sha256(key) }) });
      return json({ id, key, limit: body.limit });
    }

    const id = parts[2];
    if (!id || !/^[A-Za-z0-9_-]{16}$/.test(id)) return json({ error: 'not found' }, 404);
    const stub = env.PAGES.get(env.PAGES.idFromName(id));
    const body = req.method === 'PUT' ? await req.json().catch(() => null) : null;
    if (req.method === 'PUT' && !body) return json({ error: 'bad json' }, 400);
    if (parts[3] === 'limit' && body?.key) body.keyHash = await sha256(String(body.key));
    const res = await stub.fetch('https://do/' + (parts[3] || ''), { method: req.method, body: body && JSON.stringify(body) });
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json', ...CORS } });
  },
};

export class Page {
  constructor(ctx) { this.ctx = ctx; }

  async fetch(req) {
    const s = this.ctx.storage;
    const path = new URL(req.url).pathname;
    let m = await s.get('m');

    if (path === '/init') {
      if (m) return json({ error: 'exists' }, 409);
      const { limit, keyHash } = await req.json();
      await s.put('m', { text: '', limit, keyHash, version: 0 });
      return json({ ok: true });
    }
    if (!m) return json({ error: 'not found' }, 404);
    const view = () => ({ text: m.text, limit: m.limit, version: m.version });

    if (req.method === 'GET') return json(view());

    const body = await req.json();
    if (path === '/limit') {
      if (body.keyHash !== m.keyHash) return json({ error: 'wrong admin key' }, 403);
      if (!validLimit(body.limit)) return json({ error: `limit must be 1-${MAX_LIMIT}` }, 400);
      if (len(m.text) > body.limit) return json({ error: `text is already ${len(m.text)} characters; shorten it first` }, 400);
      m.limit = body.limit; m.version++;
      await s.put('m', m);
      return json(view());
    }

    // text save: optimistic concurrency on version
    if (typeof body.text !== 'string') return json({ error: 'text required' }, 400);
    if (len(body.text) > m.limit) return json({ error: `over the ${m.limit} character limit`, ...view() }, 413);
    if (body.baseVersion !== m.version) return json({ error: 'conflict', ...view() }, 409);
    m.text = body.text; m.version++;
    await s.put('m', m);
    return json(view());
  }
}
