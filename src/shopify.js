// Thin Shopify Admin API client (GraphQL for metaobjects, REST for theme assets).
// Token comes from token-store (OAuth offline token, or SHOPIFY_ADMIN_TOKEN override).
import { getStoredToken, getStoredShop } from './token-store.js';

const VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

function creds() {
  const store = getStoredShop();
  const token = getStoredToken();
  if (!store || !token) {
    const err = new Error('Not connected — open /auth to connect the store (or set SHOPIFY_ADMIN_TOKEN).');
    err.needsAuth = true;
    throw err;
  }
  return { store, token };
}

const headers = (token) => ({
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

// ---- GraphQL ----
export async function graphql(query, variables = {}) {
  const { store, token } = creds();
  const res = await fetch(`https://${store}/admin/api/${VERSION}/graphql.json`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${JSON.stringify(json)}`);
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// ---- REST: themes + assets ----
export async function listThemes() {
  const { store, token } = creds();
  const res = await fetch(`https://${store}/admin/api/${VERSION}/themes.json`, { headers: headers(token) });
  const json = await res.json();
  if (!res.ok) throw new Error(`themes.json HTTP ${res.status}: ${JSON.stringify(json)}`);
  return (json.themes || []).map((t) => ({ id: t.id, name: t.name, role: t.role }));
}

export async function getAsset(themeId, key) {
  const { store, token } = creds();
  const url = `https://${store}/admin/api/${VERSION}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: headers(token) });
  if (res.status === 404) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(`getAsset ${key} HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json.asset ? json.asset.value : null;
}

export async function putAsset(themeId, key, value) {
  const { store, token } = creds();
  const res = await fetch(`https://${store}/admin/api/${VERSION}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ asset: { key, value } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`putAsset ${key} HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json.asset;
}

export function config() {
  return { store: getStoredShop(), version: VERSION, connected: !!getStoredToken() };
}
