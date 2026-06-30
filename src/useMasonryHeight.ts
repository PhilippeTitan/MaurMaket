import { useState, useCallback, useRef, useEffect } from 'react';
import { Image } from 'react-native';

interface Size { w: number; h: number; }

/**
 * Tracks fetched image dimensions for a set of items (keyed by id) and
 * exposes a `getHeight(id, imageUrl)` helper that returns a clamped,
 * aspect-ratio-correct card height. Previously this fetch+clamp logic was
 * hand-duplicated (with slightly different constants) in StorefrontScreen,
 * MeScreen, and ProductDetailScreen — this hook is the single source of
 * truth so masonry grids feel consistent across the whole app.
 *
 * @param cardWidth   the rendered width of each card
 * @param aspectRatio default height/width ratio to use before the real
 *                    image size has loaded (1.25 mirrors product photos'
 *                    typical portrait crop)
 * @param minRatio    minimum height/width ratio allowed, prevents
 *                    extremely wide images from producing a tiny sliver
 * @param maxRatio    optional maximum height/width ratio — prevents
 *                    extremely tall/portrait images from producing cards
 *                    that dominate the scroll (used by ProductDetail grid)
 */
export function useMasonryHeight(cardWidth: number, aspectRatio = 1.25, minRatio = 0.6, maxRatio?: number) {
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const defaultHeight = Math.round(cardWidth * aspectRatio);
  const minHeight = cardWidth * minRatio;
  const maxHeight = maxRatio ? cardWidth * maxRatio : undefined;

  const registerImage = useCallback((id: string, imageUrl: string | null | undefined) => {
    if (!imageUrl || sizes[id]) return;
    Image.getSize(
      imageUrl,
      (w, h) => {
        if (mountedRef.current) setSizes(prev => ({ ...prev, [id]: { w, h } }));
      },
      () => { /* ignore failures, fall back to default height */ },
    );
  }, [sizes]);

  const getHeight = useCallback((id: string): number => {
    const size = sizes[id];
    if (!size || size.w <= 0) return defaultHeight;
    let h = Math.round(cardWidth * size.h / size.w);
    h = Math.max(minHeight, h);
    if (maxHeight) h = Math.min(maxHeight, h);
    return h;
  }, [sizes, cardWidth, defaultHeight, minHeight, maxHeight]);

  return { registerImage, getHeight };
}