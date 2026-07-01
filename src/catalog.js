// Catalog helpers (need read_products scope): product tags, and later
// product/collection search + node resolution for the search-panel pickers.
import { graphql } from './shopify.js';

// All product tags in the store (up to 250 — plenty for badge tags).
export async function getProductTags(ctx) {
  const d = await graphql(ctx, `query{ productTags(first: 250){ edges{ node } } }`);
  return (d.productTags?.edges || []).map((e) => e.node).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export async function searchProducts(ctx, q) {
  const d = await graphql(ctx,
    `query($q:String!){ products(first:20, query:$q){ nodes{ id title featuredImage{ url } } } }`,
    { q: q || '' });
  return (d.products?.nodes || []).map((n) => ({ id: n.id, title: n.title, image: n.featuredImage?.url || '' }));
}

export async function searchCollections(ctx, q) {
  const d = await graphql(ctx,
    `query($q:String!){ collections(first:20, query:$q){ nodes{ id title image{ url } } } }`,
    { q: q || '' });
  return (d.collections?.nodes || []).map((n) => ({ id: n.id, title: n.title, image: n.image?.url || '' }));
}

// Tag audit: scan products (paginated) and aggregate tag → count + which product
// types it appears on. Read-only; feeds the filter-group planning. Capped at
// maxPages*250 products to bound the run; `truncated` flags if more exist.
// Retry a query when Shopify rate-limits (THROTTLED), with backoff.
async function gqlRetry(ctx, query, vars, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try { return await graphql(ctx, query, vars); }
    catch (e) {
      if (i < tries - 1 && /throttl/i.test(e.message || '')) { await new Promise((r) => setTimeout(r, 1500 * (i + 1))); continue; }
      throw e;
    }
  }
}

export async function auditTags(ctx, { maxPages = 40 } = {}) {
  const tagCount = new Map();   // tag -> product count
  const tagTypes = new Map();   // tag -> Map(productType -> count)
  const typeCount = new Map();  // productType -> product count
  let cursor = null, pages = 0, products = 0;
  do {
    const d = await gqlRetry(ctx,
      `query($c:String){ products(first:200, after:$c){ pageInfo{ hasNextPage endCursor } nodes{ productType tags } } }`,
      { c: cursor });
    const conn = d.products;
    if (!conn) break;
    for (const n of (conn.nodes || [])) {
      products++;
      const type = n.productType || '(none)';
      typeCount.set(type, (typeCount.get(type) || 0) + 1);
      for (const raw of (n.tags || [])) {
        const tag = String(raw);
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
        let tm = tagTypes.get(tag); if (!tm) { tm = new Map(); tagTypes.set(tag, tm); }
        tm.set(type, (tm.get(type) || 0) + 1);
      }
    }
    cursor = conn.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null;
    pages++;
    if (cursor) await new Promise((r) => setTimeout(r, 300)); // pace to respect the cost bucket
  } while (cursor && pages < maxPages);
  const tags = [...tagCount.entries()].map(([tag, count]) => ({
    tag, count,
    types: [...(tagTypes.get(tag) || new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([type, c]) => ({ type, count: c })),
  })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  const types = [...typeCount.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
  return { products, pages, truncated: !!cursor, tags, types };
}

// Resolve a list of gids → {id, title, image} (Product / Collection / MediaImage).
export async function resolveNodes(ctx, ids) {
  if (!ids || !ids.length) return [];
  const d = await graphql(ctx,
    `query($ids:[ID!]!){ nodes(ids:$ids){
      __typename
      ... on Product{ id title featuredImage{ url } }
      ... on Collection{ id title image{ url } }
      ... on MediaImage{ id image{ url } }
    } }`,
    { ids });
  return (d.nodes || []).filter(Boolean).map((n) => ({
    id: n.id,
    title: n.title || '',
    image: n.featuredImage?.url || n.image?.url || '',
  }));
}
