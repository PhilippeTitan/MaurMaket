import { Platform } from 'react-native';
import type { Conversation, Product } from './types';

const getWebApiBase = () => {
  if (typeof window === 'undefined') return 'http://localhost:3002/api';
  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:3002/api';
  return `https://molecules-restaurant-diploma-fate.trycloudflare.com/api`;
};

const getWebUploadBase = () => {
  if (typeof window === 'undefined') return 'http://localhost:3002';
  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:3002';
  return `https://molecules-restaurant-diploma-fate.trycloudflare.com`;
};

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

export const API_BASE = Platform.OS === 'web'
  ? getWebApiBase()
  : isDev
    ? 'http://10.12.28.105:3002/api'
    : 'https://maurmaket.onrender.com/api';

export const UPLOAD_BASE = Platform.OS === 'web'
  ? getWebUploadBase()
  : isDev
    ? 'http://10.12.28.105:3002'
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
    ...(options.headers as Record<string, string> || {}),
  };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server returned invalid response (${res.status}). Please try again.`);
  }
  if (!res.ok) {
    const msg = data.error || data.message || 'Request failed';
    const detail = data.details ? ` (${data.details})` : '';
    throw new Error(`${msg}${detail}`);
  }
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
    .filter((item): item is Product => Boolean(item))
    .map(p => normalizeProduct(p as Product & Record<string, unknown>));
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
      id_verification_result: null,
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

export const getVerificationStatus = () => request('/verification/status');

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

// Meetup
export const meetupCheckin = (orderId: string, lat: number, lng: number) =>
  request(`/orders/${orderId}/meetup/checkin`, { method: 'POST', body: JSON.stringify({ lat, lng }) });

export const meetupScan = (orderId: string, qrToken: string) =>
  request(`/orders/${orderId}/meetup/scan`, { method: 'POST', body: JSON.stringify({ qrToken }) });

export const getMeetupStatus = (orderId: string) =>
  request(`/orders/${orderId}/meetup/status`);

export const extendMeetup = (orderId: string) =>
  request(`/orders/${orderId}/meetup/extend`, { method: 'PUT' });

export const releaseEscrow = (orderId: string) =>
  request(`/orders/${orderId}/escrow/release`, { method: 'POST' });

export const refundEscrow = (orderId: string) =>
  request(`/orders/${orderId}/escrow/refund`, { method: 'POST' });

export const getEscrowStatus = (orderId: string) =>
  request(`/orders/${orderId}/escrow`);

// Feed
export const trackFeedEvent = (productId: string, eventType: string, durationMs?: number) =>
  request('/feed/event', { method: 'POST', body: JSON.stringify({ productId, eventType, durationMs }) });

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

// Nearby sellers (map)
export const getNearbySellers = (lat: number, lng: number, radius: number = 10) =>
  request(`/sellers/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);

export const setSellerLocation = (lat: number, lng: number) =>
  request('/seller/location', { method: 'PUT', body: JSON.stringify({ lat, lng }) });

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
export const togglePromo = (id: string) => request(`/promos/${id}/toggle`, { method: 'PATCH' });

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

let cachedImgbbKey: string | null = null;

async function getImgbbKey(): Promise<string> {
  if (cachedImgbbKey) return cachedImgbbKey;
  const data: any = await request('/upload/config');
  if (!data.imgbbKey) throw new Error('Upload service not configured');
  cachedImgbbKey = data.imgbbKey as string;
  return cachedImgbbKey;
}

async function resizeAndConvert(uri: string): Promise<{ base64: string; mimeType: string }> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      const img = new (window as any).Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/webp', 0.82);
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType: 'image/webp' });
      };
      img.onerror = () => reject(new Error('Failed to load image for resize'));
      img.src = uri;
    });
  }

  const Manipulator = require('expo-image-manipulator');
  const result = await Manipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    { compress: 0.82, format: Manipulator.SaveFormat.WEBP, base64: true }
  );
  return { base64: result.base64, mimeType: 'image/webp' };
}

export const uploadImage = async (uri: string): Promise<{ url: string; deleteUrl?: string }> => {
  let token: string | null = null;
  if (Platform.OS === 'web') {
    token = localStorage.getItem('mm_token');
  } else {
    const SecureStore = require('expo-secure-store');
    token = await SecureStore.getItemAsync('mm_token');
  }
  if (!token) throw new Error('Not authenticated');

  const imgbbKey = await getImgbbKey();
  const { base64 } = await resizeAndConvert(uri);

  const formData = new FormData();
  formData.append('key', imgbbKey);
  formData.append('image', base64);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Upload failed');
    return { url: data.data.url, deleteUrl: data.data.delete_url };
  } catch (e: any) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('Upload timed out. Check your connection.');
    if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
      throw new Error('Cannot reach upload service. Check your connection.');
    }
    throw e;
  }
};

// Verification
export const submitVerification = (data: {
  idFrontUrl: string;
  idBackUrl: string;
  selfieUrl: string;
  deleteUrls?: { idFront?: string; idBack?: string; selfie?: string };
  ocrResult?: Record<string, string>;
  faceMatchScore?: number;
}) => request('/verification/submit', { method: 'POST', body: JSON.stringify(data) });

// Subscriptions
export const createSubscription = (returnUrl?: string) =>
  request('/subscriptions/create', { method: 'POST', body: JSON.stringify({ returnUrl }) });

export const getCurrentSubscription = () => request('/subscriptions/current');

export const renewSubscription = (returnUrl?: string) =>
  request('/subscriptions/renew', { method: 'POST', body: JSON.stringify({ returnUrl }) });
