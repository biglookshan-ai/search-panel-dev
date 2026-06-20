// Where the OAuth offline access token lives.
// - If SHOPIFY_ADMIN_TOKEN is set, that fixed token wins (skip OAuth entirely).
// - Otherwise the token obtained via OAuth is cached in memory + persisted to a
//   file. On Railway, mount a Volume and set DATA_DIR=/data so it survives
//   redeploys (offline tokens don't expire, so you only auth once).
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.env.DATA_DIR || path.join(process.cwd(), '.data');
const FILE = path.join(DIR, 'token.json');
let cache = null;

export function getStoredToken() {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN;
  if (cache) return cache.accessToken;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return cache.accessToken;
  } catch {
    return null;
  }
}

export function getStoredShop() {
  if (cache?.shop) return cache.shop;
  return process.env.SHOPIFY_STORE || null;
}

export function saveToken(accessToken, shop) {
  cache = { accessToken, shop, savedAt: new Date().toISOString() };
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cache));
  } catch (e) {
    console.error('token persist failed (set DATA_DIR to a Railway volume):', e.message);
  }
}

export function hasToken() {
  return !!getStoredToken();
}
