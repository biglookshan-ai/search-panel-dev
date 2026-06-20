import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listThemes } from './shopify.js';
import { getAllDefinitions, getGrantedScopes, probeType, listEntries, createEntry, updateEntry, deleteEntry, kindFromType, inferFields } from './metaobjects.js';
import { applyToTheme } from './theme-apply.js';
import { requireSession } from './auth-embedded.js';
import { clearToken } from './token-store.js';

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

// Everything below requires a valid App Bridge session token.
const api = express.Router();
api.use(requireSession());

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) { console.error(e); res.status(500).json({ error: String(e.message || e) }); }
};

const TYPES = ['cgp_badge', 'cgp_sort_rule', 'search_panel'];
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

api.get('/themes', wrap(async (req) => ({ themes: await listThemes(req.ctx) })));
api.post('/themes/:id/apply', wrap(async (req) => applyToTheme(req.ctx, req.params.id, { dryRun: !!req.body.dryRun })));

app.use('/api', api);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`search-panel admin (embedded) on :${PORT}`));
