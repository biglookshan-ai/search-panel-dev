import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as shopifyConfig, listThemes } from './shopify.js';
import { getDefinition, listEntries, createEntry, updateEntry, deleteEntry } from './metaobjects.js';
import { applyToTheme } from './theme-apply.js';
import { authStart, authCallback, oauthConfigured } from './oauth.js';

// --- tiny .env loader (Railway injects vars directly; this is for local dev) ---
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const app = express();
app.use(express.json({ limit: '2mb' }));

// OAuth routes — must be reachable WITHOUT the password gate (Shopify calls back).
app.get('/auth', authStart);
app.get('/auth/callback', authCallback);

// --- optional password gate (HTTP Basic) for everything else ---
const PW = process.env.ADMIN_UI_PASSWORD;
if (PW) {
  app.use((req, res, next) => {
    if (req.path.startsWith('/auth')) return next();
    const h = req.headers.authorization || '';
    const got = h.startsWith('Basic ') ? Buffer.from(h.slice(6), 'base64').toString().split(':')[1] : '';
    if (got === PW) return next();
    res.set('WWW-Authenticate', 'Basic realm="search-panel"').status(401).send('Auth required');
  });
}

app.use(express.static(path.join(ROOT, 'public')));

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) {
    if (e.needsAuth) return res.status(401).json({ error: e.message, needsAuth: true });
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
};

const TYPES = ['cgp_badge', 'cgp_sort_rule', 'search_panel'];
const okType = (t) => TYPES.includes(t);

app.get('/api/config', wrap(async () => ({ ...shopifyConfig(), oauthConfigured: oauthConfigured() })));

app.get('/api/metaobjects/:type', wrap(async (req) => {
  if (!okType(req.params.type)) throw new Error('Unknown type');
  const [definition, entries] = await Promise.all([
    getDefinition(req.params.type),
    listEntries(req.params.type),
  ]);
  return { definition, entries };
}));

app.post('/api/metaobjects/:type', wrap(async (req) => {
  if (!okType(req.params.type)) throw new Error('Unknown type');
  return createEntry(req.params.type, req.body.fields || {});
}));

app.put('/api/metaobjects/:type', wrap(async (req) => {
  if (!req.body.id) throw new Error('Missing id');
  return updateEntry(req.body.id, req.body.fields || {});
}));

app.delete('/api/metaobjects/:type', wrap(async (req) => {
  if (!req.body.id) throw new Error('Missing id');
  return { deletedId: await deleteEntry(req.body.id) };
}));

app.get('/api/themes', wrap(async () => ({ themes: await listThemes() })));

app.post('/api/themes/:id/apply', wrap(async (req) =>
  applyToTheme(req.params.id, { dryRun: !!req.body.dryRun })
));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`search-panel admin on :${PORT}`));
