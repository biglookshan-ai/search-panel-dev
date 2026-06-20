// Thin Shopify Admin API client (GraphQL for metaobjects, REST for theme assets).
// Reads credentials from env. No third-party deps.

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

function assertEnv() {
  if (!STORE || !TOKEN) {
    throw new Error('Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN env vars.');
  }
}

const base = () => `https://${STORE}/admin/api/${VERSION}`;
const headers = () => ({
  'X-Shopify-Access-Token': TOKEN,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

// ---- GraphQL ----
export async function graphql(query, variables = {}) {
  assertEnv();
  const res = await fetch(`${base()}/graphql.json`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${JSON.stringify(json)}`);
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// ---- REST: themes + assets ----
export async function listThemes() {
  assertEnv();
  const res = await fetch(`${base()}/themes.json`, { headers: headers() });
  const json = await res.json();
  if (!res.ok) throw new Error(`themes.json HTTP ${res.status}: ${JSON.stringify(json)}`);
  return (json.themes || []).map((t) => ({ id: t.id, name: t.name, role: t.role }));
}

// Returns the asset's value (string) or null if it doesn't exist (404).
export async function getAsset(themeId, key) {
  assertEnv();
  const url = `${base()}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: headers() });
  if (res.status === 404) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(`getAsset ${key} HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json.asset ? json.asset.value : null;
}

export async function putAsset(themeId, key, value) {
  assertEnv();
  const res = await fetch(`${base()}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ asset: { key, value } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`putAsset ${key} HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json.asset;
}

export function config() {
  return { store: STORE, version: VERSION, hasToken: !!TOKEN };
}
