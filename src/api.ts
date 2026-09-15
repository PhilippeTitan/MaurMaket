import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import type { Conversation, Product } from './types';
import { network } from './network';
import { offlineQueue } from './offlineQueue';

export class OfflineError extends Error {
  constructor(message = 'No internet connection') {
    super(message);
    this.name = 'OfflineError';
  }
}

const getWebApiBase = () => {
  if (typeof window === 'undefined') return 'http://localhost:4000/api';
  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:4000/api';
  return `https://molecules-restaurant-diploma-fate.trycloudflare.com/api`;
};

const getWebUploadBase = () => {
  if (typeof window === 'undefined') return 'http://localhost:4000';
  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:4000';
  return `https://molecules-restaurant-diploma-fate.trycloudflare.com`;
};

const getDevHost = (): string => {
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).manifest?.debuggerHost;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') return ip;
  }
  return 'localhost';
};

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

export const API_BASE = Platform.OS === 'web'
  ? getWebApiBase()
  : isDev
    ? `http://${getDevHost()}:4000/api`
    : 'https://maurmaket.onrender.com/api';

export const UPLOAD_BASE = Platform.OS === 'web'
  ? getWebUploadBase()
  : isDev
    ? `http://${getDevHost()}:4000`
    : 'https://maurmaket.onrender.com';

let _cachedToken: string | null = null;
let _tokenRead = false;

// Simple platform-aware storage for Better Auth session token
const tokenStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    const SecureStore = require('expo-secure-store');
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') { localStorage.setItem(key, value); return; }
    const SecureStore = require('expo-secure-store');
    return SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') { localStorage.removeItem(key); return; }
    const SecureStore = require('expo-secure-store');
    return SecureStore.deleteItemAsync(key);
  },
};

async function getToken(): Promise<string | null> {
  if (_cachedToken) return _cachedToken;
  _cachedToken = await tokenStorage.getItem('ba_session_token');
  _tokenRead = true;
  return _cachedToken;
}

export function setCachedToken(token: string | null) {
  _cachedToken = token;
  _tokenRead = true;
  if (token) tokenStorage.setItem('ba_session_token', token);
  else tokenStorage.deleteItem('ba_session_token');
}

/** Clear the stored Better Auth session token (used on logout). */
export async function clearSessionToken() {
  _cachedToken = null;
  _tokenRead = false;
  await tokenStorage.deleteItem('ba_session_token');
}

async function request<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (network.isOffline) {
    throw new OfflineError();
  }

  const token = await getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
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
  } catch (err: any) {
    if (err instanceof OfflineError) throw err;
    if (
      err?.name === 'AbortError' ||
      err?.message?.includes('Network request failed') ||
      err?.message?.includes('Failed to fetch')
    ) {
      throw new OfflineError();
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
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
    thumbnail_url: null,
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
    ...(withImages as any),
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
      email_verified: Boolean(withImages.email_verified),
      location_address: null,
      location_city: null,
      location_lat: null,
      location_lng: null,
      username: (withImages as any).seller_username || null,
      show_real_name: false,
      natcash_phone: null,
      accepted_payment_methods: null,
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
const getAuthRedirectUrl = () => {
  if (Platform.OS !== 'web') return 'maurmaket://auth/callback';
  return process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL || `${window.location.origin}/`;
};

const getPasswordResetRedirectUrl = () => {
  if (Platform.OS !== 'web') return 'maurmaket://reset-password';
  const baseUrl = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL || `${window.location.origin}/`;
  return new URL('/reset-password', baseUrl).toString();
};

/**
 * Extract session token from Better Auth response.
 * Better Auth sets the token in cookies (web) or returns it in the body.
 * We grab it from Set-Cookie header or response body.
 */
function extractSessionToken(res: Response, body: any): string | null {
  // 1) Check response body for session token
  if (body?.session?.token) return body.session.token;
  if (body?.token) return body.token;
  // 2) Check Set-Cookie header for better-auth.session_token
  const cookies = res.headers.getSetCookie?.() || [];
  for (const cookie of cookies) {
    const match = cookie.match(/better-auth\.session_token=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

/** Auth-fetch wrapper: calls the backend with auto-env and returns JSON. */
async function authFetch(path: string, options: RequestInit = {}): Promise<{ res: Response; body: any }> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  const res = await fetch(url, { ...options, headers });
  let body: any;
  try { body = await res.json(); } catch { body = {}; }
  return { res, body };
}

export const signup = async (fullName: string, email: string, password: string, phone: string, dateOfBirth?: string, username?: string) => {
  const normalizedEmail = email.trim().toLowerCase();

  // Better Auth sign-up: creates user + session in one call
  const { res, body } = await authFetch('/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({
      email: normalizedEmail,
      password,
      name: fullName,
      ...(username ? { username } : {}),
      ...(phone ? { phoneNumber: phone.replace(/^\+?509/, '').replace(/^\+/, '') } : {}),
    }),
  });

  if (!res.ok) {
    const msg = body?.message || body?.error || 'Signup failed';
    if (msg.includes('already') || msg.includes('exists') || res.status === 422) {
      throw new Error('An account with this email already exists. Please sign in instead.');
    }
    throw new Error(msg);
  }

  const token = extractSessionToken(res, body);
  if (token) setCachedToken(token);

  // Bootstrap profile with extra fields that Better Auth doesn't handle (DOB, etc.)
  try {
    const profileRes = await request('/user/profile/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ fullName, email: normalizedEmail, phone, dateOfBirth, username }),
    });
    return { ...(profileRes as any), token };
  } catch {
    // Bootstrap may fail if user already exists — build minimal user from response
    const userId = body?.user?.id || '';
    const triggerUsername = (username || normalizedEmail.split('@')[0] || 'user')
      .toLowerCase().replace(/[^a-z0-9._]/g, '').replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
    const cleanPhone = phone ? phone.replace(/^\+?509/, '').replace(/^\+/, '') : null;
    return {
      user: {
        id: userId, full_name: fullName, email: normalizedEmail, phone: cleanPhone,
        role: 'buyer' as const, seller_tier: 'none' as const, avatar_url: null, bio: null,
        created_at: new Date().toISOString(), username: triggerUsername,
        show_real_name: true, pending_dob: !dateOfBirth,
        email_verified: false, id_verified: false,
      },
      token,
      emailConfirmationPending: !token,
    };
  }
};

export const resendVerificationEmail = async (email: string) => {
  const { res, body } = await authFetch('/auth/send-verification-email', {
    method: 'POST',
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      callbackURL: getAuthRedirectUrl(),
    }),
  });
  if (!res.ok) throw new Error(body?.message || body?.error || 'Failed to resend verification email');
  return { success: true };
};

export const login = async (email: string, password: string) => {
  const normalizedEmail = email.trim().toLowerCase();

  // Better Auth sign-in
  const { res, body } = await authFetch('/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email: normalizedEmail, password }),
  });

  if (!res.ok) {
    throw new Error(body?.message || body?.error || 'Invalid email or password');
  }

  const token = extractSessionToken(res, body);
  if (token) setCachedToken(token);

  // Fetch profile from our backend
  try {
    return { ...(await getMe() as any), token };
  } catch (profileError: any) {
    if (!String(profileError?.message || '').includes('User not found')) throw profileError;
    // First-time login: bootstrap profile
    return request('/user/profile/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        fullName: body?.user?.name || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        phone: body?.user?.phoneNumber || '',
      }),
    }).then((response: any) => ({ ...response, token }));
  }
};

export const completeDob = (dateOfBirth: string) =>
  request('/user/complete-dob', { method: 'POST', body: JSON.stringify({ dateOfBirth }) });

export const skipDob = () => request('/user/skip-dob', { method: 'POST' });

export const getMe = () => request('/user/me');
export const savePushToken = (pushToken: string) =>
  request('/users/push-token', { method: 'POST', body: JSON.stringify({ pushToken }) });

// Google Sign-In via Better Auth social provider
export const googleAuth = async () => {
  // Native: use expo-auth-session to redirect to Better Auth's Google OAuth endpoint
  if (Platform.OS !== 'web') {
    const redirectUri = AuthSession.makeRedirectUri({ scheme: 'maurmaket', path: 'auth/callback' });
    const authUrl = `${API_BASE.replace('/api', '')}/api/auth/signin/google?callbackURL=${encodeURIComponent(redirectUri)}`;

    const WebBrowser = require('expo-web-browser');
    WebBrowser.maybeCompleteAuthSession();
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
    if (result.type !== 'success' || !result.url) {
      throw new Error('Google sign-in was cancelled');
    }

    // Better Auth callback returns cookies — extract session token from the URL's cookies
    // On native, the callback URL contains a set-cookie header that we need to capture
    // Instead, let's re-fetch the session from the server
    const { res: sessionRes, body: sessionBody } = await authFetch('/auth/get-session', {
      method: 'GET',
      headers: {
        // Better Auth sets cookies on the redirect; we need to forward them
        // On native, we extract the token from the callback URL
      },
    });

    // Alternative: parse the callback URL for the session token
    const urlParams = new URLSearchParams(result.url.split('?')[1] || '');
    const token = urlParams.get('token') || urlParams.get('session_token');
    if (token) {
      setCachedToken(token);
    }

    // Try to get the user from Better Auth
    const { body } = await authFetch('/auth/get-session', { method: 'GET' });
    if (body?.session?.token) {
      setCachedToken(body.session.token);
    }

    try {
      return { ...(await getMe() as any), token: body?.session?.token || token };
    } catch (profileError: any) {
      if (!String(profileError?.message || '').includes('User not found')) throw profileError;
      return request('/user/profile/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          fullName: body?.user?.name || 'New User',
          email: body?.user?.email || '',
          phone: '',
        }),
      }).then((response: any) => ({ ...response, token: body?.session?.token || token }));
    }
  }

  // Web: redirect to Better Auth's Google OAuth
  const redirectTo = `${window.location.origin}/`;
  const authUrl = `${API_BASE.replace('/api', '')}/api/auth/signin/google?callbackURL=${encodeURIComponent(redirectTo)}`;

  const WebBrowser = require('expo-web-browser');
  WebBrowser.maybeCompleteAuthSession();
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
  if (result.type !== 'success' || !result.url) {
    throw new Error('Google sign-in was cancelled');
  }

  // Parse session token from callback URL or cookies
  const urlParams = new URLSearchParams(result.url.split('?')[1] || '');
  const token = urlParams.get('token') || urlParams.get('session_token');
  if (token) setCachedToken(token);

  // Fetch session from server
  const { body } = await authFetch('/auth/get-session', { method: 'GET' });
  if (body?.session?.token) setCachedToken(body.session.token);

  try {
    return { ...(await getMe() as any), token: body?.session?.token || token };
  } catch (err: any) {
    if (!String(err?.message || '').includes('User not found')) throw err;
    return request('/user/profile/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        fullName: body?.user?.name || 'New User',
        email: body?.user?.email || '',
        phone: '',
      }),
    }).then((response: any) => ({ ...response, token: body?.session?.token || token }));
  }
};

// Google OAuth info extraction — gets user metadata WITHOUT creating an account.
// Used during signup to pre-fill name/email, then link after password account is created.
export const googleAuthInfo = async (): Promise<{ firstName: string; lastName: string; email: string; birthDate?: string; googleIdToken: string }> => {
  if (Platform.OS !== 'web' && Constants.executionEnvironment !== 'storeClient') {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    GoogleSignin.configure({
      webClientId: '273654218158-k61mtuaq2kcvohj05roqdpe6nqmfscu0.apps.googleusercontent.com',
      scopes: ['profile', 'email'],
    });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();
    if (result.type !== 'success' || !result.data.idToken) {
      throw new Error('Google sign-in was cancelled or did not return an ID token');
    }
    const meta = result.data.user;

    let birthDate: string | undefined;
    try {
      const [, payloadB64] = result.data.idToken.split('.');
      if (payloadB64) {
        const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
        const json = JSON.parse(atob(padded));
        if (json.birthday) birthDate = json.birthday;
      }
    } catch {}

    return {
      firstName: meta.givenName || '',
      lastName: meta.familyName || '',
      email: meta.email || '',
      birthDate,
      googleIdToken: result.data.idToken,
    };
  }

  // Web: browser OAuth for info extraction
  const redirectTo = Platform.OS === 'web'
    ? `${window.location.origin}/`
    : AuthSession.makeRedirectUri({ scheme: 'maurmaket', path: 'auth/callback' });
  const authUrl = `${API_BASE.replace('/api', '')}/api/auth/signin/google?callbackURL=${encodeURIComponent(redirectTo)}`;

  const WebBrowser = require('expo-web-browser');
  WebBrowser.maybeCompleteAuthSession();
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
  if (result.type !== 'success' || !result.url) {
    throw new Error('Google sign-in was cancelled');
  }

  // Parse id_token from redirect URL
  const hashPart = result.url.split('#')[1] || '';
  const queryPart = result.url.split('?')[1]?.split('#')[0] || '';
  const allParams = new URLSearchParams(hashPart || queryPart);
  const idToken = allParams.get('id_token');
  if (idToken) {
    const [, payloadB64] = idToken.split('.');
    if (payloadB64) {
      const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
      const json = JSON.parse(atob(padded));
      return {
        firstName: json.given_name || json.name?.split(' ')[0] || '',
        lastName: json.family_name || json.name?.split(' ').slice(1).join(' ') || '',
        email: json.email || '',
        birthDate: json.birthday || undefined,
        googleIdToken: idToken,
      };
    }
  }

  // Fallback: use Better Auth session to get user info, then sign out
  const { body } = await authFetch('/auth/get-session', { method: 'GET' });
  if (body?.user) {
    const u = body.user;
    const result = {
      firstName: u.name?.split(' ')[0] || '',
      lastName: u.name?.split(' ').slice(1).join(' ') || '',
      email: u.email || '',
      birthDate: u.birthday || undefined,
      googleIdToken: idToken || body.session?.token || '',
    };
    await authFetch('/auth/sign-out', { method: 'POST' });
    return result;
  }

  throw new Error('Could not extract Google user info');
};

// Link Google identity to an existing email/password account after signup.
export const linkGoogleIdentity = async (googleIdToken: string) =>
  request('/user/google-link', {
    method: 'POST',
    body: JSON.stringify({ googleIdToken }),
  });

export class PasskeyUnavailableError extends Error {
  constructor(message = 'Passkeys are not available on this platform') {
    super(message);
    this.name = 'PasskeyUnavailableError';
  }
}

// Passkey sign-in via Better Auth WebAuthn support
export const passkeyAuth = async () => {
  if (Platform.OS !== 'web') throw new PasskeyUnavailableError();

  // Better Auth passkey sign-in
  const { res, body } = await authFetch('/auth/sign-in/passkey', {
    method: 'POST',
    body: JSON.stringify({}),
  });

  if (!res.ok) throw new Error(body?.message || 'Passkey sign-in failed');

  const token = extractSessionToken(res, body);
  if (token) setCachedToken(token);

  try {
    return { ...(await getMe() as any), token };
  } catch (err: any) {
    if (!String(err?.message || '').includes('User not found')) throw err;
    return request('/user/profile/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        fullName: body?.user?.name || 'New User',
        email: body?.user?.email || '',
        phone: '',
      }),
    }).then((response: any) => ({ ...response, token }));
  }
};

// Forgot / Reset Password via Better Auth
export const forgotPassword = async (email: string, _language?: string) => {
  const { res, body } = await authFetch('/auth/forget-password', {
    method: 'POST',
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      redirectTo: getPasswordResetRedirectUrl(),
    }),
  });
  if (!res.ok) throw new Error(body?.message || body?.error || 'Failed to send reset email');
  return { sent: true };
};

export const resetPassword = async (_email: string, _code: string, newPassword: string) => {
  const { res, body } = await authFetch('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ newPassword }),
  });
  if (!res.ok) throw new Error(body?.message || body?.error || 'Failed to reset password');
  // Update the session token if a new one was returned
  const token = extractSessionToken(res, body);
  if (token) setCachedToken(token);
  return { updated: true };
};

export const updateProfile = (data: Record<string, string>) =>
  request('/user/profile', { method: 'PUT', body: JSON.stringify(data) });

export const exportAccountData = () => request('/user/export-data');

export const changePassword = async (currentPassword: string, newPassword: string) => {
  // Better Auth change password — session validates identity
  const { res, body } = await authFetch('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const msg = body?.message || body?.error || 'Failed to change password';
    if (msg.includes('incorrect') || msg.includes('wrong')) throw new Error('Current password is incorrect');
    throw new Error(msg);
  }
  return { updated: true };
};

export const becomeSeller = (data?: { storeName?: string; storeLogoUrl?: string; idDocumentUrl?: string; tier?: string; natcashPhone?: string }) =>
  request('/user/become-seller', { method: 'PUT', body: data ? JSON.stringify(data) : undefined });

export const updateSellerProfile = (data: Record<string, string | boolean>) =>
  request('/user/seller-profile', { method: 'PUT', body: JSON.stringify(data) });

export const updateUsername = (username: string) =>
  request('/user/username', { method: 'PUT', body: JSON.stringify({ username }) });

export const getVerificationStatus = () => request('/verification/status');

export const upgradeTier = (data: { tier: string; storeName?: string; storeLogoUrl?: string; idDocumentUrl?: string; natcashPhone?: string }) =>
  request('/user/upgrade-tier', { method: 'PUT', body: JSON.stringify(data) });

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
export const createPendingCheckout = (data: Record<string, unknown>) =>
  request('/checkout/pending', { method: 'POST', body: JSON.stringify(data) });

export const checkPendingStatus = (pendingId: string) =>
  request(`/checkout/pending/${pendingId}/status`);

export const getSellerFulfillmentProposals = () => request('/seller/fulfillment-proposals');
export const decideFulfillmentProposal = (pendingId: string, sellerId: string, decision: 'accept' | 'reject') =>
  request(`/checkout/pending/${pendingId}/agreements/${sellerId}`, { method: 'PUT', body: JSON.stringify({ decision }) });
export const beginPendingPayment = (pendingId: string, sellerId: string) =>
  request(`/checkout/pending/${pendingId}/begin-payment`, { method: 'POST', body: JSON.stringify({ sellerId }) });

export const getPendingSellerInfo = (pendingId: string) =>
  request(`/checkout/pending/${pendingId}/seller-info`);

export const confirmNatCashPayment = (pendingId: string, smsData?: Record<string, unknown>) =>
  request(`/checkout/pending/${pendingId}/confirm-natcash`, { method: 'POST', body: JSON.stringify({ smsData }) });

export const confirmNatCashSeller = (orderId: string, sellerId: string, smsData?: Record<string, unknown>) =>
  request(`/orders/${orderId}/confirm-natcash-seller`, { method: 'POST', body: JSON.stringify({ sellerId, smsData }) });

// ── NatCash paste-verification sessions ──
export const createNatCashSessions = (pendingId: string, sellers: Array<{ sellerId: string; phone: string; total: number }>) =>
  request('/orders/natcash/sessions', { method: 'POST', body: JSON.stringify({ pendingId, sellers }) });

export const verifyNatCashSession = (sessionId: string, smsText: string) =>
  request(`/orders/natcash/sessions/${sessionId}/verify`, { method: 'POST', body: JSON.stringify({ smsText }) });

export const getNatCashSessions = (pendingId: string) =>
  request(`/orders/natcash/sessions?pendingId=${pendingId}`);

export const confirmAllNatCashSessions = (pendingId: string) =>
  request('/orders/natcash/sessions/confirm-all', { method: 'POST', body: JSON.stringify({ pendingId }) });

// ── SIM preference (carrier-aware payment routing) ──
export const getSimPreferences = () =>
  request('/user/sim-preferences');

export const saveSimPreference = (provider: 'natcash' | 'moncash', subscriptionId: number | null) =>
  request('/user/sim-preferences', { method: 'PUT', body: JSON.stringify({ provider, subscriptionId }) });

export const reportAbandonedPayment = (data: { pendingId?: string; orderId?: string }) =>
  request('/payments/abandoned', { method: 'POST', body: JSON.stringify(data) });

export const createOrder = (data: Record<string, unknown>) =>
  request('/orders', { method: 'POST', body: JSON.stringify(data) });

export const getOrders = () => request('/orders');
export const getActiveOrderCount = () => request('/orders/active-count');

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

export const meetupScan = (orderId: string, code: string) =>
  request(`/orders/${orderId}/meetup/scan`, { method: 'POST', body: JSON.stringify({ code }) });

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

export const getCoPurchaseRecommendations = (productId: string) =>
  request(`/products/${productId}/co-purchases`);

// Feed
export const trackFeedEvent = (productId: string, eventType: string, durationMs?: number, isSync = false) => {
  if (network.isOffline && !isSync) {
    offlineQueue.enqueue({ type: 'feed_event', productId, eventType, dwellTimeMs: durationMs });
    return Promise.resolve({ tracked: true, queued: true });
  }
  return request('/feed/event', { method: 'POST', body: JSON.stringify({ productId, eventType, durationMs }) })
    .then(res => ({ tracked: true, rateLimited: res.rateLimited === true }))
    .catch((err) => {
      const isRateLimited = err?.message?.includes('429') || err?.message?.includes('Too many actions');
      if (!isSync && !isRateLimited) {
        offlineQueue.enqueue({ type: 'feed_event', productId, eventType, dwellTimeMs: durationMs });
      }
      if (isRateLimited) {
        return { tracked: false, rateLimited: true };
      }
      return { tracked: false, rateLimited: false };
    });
};

export const saveFeedTaste = (categoryIds: string[]) =>
  request('/feed/taste', { method: 'POST', body: JSON.stringify({ categoryIds }) });

export const skipFeedTaste = () =>
  request('/feed/taste/skip', { method: 'POST' });

export const checkLikedBatch = (ids: string[]) =>
  request(`/feed/liked-status?ids=${ids.join(',')}`);

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

export const checkPaymentStatus = (orderId: string) =>
  request(`/payments/${orderId}/status`);

// Wishlist
export const toggleWishlist = (productId: string, isSync = false) => {
  if (network.isOffline && !isSync) {
    offlineQueue.enqueue({ type: 'wishlist_toggle', productId });
    return Promise.resolve({ success: true, queued: true });
  }
  return request(`/wishlist/${productId}`, { method: 'POST' });
};

export const getWishlist = async () => {
  const data = await request('/wishlist');
  return { items: unwrapWishlistItems(data) };
};

export const checkWishlist = (productId: string) =>
  request(`/wishlist/check/${productId}`);

export const checkWishlistBatch = (ids: string[]) =>
  request(`/wishlist/status?ids=${ids.join(',')}`);

// Follows
export const toggleFollow = (sellerId: string, isSync = false) => {
  if (network.isOffline && !isSync) {
    offlineQueue.enqueue({ type: 'follow_toggle', sellerId });
    return Promise.resolve({ success: true, queued: true });
  }
  return request(`/follow/${sellerId}`, { method: 'POST' });
};

export const toggleFollowing = toggleFollow;

export const getFollowing = () => request('/following');

export const getFollowerCount = (sellerId: string) =>
  request(`/followers/count/${sellerId}`);
export const getFollowList = (userId: string, kind: 'followers' | 'following') =>
  request(`/users/${userId}/follows/${kind}`);

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
export const getNearbySellers = (lat: number, lng: number) =>
  request(`/sellers/nearby?lat=${lat}&lng=${lng}`);

export const setSellerLocation = (lat: number, lng: number, isVisible?: boolean) =>
  request('/seller/location', { method: 'PUT', body: JSON.stringify({ lat, lng, isVisible }) });

export const getSellerLocation = () => request('/seller/location');

export type SellerFulfillmentProfile = {
  deliveryEnabled: boolean;
  meetupEnabled: boolean;
  deliveryRadiusMeters: number;
  meetupRadiusMeters: number;
  deliveryFeeType: 'free' | 'flat' | 'distance';
  flatDeliveryFee: number;
  distanceFeeRules: Array<{ maxDistanceMeters: number; fee: number }>;
};

export const getSellerFulfillmentProfile = () => request('/seller/fulfillment-profile');
export const updateSellerFulfillmentProfile = (data: Partial<SellerFulfillmentProfile>) =>
  request('/seller/fulfillment-profile', { method: 'PUT', body: JSON.stringify(data) });

export const toggleSellerVisibility = (isVisible: boolean) =>
  request('/seller/location', { method: 'PUT', body: JSON.stringify({ isVisible }) });

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
export const getMessages = (conversationId: string, params?: { limit?: number; offset?: number; since?: string; sinceId?: string }) => {
  const qs = params ? `?${new URLSearchParams({ ...(params.limit != null && { limit: String(params.limit) }), ...(params.offset != null && { offset: String(params.offset) }), ...(params.since && { since: params.since }), ...(params.sinceId && { sinceId: params.sinceId }) }).toString()}` : '';
  return request(`/conversations/${conversationId}/messages${qs}`);
};
export const sendMessage = (conversationId: string, content: string, imageUrl?: string) =>
  request(`/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content, imageUrl, messageType: imageUrl ? 'image' : 'text' }) });
export const getConversationUnreadCount = () => request('/conversations/unread-count');
export const sendTyping = (conversationId: string) =>
  request(`/conversations/${conversationId}/typing`, { method: 'POST' });
export const getTypingStatus = (conversationId: string) =>
  request(`/conversations/${conversationId}/typing`);

// Offers
export const sendOffer = (conversationId: string, data: { productId: string; productName: string; offeredPrice: number; listPrice: number }) =>
  request(`/conversations/${conversationId}/offer`, { method: 'POST', body: JSON.stringify(data) });
export const respondToOffer = (messageId: string, action: 'accepted' | 'declined') =>
  request(`/offers/${messageId}/respond`, { method: 'POST', body: JSON.stringify({ action }) });
export const counterOffer = (messageId: string, offeredPrice: number) =>
  request(`/offers/${messageId}/counter`, { method: 'POST', body: JSON.stringify({ offeredPrice }) });
export const getSellerItems = (sellerId: string) =>
  request(`/sellers/${sellerId}/items`);
export const getConversationsWithOffers = () =>
  request('/conversations/with-offers');
export const getOfferDetail = (messageId: string) =>
  request(`/offers/${messageId}`);

// Messaging maturity
export const reactToMessage = (messageId: string, emoji: string) =>
  request(`/messages/${messageId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) });
export const editMessage = (messageId: string, content: string) =>
  request(`/messages/${messageId}`, { method: 'PUT', body: JSON.stringify({ content }) });
export const deleteMessage = (messageId: string) =>
  request(`/messages/${messageId}`, { method: 'DELETE' });
export const sendMessageWithReply = (conversationId: string, content: string, replyToId?: string, imageUrl?: string) =>
  request(`/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content, imageUrl, messageType: imageUrl ? 'image' : 'text', replyToId }) });
export const markConversationRead = (conversationId: string) =>
  request(`/conversations/${conversationId}/read`, { method: 'PUT' });
export const pinConversation = (conversationId: string) =>
  request(`/conversations/${conversationId}/pin`, { method: 'PUT' });
export const muteConversation = (conversationId: string, hours?: number) =>
  request(`/conversations/${conversationId}/mute`, { method: 'PUT', body: JSON.stringify({ hours: hours ?? 8 }) });
export const blockUser = (userId: string) =>
  request(`/users/${userId}/block`, { method: 'POST' });

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
  let normalizedUrl = imageUrl;
  // Defensive: unwrap JSON-wrapped URLs (e.g. {"url":"https://..."})
  if (normalizedUrl.startsWith('{')) {
    try {
      const parsed = JSON.parse(normalizedUrl);
      if (typeof parsed.url === 'string') normalizedUrl = parsed.url;
    } catch { /* not JSON */ }
  }
  if (normalizedUrl.startsWith('http')) return normalizedUrl;
  return `${UPLOAD_BASE}${normalizedUrl}`;
};

async function resizeAndConvert(uri: string): Promise<{ base64: string; mimeType: string }> {
  console.log(`[UPLOAD-DEBUG] resizeAndConvert called, platform=${Platform.OS}, uri=${uri?.substring(0, 80)}`);
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

  try {
    const Manipulator = require('expo-image-manipulator');
    console.log(`[UPLOAD-DEBUG] ImageManipulator loaded, calling manipulateAsync...`);
    const result = await Manipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.82, format: Manipulator.SaveFormat.JPEG, base64: true }
    );
    console.log(`[UPLOAD-DEBUG] manipulateAsync done, base64 length=${result.base64?.length}, width=${result.width}, height=${result.height}`);
    return { base64: result.base64, mimeType: 'image/jpeg' };
  } catch (e: any) {
    console.log(`[UPLOAD-DEBUG] ❌ resizeAndConvert error: ${e?.message}`);
    throw e;
  }
}

export const uploadImage = async (uri: string, expiration?: number): Promise<{ url: string; width?: number; height?: number; deleteUrl?: string }> => {
  console.log(`[UPLOAD-DEBUG] uploadImage called, uri=${uri?.substring(0, 80)}, expiration=${expiration}`);
  let token: string | null = null;
  if (Platform.OS === 'web') {
    token = localStorage.getItem('mm_token');
  } else {
    const SecureStore = require('expo-secure-store');
    token = await SecureStore.getItemAsync('mm_token');
  }
  if (!token) {
    console.log(`[UPLOAD-DEBUG] ❌ No auth token found`);
    throw new Error('Not authenticated');
  }

  console.log(`[UPLOAD-DEBUG] Calling resizeAndConvert...`);
  const { base64 } = await resizeAndConvert(uri);
  console.log(`[UPLOAD-DEBUG] resizeAndConvert done, base64 length=${base64?.length}`);

  // Send to backend — Supabase Storage primary, imgBB fallback
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ image: `data:image/jpeg;base64,${base64}`, expiration }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  console.log(`[UPLOAD-DEBUG] Upload OK, provider=${data.provider}, url=${data.url?.substring(0, 60)}, dims=${data.width}x${data.height}`);
  return { url: data.url, width: data.width, height: data.height, deleteUrl: data.deleteUrl };
};

// Verification
export const createDiditSession = () =>
  request('/verification/didit-session', { method: 'POST' });

export const submitVerification = (data: {
  idFrontUrl: string;
  idFaceUrl?: string;
  idBackUrl: string;
  selfieUrl: string;
  deleteUrls?: { idFront?: string; idFace?: string; idBack?: string; selfie?: string };
}) => request('/verification/submit', { method: 'POST', body: JSON.stringify(data) });

// Subscriptions
export const createSubscription = (returnUrl?: string) =>
  request('/subscriptions/create', { method: 'POST', body: JSON.stringify({ returnUrl }) });

export const getCurrentSubscription = () => request('/subscriptions/current');

export const renewSubscription = (returnUrl?: string) =>
  request('/subscriptions/renew', { method: 'POST', body: JSON.stringify({ returnUrl }) });
