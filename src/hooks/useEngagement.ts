import { useMutation, useQueryClient } from '@tanstack/react-query';
import { trackFeedEvent, toggleWishlist as apiToggleWishlist } from '../api';
import type { Product } from '../types';

function updateProductInCache(queryClient: any, productId: string, updater: (p: Product) => Product) {
  // Update all query caches that contain this product
  queryClient.getQueryCache().getAll().forEach((entry: any) => {
    const key = entry.queryKey;
    const data = queryClient.getQueryData(key);
    if (!data) return;

    // Single product detail: { product: Product }
    if (data && typeof data === 'object' && 'product' in data && (data as any).product?.id === productId) {
      queryClient.setQueryData(key, { ...data, product: updater((data as any).product) });
      return;
    }

    // Product list: { products: Product[] } or Product[]
    if (Array.isArray(data)) {
      queryClient.setQueryData(key, data.map((p: Product) => p.id === productId ? updater(p) : p));
      return;
    }

    if (data && typeof data === 'object' && 'products' in data && Array.isArray((data as any).products)) {
      queryClient.setQueryData(key, {
        ...data,
        products: (data as any).products.map((p: Product) => p.id === productId ? updater(p) : p),
      });
      return;
    }
  });
}

export function useLike(productId: string) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const product = findProduct(qc, productId);
      const wasLiked = product?.is_liked ?? false;
      await trackFeedEvent(productId, wasLiked ? 'unlike' : 'like');
      return { wasLiked };
    },
    onMutate: async () => {
      await qc.cancelQueries();
      const product = findProduct(qc, productId);
      const wasLiked = product?.is_liked ?? false;
      updateProductInCache(qc, productId, (p) => ({
        ...p,
        is_liked: !p.is_liked,
        like_count: p.is_liked ? Math.max(0, (p.like_count || 1) - 1) : (p.like_count || 0) + 1,
      }));
      return { wasLiked };
    },
    onError: (_err: any, _vars: any, context: { wasLiked: boolean } | undefined) => {
      if (context?.wasLiked !== undefined) {
        updateProductInCache(qc, productId, (p) => ({
          ...p,
          is_liked: context.wasLiked,
          like_count: context.wasLiked ? (p.like_count || 0) + 1 : Math.max(0, (p.like_count || 1) - 1),
        }));
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const product = findProduct(qc, productId);
  return {
    liked: product?.is_liked ?? false,
    likeCount: Number(product?.like_count) || 0,
    toggle: () => mutation.mutate(undefined as any),
    isPending: mutation.isPending,
  };
}

export function useWishlist(productId: string) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const product = findProduct(qc, productId);
      const wasWishlisted = product?.is_wishlisted ?? false;
      await apiToggleWishlist(productId);
      return { wasWishlisted };
    },
    onMutate: async () => {
      await qc.cancelQueries();
      const product = findProduct(qc, productId);
      const wasWishlisted = product?.is_wishlisted ?? false;
      updateProductInCache(qc, productId, (p) => ({
        ...p,
        is_wishlisted: !p.is_wishlisted,
        wishlist_count: p.is_wishlisted ? Math.max(0, (p.wishlist_count || 1) - 1) : (p.wishlist_count || 0) + 1,
      }));
      return { wasWishlisted };
    },
    onError: (_err: any, _vars: any, context: { wasWishlisted: boolean } | undefined) => {
      if (context?.wasWishlisted !== undefined) {
        updateProductInCache(qc, productId, (p) => ({
          ...p,
          is_wishlisted: context.wasWishlisted,
          wishlist_count: context.wasWishlisted ? (p.wishlist_count || 0) + 1 : Math.max(0, (p.wishlist_count || 1) - 1),
        }));
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const product = findProduct(qc, productId);
  return {
    wishlisted: product?.is_wishlisted ?? false,
    wishlistCount: Number(product?.wishlist_count) || 0,
    toggle: () => mutation.mutate(undefined as any),
    isPending: mutation.isPending,
  };
}

function findProduct(qc: any, productId: string): Product | null {
  for (const entry of qc.getQueryCache().getAll()) {
    const data = qc.getQueryData(entry.queryKey);
    if (!data) continue;

    if (data && typeof data === 'object' && 'product' in data && (data as any).product?.id === productId) {
      return (data as any).product;
    }
    if (Array.isArray(data)) {
      const found = data.find((p: any) => p?.id === productId);
      if (found) return found;
    }
    if (data && typeof data === 'object' && 'products' in data && Array.isArray((data as any).products)) {
      const found = (data as any).products.find((p: any) => p?.id === productId);
      if (found) return found;
    }
  }
  return null;
}
