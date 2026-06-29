import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listThemes } from './shopify.js';
import { getAllDefinitions, getGrantedScopes, probeType, listEntries, createEntry, updateEntry, deleteEntry, kindFromType, inferFields } from './metaobjects.js';
import { applyToTheme } from './theme-apply.js';
import { requireSession } from './auth-embedded.js';
import { clearToken } from './token-store.js';
import { getProductTags, searchProducts, searchCollections, resolveNodes } from './catalog.js';
import { initDb, insertEvent, rollupAndPrune, summary, events, resetEvents } from './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- tiny .env loader (Railway injects vars directly; this is for local dev) ---
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const API_KEY = process.env.SHOPIFY_API_KEY || '';
const app = express();
app.use(express.json({ limit: '2mb' }));

// Allow the app to be framed by Shopify admin (required for embedded apps).
app.use((req, res, next) => {
  const shop = (req.query.shop || '').toString();
  const frame = shop ? `https://${shop} https://admin.shopify.com` : 'https://*.myshopify.com https://admin.shopify.com';
  res.setHeader('Content-Security-Policy', `frame-ancestors ${frame};`);
  next();
});

// Serve the embedded UI with the API key injected (App Bridge needs it).
const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
function sendIndex(req, res) {
  res.set('Content-Type', 'text/html').send(indexHtml.replaceAll('%%API_KEY%%', API_KEY));
}
app.get('/', sendIndex);
app.get('/index.html', sendIndex);
app.use(express.static(path.join(ROOT, 'public')));

// Public config (no token needed) — lets the UI render before it has a session.
app.get('/api/config', (req, res) => res.json({ apiKey: API_KEY, version: process.env.SHOPIFY_API_VERSION || '2026-04' }));

// ---- Public analytics ingest (storefront → here). Anonymous, no PII. ----
// The storefront posts cross-origin, so reflect CORS for the shop's domains only.
const ALLOWED_ORIGIN = /(?:\.myshopify\.com|cinegearpro\.co\.uk)$/i;
function corsForCollect(req, res) {
  const origin = req.headers.origin || '';
  try {
    if (ALLOWED_ORIGIN.test(new URL(origin).host)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
      return true;
    }
  } catch (e) {}
  return false;
}
// Tiny in-memory rate limit (per IP; IP is used transiently here, never stored).
const rl = new Map();
function rateOk(ip) {
  const now = Date.now();
  let e = rl.get(ip);
  if (!e || now > e.reset) { e = { n: 0, reset: now + 60000 }; rl.set(ip, e); }
  return ++e.n <= 120;
}
app.options('/collect', (req, res) => { corsForCollect(req, res); res.status(204).end(); });
app.post('/collect', (req, res) => {
  if (!corsForCollect(req, res)) return res.status(403).end();
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  if (!rateOk(ip)) return res.status(429).end();
  const b = req.body || {};
  if (!['search', 'product_click', 'collection_click'].includes(b.type)) return res.status(400).end();
  const DEV = ['mobile', 'tablet', 'desktop'];
  const SRC = ['drawer', 'results', 'recommendation'];
  const ev = {
    type: b.type,
    query: typeof b.query === 'string' ? b.query.slice(0, 120) : null,
    result_count: Number.isFinite(b.resultCount) ? Math.max(0, Math.min(100000, b.resultCount | 0)) : null,
    target_type: b.type === 'product_click' ? 'product' : (b.type === 'collection_click' ? 'collection' : null),
    target_id: typeof b.targetId === 'string' ? b.targetId.slice(0, 80) : null,
    session: typeof b.session === 'string' ? b.session.slice(0, 64) : null,
    source: SRC.includes(b.source) ? b.source : null,
    device: DEV.includes(b.device) ? b.device : null,
    submitted: typeof b.submitted === 'boolean' ? b.submitted : null,
  };
  res.status(204).end();            // respond fast; persist async
  insertEvent(ev).catch((e) => console.error('[analytics] insert failed:', e.message));
});

// Everything below requires a valid App Bridge session token.
const api = express.Router();
api.use(requireSession());

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) { console.error(e); res.status(500).json({ error: String(e.message || e) }); }
};

const TYPES = ['cgp_badge', 'cgp_status_badge', 'cgp_sort_rule', 'search_panel'];
const okType = (t) => TYPES.includes(t);

api.get('/metaobjects/:type', wrap(async (req) => {
  if (!okType(req.params.type)) throw new Error('Unknown type');
  // Entries are readable with read_metaobjects even when the DEFINITION isn't
  // visible (external apps can't list non-owned definitions). So drive the UI
  // off the entries: use the definition's fields if we can see it, else infer.
  const entries = await listEntries(req.ctx, req.params.type);
  const defs = await getAllDefinitions(req.ctx).catch(() => []);
  const def = defs.find((d) => d.type === req.params.type) || null;
  const fields = def
    ? def.fieldDefinitions.map((fd) => ({ key: fd.key, name: fd.name, kind: kindFromType(fd.type?.name) }))
    : inferFields(entries);
  return { entries, fields, fromDefinition: !!def };
}));
api.post('/metaobjects/:type', wrap(async (req) => {
  if (!okType(req.params.type)) throw new Error('Unknown type');
  return createEntry(req.ctx, req.params.type, req.body.fields || {});
}));
api.put('/metaobjects/:type', wrap(async (req) => {
  if (!req.body.id) throw new Error('Missing id');
  return updateEntry(req.ctx, req.body.id, req.body.fields || {});
}));
api.delete('/metaobjects/:type', wrap(async (req) => {
  if (!req.body.id) throw new Error('Missing id');
  return { deletedId: await deleteEntry(req.ctx, req.body.id) };
}));
api.get('/diag', wrap(async (req) => {
  const [scopes, defs, ...probes] = await Promise.all([
    getGrantedScopes(req.ctx).catch((e) => ['<error: ' + e.message + '>']),
    getAllDefinitions(req.ctx).catch(() => []),
    probeType(req.ctx, 'cgp_badge'),
    probeType(req.ctx, 'cgp_sort_rule'),
    probeType(req.ctx, 'search_panel'),
  ]);
  return { shop: req.ctx.shop, scopes, definitionTypes: defs.map((d) => d.type), probes };
}));

api.post('/reconnect', wrap(async (req) => {
  clearToken(req.ctx.shop);
  return { ok: true };
}));

api.get('/product-tags', wrap(async (req) => ({ tags: await getProductTags(req.ctx) })));
api.get('/products/search', wrap(async (req) => ({ items: await searchProducts(req.ctx, req.query.q) })));
api.get('/collections/search', wrap(async (req) => ({ items: await searchCollections(req.ctx, req.query.q) })));
api.post('/nodes', wrap(async (req) => ({ items: await resolveNodes(req.ctx, req.body.ids || []) })));

// Resolve product/collection titles for rows carrying target_type + target_id.
async function resolveTitles(ctx, rows) {
  const gid = (r) => String(r.target_id).startsWith('gid://') ? r.target_id
    : 'gid://shopify/' + (r.target_type === 'collection' ? 'Collection' : 'Product') + '/' + r.target_id;
  const need = (rows || []).filter((r) => r.target_id && (r.target_type === 'product' || r.target_type === 'collection'));
  if (!need.length) return rows;
  try {
    const nodes = await resolveNodes(ctx, [...new Set(need.map(gid))]);
    const by = {}; (nodes || []).forEach((n) => { by[n.id] = n; });
    rows.forEach((r) => { if (r.target_id) { const n = by[gid(r)] || {}; r.title = n.title || r.target_id; r.image = n.image || ''; } });
  } catch (e) { /* keep raw ids if resolution fails */ }
  return rows;
}
api.get('/insights/summary', wrap(async (req) => {
  const s = await summary({ days: +req.query.days || 7 });
  if (s.enabled) await resolveTitles(req.ctx, s.clicks);
  return s;
}));
api.post('/insights/reset', wrap(async () => resetEvents()));
api.get('/insights/events', wrap(async (req) => {
  const e = await events({ days: +req.query.days || 7, kind: req.query.kind, page: +req.query.page || 1, size: +req.query.size || 50, q: req.query.q || '', source: req.query.source || '', type: req.query.type || '', result: req.query.result || '', sort: req.query.sort || '' });
  if (e.enabled && req.query.kind === 'clicks') await resolveTitles(req.ctx, e.rows);
  return e;
}));

api.get('/themes', wrap(async (req) => ({ themes: await listThemes(req.ctx) })));
api.post('/themes/:id/apply', wrap(async (req) => applyToTheme(req.ctx, req.params.id, { dryRun: !!req.body.dryRun })));

app.use('/api', api);

// SPA fallback: App Bridge <ui-nav-menu> links (/featured, /sort, /promo, …)
// navigate the embedded iframe to those paths — serve the same UI for any
// non-/api, non-asset GET so the front-end can route to the right section.
app.get(/^\/(?!api(?:\/|$)).*/, sendIndex);

// Analytics DB: connect, do a first rollup, then roll up + prune nightly.
initDb().then(() => {
  rollupAndPrune().catch(() => {});
  setInterval(() => rollupAndPrune().catch(() => {}), 24 * 60 * 60 * 1000);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`search-panel admin (embedded) on :${PORT}`));
