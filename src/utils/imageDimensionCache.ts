import { Image as RNImage } from 'react-native';
import type { Product } from '../types';
import { getImageUrl } from '../api';

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

export function resolveImageSizes(products: Product[], cardWidth: number): Record<string, { w: number; h: number }> {
  const sizes: Record<string, { w: number; h: number }> = {};
  for (const p of products) {
    const img = p.images?.find(i => i.is_primary) || p.images?.[0];
    if (img?.image_width && img.image_height && img.image_width > 0) {
      sizes[p.id] = { w: img.image_width, h: img.image_height };
      cache.set(p.id, sizes[p.id]);
    } else {
      const cached = cache.get(p.id);
      if (cached) {
        sizes[p.id] = cached;
      } else {
        sizes[p.id] = { w: cardWidth, h: cardWidth * DEFAULT_RATIO };
      }
    }
  }
  return sizes;
}

export function fetchAndCacheSize(productId: string, uri: string): Promise<{ w: number; h: number } | null> {
  const cached = cache.get(productId);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    RNImage.getSize(
      uri,
      (w, h) => {
        cache.set(productId, { w, h });
        resolve({ w, h });
      },
      () => resolve(null),
    );
  });
}

export function preloadProductDimensions(products: Product[]) {
  for (const p of products) {
    if (cache.has(p.id)) continue;
    const img = p.images?.find(i => i.is_primary) || p.images?.[0];
    const url = getImageUrl(img?.thumbnail_url || img?.image_url);
    if (!url) continue;
    fetchAndCacheSize(p.id, url);
  }
}
