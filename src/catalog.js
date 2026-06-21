// Catalog helpers (need read_products scope): product tags, and later
// product/collection search + node resolution for the search-panel pickers.
import { graphql } from './shopify.js';

// All product tags in the store (up to 250 — plenty for badge tags).
export async function getProductTags(ctx) {
  const d = await graphql(ctx, `query{ productTags(first: 250){ edges{ node } } }`);
  return (d.productTags?.edges || []).map((e) => e.node).filter(Boolean).sort((a, b) => a.localeCompare(b));
}
