import type { Product } from '../types';

const cache = new Map<string, { w: number; h: number }>();

const DEFAULT_RATIO = 1.25;

export function getCachedSize(productId: string): { w: number; h: number } | null {
  return cache.get(productId) || null;
}

export function cacheSize(productId: string, w: number, h: number) {
  cache.set(productId, { w, h });
}

export function getCardHeight(
  product: Product,
  cardWidth: number,
  minHeight: number,
  maxHeight: number,
): number {
  const id = product.id;

  // 1. Check server-provided dimensions on images
  const img = product.images?.find(i => i.is_primary) || product.images?.[0];
  if (img?.image_width && img.image_height && img.image_width > 0) {
    const ratio = img.image_height / img.image_width;
    return Math.max(minHeight, Math.min(maxHeight, cardWidth * ratio));
  }

  // 2. Check in-memory cache
  const cached = cache.get(id);
  if (cached && cached.w > 0) {
    const ratio = cached.h / cached.w;
    return Math.max(minHeight, Math.min(maxHeight, cardWidth * ratio));
  }

  // 3. Default fallback
  return cardWidth * DEFAULT_RATIO;
}
