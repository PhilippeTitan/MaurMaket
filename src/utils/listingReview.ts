/**
 * Content-rights / authenticity review categories (APP-Q545).
 *
 * The seller is told the reason category, the affected content, and their
 * response path — never the reporter's identity or the private evidence.
 * Categories are stored as stable codes on `products.moderation_category`.
 */
export const REVIEW_CATEGORY_KEYS: Record<string, string> = {
  counterfeit: 'myListings.reviewCategoryCounterfeit',
  stolen_content: 'myListings.reviewCategoryStolenContent',
  brand_misuse: 'myListings.reviewCategoryBrandMisuse',
  prohibited: 'myListings.reviewCategoryProhibited',
  other: 'myListings.reviewCategoryOther',
};

/** Translation key for a stored moderation category, with a safe fallback. */
export function reviewCategoryKey(category?: string | null): string {
  return REVIEW_CATEGORY_KEYS[category || 'other'] || 'myListings.reviewCategoryOther';
}
