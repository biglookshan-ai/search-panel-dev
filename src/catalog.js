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
