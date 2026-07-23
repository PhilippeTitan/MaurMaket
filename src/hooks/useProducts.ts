import { useQuery } from '@tanstack/react-query';
import { getProducts, getSellerProducts } from '../api';
import type { Product } from '../types';

export function useProducts(params?: Record<string, string>) {
  return useQuery<Product[]>({
    queryKey: ['products', params],
    queryFn: async () => {
      const res = (await getProducts(params)) as { products?: Product[]; data?: Product[] };
      return res.products || res.data || [];
    },
    staleTime: 30_000,
  });
}

export function useSellerProducts() {
  return useQuery<Product[]>({
    queryKey: ['sellerProducts'],
    queryFn: async () => {
      const res = (await getSellerProducts()) as { products?: Product[]; data?: Product[] };
      return res.products || res.data || [];
    },
    staleTime: 15_000,
  });
}
