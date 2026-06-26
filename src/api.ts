import { Platform } from 'react-native';
import type { Conversation, Product } from './types';

const getWebApiBase = () => {
  if (typeof window === 'undefined') return 'http://localhost:3001/api';
  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:3001/api';
  return `https://molecules-restaurant-diploma-fate.trycloudflare.com/api`;
};

const getWebUploadBase = () => {
  if (typeof window === 'undefined') return 'http://localhost:3001';
  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:3001';
  return `https://molecules-restaurant-diploma-fate.trycloudflare.com`;
};

export const API_BASE = Platform.OS === 'web'
  ? getWebApiBase()
  : 'https://maurmaket.onrender.com/api';

export const UPLOAD_BASE = Platform.OS === 'web'
  ? getWebUploadBase()
  : 'https://maurmaket.onrender.com';

async function request<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let token: string | null = null;
  if (Platform.OS === 'web') {
    token = localStorage.getItem('mm_token');
  } else {
    const SecureStore = require('expo-secure-store');
    token = await SecureStore.getItemAsync('mm_token');
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
  return data as T;
}

const unwrapWishlistItems = (data: unknown): Product[] => {
  if (Array.isArray(data)) return data as Product[];
  const record = data as { items?: unknown[]; wishlist?: unknown[] };
  const rawItems = record.items || record.wishlist || [];
  return rawItems
    .map(item => {
      if (item && typeof item === 'object' && 'product' in item) {
        return (item as { product?: Product }).product;
      }
      return item as Product;
    })
    .filter(Boolean) as Product[];
};

const unwrapConversations = (data: unknown): Conversation[] => {
  if (Array.isArray(data)) return data as Conversation[];
  return ((data as { conversations?: Conversation[] }).conversations || []) as Conversation[];
};

const normalizeProduct = (product: Product & Record<string, unknown>): Product => {
  const normalizedImages = product.images || (product.image_url ? [{
    id: `${product.id}-primary`,
    image_url: product.image_url as string,
    is_primary: true,
    display_order: 0,
  }] : undefined);
  const withImages = normalizedImages ? { ...product, images: normalizedImages } : product;

  if (withImages.seller || !withImages.seller_id) return withImages;

  const sellerName = withImages.seller_name as string | undefined;
  const storeName = withImages.store_name as string | null | undefined;
  const sellerAvatar = withImages.seller_avatar as string | null | undefined;
  const storeLogo = withImages.store_logo_url as string | null | undefined;
  const sellerTier = withImages.seller_tier as 'none' | 'casual' | 'verified' | 'business' | undefined;

  return {
    ...withImages,
    seller: {
      id: withImages.seller_id,
      full_name: sellerName || 'Seller',
      email: '',
      phone: '',
      role: 'seller',
      avatar_url: sellerAvatar || null,
      bio: null,
      created_at: '',
      store_name: storeName || null,
      store_logo_url: storeLogo || null,
      seller_tier: sellerTier || 'none',
      id_submitted_at: null,
      id_verified: Boolean(product.id_verified),
      id_verified_at: null,
      use_store_identity: Boolean(withImages.use_store_identity),
    },
  };
};

const normalizeProductsResponse = (data: unknown) => {
  const record = data as { product?: Product & Record<string, unknown>; products?: Array<Product & Record<string, unknown>> };
  if (record.product) return { ...record, product: normalizeProduct(record.product) };
  if (record.products) return { ...record, products: record.products.map(normalizeProduct) };
  return data;
};

// Auth
export const signup = (fullName: string, email: string, password: string, phone: string) =>
  request('/auth/signup', { method: 'POST', body: JSON.stringify({ fullName, email, password, phone }) });

export const login = (email: string, password: string) =>
  request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const getMe = () => request('/auth/me');

export const updateProfile = (data: Record<string, string>) =>
  request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) });

export const changePassword = (currentPassword: string, newPassword: string) =>
  request('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) });

export const becomeSeller = (data?: { storeName?: string; storeLogoUrl?: string; idDocumentUrl?: string; tier?: string }) =>
  request('/auth/become-seller', { method: 'PUT', body: data ? JSON.stringify(data) : undefined });

export const updateSellerProfile = (data: Record<string, string | boolean>) =>
  request('/auth/seller-profile', { method: 'PUT', body: JSON.stringify(data) });

export const getVerificationStatus = () => request('/seller/verification-status');

export const upgradeTier = (data: { tier: string; storeName?: string; storeLogoUrl?: string; idDocumentUrl?: string }) =>
  request('/auth/upgrade-tier', { method: 'PUT', body: JSON.stringify(data) });

// Products
export const getProducts = (params?: Record<string, string>) => {
  const qs = params ? new URLSearchParams(params).toString() : '';
  return request(`/products${qs ? '?' + qs : ''}`).then(normalizeProductsResponse);
};

export const getProduct = (id: string) => request(`/products/${id}`).then(normalizeProductsResponse);

export const createProduct = (data: Record<string, unknown>) =>
  request('/products', { method: 'POST', body: JSON.stringify(data) });

export const updateProduct = (id: string, data: Record<string, unknown>) =>
  request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteProduct = (id: string) =>
  request(`/products/${id}`, { method: 'DELETE' });

// Categories
export const getCategories = () => request('/categories');

// Orders
export const createOrder = (data: Record<string, unknown>) =>
  request('/orders', { method: 'POST', body: JSON.stringify(data) });

export const getOrders = () => request('/orders');

export const getOrder = (id: string) => request(`/orders/${id}`);

export const cancelOrder = (orderId: string) =>
  request(`/orders/${orderId}/cancel`, { method: 'PUT' });

export const completeOrder = (orderId: string) =>
  request(`/orders/${orderId}/complete`, { method: 'PUT' });

export const getOrderTimeline = (orderId: string) =>
  request(`/orders/${orderId}/timeline`);

export const reorder = (orderId: string) =>
  request(`/orders/${orderId}/reorder`, { method: 'POST' });

export const proposeMeetup = (orderId: string, lat: number, lng: number, address: string, note: string) =>
  request(`/orders/${orderId}/meetup`, { method: 'PUT', body: JSON.stringify({ lat, lng, address, note }) });

export const confirmMeetup = (orderId: string) =>
  request(`/orders/${orderId}/meetup/confirm`, { method: 'PUT' });

// Seller
export const getSellerProducts = () => request('/seller/products').then(normalizeProductsResponse);
export const getSellerOrders = () => request('/seller/orders');
export const updateOrderStatus = (orderId: string, status: string) =>
  request(`/seller/orders/${orderId}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
export const addOrderNote = (orderId: string, note: string) =>
  request(`/orders/${orderId}/note`, { method: 'POST', body: JSON.stringify({ note }) });
export const getSellerBalance = () => request('/seller/balance');
export const getSellerPayouts = () => request('/seller/payouts');
export const requestPayout = (amount: number) =>
  request('/seller/payouts/request', { method: 'POST', body: JSON.stringify({ amount }) });
export const getSellerAnalytics = () => request('/seller/analytics');
export const getLowStockProducts = () => request('/seller/products/low-stock');

// Payments
export const createPayment = (orderId: string, returnUrl: string) =>
  request('/payments/create', { method: 'POST', body: JSON.stringify({ orderId, returnUrl }) });

export const retryPayment = (orderId: string) =>
  request(`/payments/retry/${orderId}`, { method: 'POST' });

// Wishlist
export const toggleWishlist = (productId: string) =>
  request(`/wishlist/${productId}`, { method: 'POST' });

export const getWishlist = async () => {
  const data = await request('/wishlist');
  return { items: unwrapWishlistItems(data) };
};

export const checkWishlist = (productId: string) =>
  request(`/wishlist/check/${productId}`);

// Follows
export const toggleFollow = (sellerId: string) =>
  request(`/follow/${sellerId}`, { method: 'POST' });

export const getFollowing = () => request('/following');

export const getFollowerCount = (sellerId: string) =>
  request(`/followers/count/${sellerId}`);

// Reviews
export const createReview = (orderId: string, rating: number, comment: string) =>
  request('/reviews', { method: 'POST', body: JSON.stringify({ orderId, rating, comment }) });

export const getSellerReviews = (sellerId: string) =>
  request(`/reviews/seller/${sellerId}`);

export const getProductReviews = (productId: string) =>
  request(`/reviews/product/${productId}`);

// Seller Storefront
export const getSellerProfile = (sellerId: string) =>
  request(`/sellers/${sellerId}`);

// Notifications
export const getNotifications = () => request('/notifications');
export const getUnreadCount = () => request('/notifications/unread-count');
export const markNotificationRead = (id: string) =>
  request(`/notifications/${id}/read`, { method: 'PUT' });
export const markAllNotificationsRead = () =>
  request('/notifications/read-all', { method: 'PUT' });

// Messages
export const getConversations = async () => {
  const data = await request('/conversations');
  return { conversations: unwrapConversations(data) };
};
export const createConversation = (data: Record<string, string>) =>
  request('/conversations', { method: 'POST', body: JSON.stringify(data) });
export const getMessages = (conversationId: string) =>
  request(`/conversations/${conversationId}/messages`);
export const sendMessage = (conversationId: string, content: string) =>
  request(`/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content }) });
export const getConversationUnreadCount = () => request('/conversations/unread-count');

// Promos
export const validatePromo = (code: string, orderTotal: number) =>
  request('/promos/validate', { method: 'POST', body: JSON.stringify({ code, orderTotal }) });
export const createPromo = (data: Record<string, unknown>) =>
  request('/promos', { method: 'POST', body: JSON.stringify(data) });
export const getMyPromos = () => request('/promos/mine');

// Addresses
export const getAddresses = () => request('/addresses');
export const createAddress = (data: Record<string, string | boolean>) =>
  request('/addresses', { method: 'POST', body: JSON.stringify(data) });
export const updateAddress = (id: string, data: Record<string, string | boolean>) =>
  request(`/addresses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAddress = (id: string) =>
  request(`/addresses/${id}`, { method: 'DELETE' });

// Disputes
export const createDispute = (data: Record<string, string>) =>
  request('/disputes', { method: 'POST', body: JSON.stringify(data) });

export const getImageUrl = (imageUrl: string | undefined | null): string | null => {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${UPLOAD_BASE}${imageUrl}`;
};
export const uploadImage = async (uri: string): Promise<{ url: string }> => {
  let token: string | null = null;
  if (Platform.OS === 'web') {
    token = localStorage.getItem('mm_token');
  } else {
    const SecureStore = require('expo-secure-store');
    token = await SecureStore.getItemAsync('mm_token');
  }
  const formData = new FormData();
  const filename = uri.split('/').pop() || 'photo.jpg';
  const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
  const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';

  formData.append('image', {
    uri,
    name: filename,
    type: mimeType,
  } as unknown as Blob);

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  return res.json();
};
