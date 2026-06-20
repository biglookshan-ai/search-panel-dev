// Shopify Admin API client. Each call takes ctx = { shop, token } resolved
// per-request from the embedded session token (see auth-embedded.js).
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';

const headers = (token) => ({
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

const apiBase = (shop) => `https://${shop}/admin/api/${VERSION}`;

export async function graphql(ctx, query, variables = {}) {
  const res = await fetch(`${apiBase(ctx.shop)}/graphql.json`, {
    method: 'POST',
    headers: headers(ctx.token),
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${JSON.stringify(json)}`);
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

export async function listThemes(ctx) {
  const res = await fetch(`${apiBase(ctx.shop)}/themes.json`, { headers: headers(ctx.token) });
  const json = await res.json();
  if (!res.ok) throw new Error(`themes.json HTTP ${res.status}: ${JSON.stringify(json)}`);
  return (json.themes || []).map((t) => ({ id: t.id, name: t.name, role: t.role }));
}

export async function getAsset(ctx, themeId, key) {
  const url = `${apiBase(ctx.shop)}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: headers(ctx.token) });
  if (res.status === 404) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(`getAsset ${key} HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json.asset ? json.asset.value : null;
}

export async function putAsset(ctx, themeId, key, value) {
  const res = await fetch(`${apiBase(ctx.shop)}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: headers(ctx.token),
    body: JSON.stringify({ asset: { key, value } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`putAsset ${key} HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json.asset;
}
