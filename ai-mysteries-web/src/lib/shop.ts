import type { ShopItem } from "./types";

// The site's Amazon Associates tag. Site chrome, not book data — every shop link on the site
// earns to the same account, so it lives in code (associate tags aren't secrets; they appear in
// every link). The items themselves are per-book data (BookMeta.shopItems).
export const AMAZON_ASSOCIATE_TAG = "aworldchanger-20";

// Build the Amazon link for one shelf item: a product page when the item has a curated ASIN,
// otherwise a search-results link (never goes stale — an ASIN can be swapped in later as a
// data-only edit). Returns "" for an item with nothing to link, so the caller can skip it.
export function shopUrl(item: ShopItem): string {
  if (item.asin) {
    return `https://www.amazon.com/dp/${encodeURIComponent(item.asin)}?tag=${AMAZON_ASSOCIATE_TAG}`;
  }
  if (item.search) {
    return `https://www.amazon.com/s?k=${encodeURIComponent(item.search)}&tag=${AMAZON_ASSOCIATE_TAG}`;
  }
  return "";
}
