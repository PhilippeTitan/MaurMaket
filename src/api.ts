import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import { createAuthClient } from 'better-auth/client';
import { twoFactorClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';
import type { Conversation, Product, BlockedUser, UserReportPayload, SellerReviewStats, NotificationPreferences, PolicyState, SecurityEvent, TrustedDevice, AccountFreezeState, ExportJob, DataExportSummary, KycEvidenceAccessEntry } from './types';
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
let _betterAuthClient: any = null;

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

export async function getToken(): Promise<string | null> {
  if (_cachedToken) return _cachedToken;
  _cachedToken = await tokenStorage.getItem('ba_session_token');
  _tokenRead = true;
  return _cachedToken;
}

/** WebSocket URL for realtime chat events (derived from API_BASE). */
export function getRealtimeUrl(): string {
  const base = API_BASE.replace(/\/api\/?$/, '');
  return base.replace(/^http/, 'ws') + '/ws';
}

export function setCachedToken(token: string | null) {
  _cachedToken = token;
  _tokenRead = true;
  if (token) tokenStorage.setItem('ba_session_token', token);
  else tokenStorage.deleteItem('ba_session_token');
}

function getBetterAuthClient() {
  if (!_betterAuthClient) {
    _betterAuthClient = createAuthClient({
      baseURL: API_BASE.replace(/\/api\/?$/, ''),
      basePath: '/api/auth',
      plugins: [twoFactorClient(), passkeyClient()],
      fetchOptions: {
        credentials: 'include',
        // React Native fetch does not supply Origin automatically. Better Auth
        // requires it for CSRF checks on POSTs such as TOTP verification.
        ...(Platform.OS !== 'web' ? { headers: { Origin: new URL(API_BASE).origin } } : {}),
        auth: { type: 'Bearer', token: () => _cachedToken || '' },
        onSuccess: (context: any) => {
          const token = context.response.headers.get('set-auth-token');
          if (token) setCachedToken(token);
        },
      },
    });
  }
  return _betterAuthClient;
}

async function ensureAuthTokenLoaded() {
  await getToken();
  return getBetterAuthClient();
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
      const error = new Error(`${msg}${detail}`) as Error & { code?: string };
      error.code = data.code;
      throw error;
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

// Better Auth error bodies vary: { message } | { error: string } | { error: { code, message } } | { code }.
const authErrorMessage = (body: any, fallback: string): string => {
  const raw = body?.message ?? body?.error ?? body?.code;
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (raw && typeof raw === 'object') {
    const nested = raw.message ?? raw.code;
    if (typeof nested === 'string' && nested.trim()) return nested;
  }
  return fallback;
};

/**
 * Extract session token from Better Auth response.
 * Better Auth sets the token in cookies (web) or returns it in the body.
 * We grab it from Set-Cookie header or response body.
 */
function extractSessionToken(res: Response, body: any): string | null {
  // Better Auth's bearer plugin exposes the session token in this header.
  const bearerToken = res.headers.get('set-auth-token');
  if (bearerToken) return bearerToken;
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
  const token = await getToken();
  const origin = (() => {
    try { return new URL(API_BASE).origin; } catch { return 'https://maurmaket.onrender.com'; }
  })();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Origin': origin,
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers, credentials: 'include' });
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
      ...(dateOfBirth ? { dateOfBirth } : {}),
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
  if (!token) {
    // Do not let a previous login's token make the profile request look like
    // this sign-in succeeded. Better Auth's bearer plugin returns fresh tokens
    // in `set-auth-token`; a successful response without one is incomplete.
    await clearSessionToken();
    throw new Error('Sign-in succeeded, but the server did not return a session token. Please try again.');
  }
  setCachedToken(token);

  // Bootstrap the app profile after Better Auth has created the auth record.
  try {
    const profileRes = await request('/user/profile/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ fullName, email: normalizedEmail, phone, dateOfBirth, username }),
    });
    return { ...(profileRes as any), token };
  } catch (cause) {
    // Better Auth has created the account and stored DOB, but the user must
    // not enter the app until the remaining profile bootstrap succeeds.
    const error = new Error('Your account was created, but profile setup did not finish. Retry profile setup to continue.') as Error & { code?: string; cause?: unknown };
    error.code = 'PROFILE_BOOTSTRAP_FAILED';
    error.cause = cause;
    throw error;
  }
};

export const retrySignupProfileBootstrap = async (
  fullName: string,
  email: string,
  phone: string,
  dateOfBirth?: string,
  username?: string,
) => {
  const profile = await request('/user/profile/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ fullName, email: email.trim().toLowerCase(), phone, dateOfBirth, username }),
  });
  return { ...(profile as any), token: await getToken() };
};

export const resendVerificationEmail = async (email: string) => {
  const { res, body } = await authFetch('/auth/send-verification-email', {
    method: 'POST',
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      callbackURL: getAuthRedirectUrl(),
    }),
  });
  const errorText = [
    body?.code,
    body?.message,
    typeof body?.error === 'string' ? body.error : body?.error?.code,
  ].filter(Boolean).join(' ');
  if (/EMAIL_ALREADY_VERIFIED|email.{0,30}already verified/i.test(errorText)) {
    return { success: false, alreadyVerified: true };
  }
  if (!res.ok) throw new Error(body?.message || body?.error || 'Failed to resend verification email');
  return { success: body?.status !== false, alreadyVerified: false };
};

export const login = async (email: string, password: string) => {
  const normalizedEmail = email.trim().toLowerCase();

  // Better Auth sign-in
  const { res, body } = await authFetch('/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email: normalizedEmail, password }),
  });

  if (body?.twoFactorRedirect) {
    return { requiresTwoFactor: true, twoFactorMethods: body.twoFactorMethods || ['totp'] };
  }
  if (!res.ok) {
    // APP-Q380: repeated failures are throttled and the wording never reveals
    // whether the account exists or which factor was wrong. Only the genuine
    // "too many attempts" state is surfaced distinctly, so the UI can explain
    // the wait and point at safe recovery (password reset) instead of
    // implying the account or password is definitely wrong.
    const errorText = [body?.message, body?.error].filter(Boolean).join(' ');
    if (res.status === 429 || /too many/i.test(errorText)) {
      const rateLimited = new Error('Too many sign-in attempts') as Error & { code?: string; status?: number };
      rateLimited.code = 'TOO_MANY_ATTEMPTS';
      rateLimited.status = 429;
      throw rateLimited;
    }
    const invalid = new Error('Invalid email or password') as Error & { code?: string };
    invalid.code = 'INVALID_CREDENTIALS';
    throw invalid;
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

// Batch 74 / APP-Q379 — `trustDevice` is the user's explicit "remember this
// device" choice. Better Auth stores the trust for the bounded window configured
// in src/config/auth.js (see src/utils/trustedDevices.js for the same number the
// UI labels) and the record is listed and revocable in Settings → Security.
export const completeTwoFactorLogin = async (code: string, backupCode = false, trustDevice = false) => {
  const client = await ensureAuthTokenLoaded();
  const result = backupCode
    ? await client.twoFactor.verifyBackupCode({ code, trustDevice })
    : await client.twoFactor.verifyTotp({ code, trustDevice });
  if (result.error) throw new Error(result.error.message || 'The verification code was not accepted.');
  const token = _cachedToken;
  const profile = await getMe() as any;
  return { ...profile, token };
};

export interface BetterAuthSecuritySession {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export const getSecuritySnapshot = async () => {
  const client = await ensureAuthTokenLoaded();
  const [sessionResult, sessionsResult, accountsResult, passkeysResult] = await Promise.all([
    client.getSession(),
    client.listSessions(),
    client.listAccounts(),
    client.passkey.listUserPasskeys(),
  ]);
  for (const result of [sessionResult, accountsResult, passkeysResult] as any[]) {
    if (result?.error) throw new Error(result.error.message || 'Could not load account security details.');
  }
  const sessionsRequireFreshAuth = Boolean(sessionsResult?.error && Number(sessionsResult.error.status) === 403);
  if (sessionsResult?.error && !sessionsRequireFreshAuth) {
    throw new Error(sessionsResult.error.message || 'Could not load signed-in devices.');
  }
  const sessionData: any = sessionResult.data;
  if (!sessionData?.session?.id || !sessionData?.user?.id) {
    throw new Error('No active Better Auth session was found for this account.');
  }
  if ((!sessionsRequireFreshAuth && !Array.isArray(sessionsResult.data)) || !Array.isArray(accountsResult.data) || !Array.isArray(passkeysResult.data)) {
    throw new Error('Better Auth returned an unexpected account security response.');
  }
  return {
    currentSession: sessionData.session,
    user: sessionData.user,
    sessions: (sessionsRequireFreshAuth ? [] : sessionsResult.data) as BetterAuthSecuritySession[],
    sessionsRequireFreshAuth,
    accounts: accountsResult.data,
    passkeys: passkeysResult.data,
  };
};

export const enableAuthenticator = async (password: string) => {
  const { res, body } = await authFetch('/auth/two-factor/enable', {
    method: 'POST',
    body: JSON.stringify({ password, method: 'totp', issuer: 'MaurMaket' }),
  });
  if (!res.ok) throw new Error(body?.message || body?.error || 'Could not start authenticator setup.');
  return body as { totpURI: string; backupCodes: string[] };
};

// Enabling the authenticator never creates a trust record: the account is
// already signed in on this device, so "remember this device" would be
// meaningless here and would silently shorten a future challenge.
export const verifyAuthenticator = async (code: string) => {
  const { res, body } = await authFetch('/auth/two-factor/verify-totp', {
    method: 'POST', body: JSON.stringify({ code, trustDevice: false }),
  });
  if (!res.ok) throw new Error(body?.message || body?.error || 'That authenticator code was not accepted.');
  return body;
};

// Batch 76 / APP-Q390 — turning the authenticator off goes through our server so
// the password is re-confirmed, the change is recorded in the private security
// history, and the owner is alerted. Better Auth rotates the session when the
// authenticator is disabled, so the rotated bearer token has to be captured
// here or the client would keep presenting a deleted session.
export const disableAuthenticator = async (password: string) => {
  const { res, body } = await authFetch('/account/second-factor/authenticator/disable', {
    method: 'POST', body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const error = new Error(body?.error || body?.message || 'Could not turn off two-step verification.') as Error & { code?: string };
    error.code = body?.code;
    throw error;
  }
  const rotatedToken = res.headers.get('set-auth-token');
  if (rotatedToken) setCachedToken(rotatedToken);
  return body;
};

export const revokeAuthSession = async (token: string) => {
  const client = await ensureAuthTokenLoaded();
  const result = await client.revokeSession({ token });
  if (result.error) throw new Error(result.error.message || 'Could not sign out that device.');
  return result.data;
};

// Batch 73 / APP-Q369 — the caller's own private security activity history.
// Structured events so the screen renders them in the active app language.
export const getSecurityEvents = () =>
  request<{ events: SecurityEvent[]; retention_days: number; max_events: number }>('/security/events');

// Batch 75 — who opened this account's identity evidence, and why. The server
// returns display-safe rows only (a team label, never a staff identity), and an
// empty list is a real answer: nobody has opened the file.
export const getKycEvidenceAccess = () =>
  request<{ entries: KycEvidenceAccessEntry[]; retention_days: number }>('/verification/evidence-access');

// Batch 74 / APP-Q379 — trusted devices ("remember this device").
// Read, revoke one, or revoke all. Revocation only ever tightens the account: it
// removes the stored trust record so the device is asked for a code again at the
// next sign-in. Trust never verifies identity or authorizes a payment or payout.
export const getTrustedDevices = () =>
  request<{ devices: TrustedDevice[]; duration_days: number }>('/security/trusted-devices');

export const revokeTrustedDevice = (id: string) =>
  request<{ revoked: number }>(
    `/security/trusted-devices/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );

export const revokeAllTrustedDevices = () =>
  request<{ revoked: number }>('/security/trusted-devices', { method: 'DELETE' });

// Batch 75 / APP-Q395 — private names for the caller's own signed-in devices.
// Display-only and owner-private: a label never verifies a device, never
// replaces the system device/date facts shown beside it, and never affects what
// the account trusts. Saving one is not a security event, so it records nothing
// and alerts no one.
export const getDeviceLabels = () =>
  request<{ labels: { session_id: string; label: string }[]; max_length: number }>('/security/device-labels');

/** An empty label clears the private name and restores the system device name. */
export const saveDeviceLabel = (sessionId: string, label: string) =>
  request<{ session_id: string; label: string | null; cleared: boolean }>(
    `/security/device-labels/${encodeURIComponent(sessionId)}`,
    { method: 'PUT', body: JSON.stringify({ label }) }
  );

// Batch 73/74/75 — fast account freeze for suspected compromise (APP-Q371).
export const getAccountFreeze = () =>
  request<AccountFreezeState>('/account/freeze');

export const freezeAccount = (reason?: string) =>
  request<AccountFreezeState>('/account/freeze', {
    method: 'POST',
    body: JSON.stringify({ reason: reason || undefined }),
  });

// Restoring re-confirms the password when the account has one.
export const unfreezeAccount = (password?: string) =>
  request<AccountFreezeState>('/account/unfreeze', {
    method: 'POST',
    body: JSON.stringify({ password: password || undefined }),
  });

export const addAccountPasskey = async (name: string) => {
  const client = await ensureAuthTokenLoaded();
  const result = await client.passkey.addPasskey({ name, authenticatorAttachment: 'platform' });
  if (result.error) throw new Error(result.error.message || 'Could not add a passkey.');
  return result.data;
};

// Batch 76 / APP-Q390 — passkey removal is gated on a fresh password
// confirmation and a recovery-path check, then recorded and alerted. Better
// Auth's own endpoint only trusts the existing session, so this must not use
// the passkey client directly.
export const deleteAccountPasskey = async (id: string, password?: string) =>
  request<{ status: boolean }>(
    `/account/second-factor/passkey/${encodeURIComponent(id)}/remove`,
    { method: 'POST', body: JSON.stringify({ password: password || undefined }) }
  );

export const linkGoogleAccount = async () => {
  const client = await ensureAuthTokenLoaded();
  if (Platform.OS !== 'web') {
    const google = await googleAuthInfo() as { googleIdToken?: string };
    if (!google.googleIdToken) throw new Error('Google did not provide a linkable account token.');
    const result = await client.linkSocial({ provider: 'google', idToken: { token: google.googleIdToken } });
    if (result.error) throw new Error(result.error.message || 'Could not link Google.');
    return result.data;
  }
  const callbackURL = typeof window !== 'undefined' ? window.location.href : undefined;
  const result = await client.linkSocial({ provider: 'google', callbackURL });
  if (result.error) throw new Error(result.error.message || 'Could not start Google linking.');
  return result.data;
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
  const client = await ensureAuthTokenLoaded();
  const result = await client.signIn.passkey({});
  if (result.error) throw new Error(result.error.message || 'Passkey sign-in failed');
  const body: any = result.data || {};
  const token = _cachedToken || body?.session?.token;
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

// Forgot / Reset Password via Better Auth emailOTP (6-digit code flow).
// The screen collects a code, so we use the emailOTP endpoints rather than
// the core link-based /forget-password (which doesn't exist) — 404 before.
export const forgotPassword = async (email: string, _language?: string) => {
  const { res, body } = await authFetch('/auth/email-otp/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  if (!res.ok) throw new Error(authErrorMessage(body, 'Failed to send reset code'));
  return { sent: true };
};

export const resetPassword = async (email: string, code: string, newPassword: string) => {
  const { res, body } = await authFetch('/auth/email-otp/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      otp: code,
      password: newPassword,
    }),
  });
  if (!res.ok) throw new Error(authErrorMessage(body, 'Failed to reset password'));
  return { updated: true };
};

export const updateProfile = (data: Record<string, any>) =>
  request('/user/profile', { method: 'PUT', body: JSON.stringify(data) });

// Batch 74/75 — data export lifecycle (APP-Q379–APP-Q391). The old synchronous
// `exportAccountData()` was replaced by these: a count-only summary, a
// deliberate identity-confirmed export job, private status/expiry, cancellation
// while generating, and a safe retry that starts a fresh job.
export const getDataExportSummary = () => request<DataExportSummary>('/user/export/summary');

export const getDataExportJobs = () =>
  request<{ jobs: ExportJob[]; has_password: boolean; ttl_days: number }>('/user/export/jobs');

export const getDataExportJob = (id: string) =>
  request<{ job: ExportJob }>(`/user/export/${encodeURIComponent(id)}`);

export const startDataExport = (password?: string) =>
  request<{ job: ExportJob; has_password: boolean; ttl_days: number }>('/user/export', {
    method: 'POST',
    body: JSON.stringify({ password: password || undefined }),
  });

export const downloadDataExport = (id: string) =>
  request<{ job: ExportJob; data: Record<string, unknown> }>(
    `/user/export/${encodeURIComponent(id)}/download`
  );

export const cancelDataExport = (id: string) =>
  request<{ job: ExportJob }>(`/user/export/${encodeURIComponent(id)}/cancel`, { method: 'POST' });

export const retryDataExport = (id: string, password?: string) =>
  request<{ job: ExportJob; has_password: boolean; ttl_days: number; retried_from: string }>(
    `/user/export/${encodeURIComponent(id)}/retry`,
    { method: 'POST', body: JSON.stringify({ password: password || undefined }) }
  );

// Policy transparency & consent (Batch 72, APP-Q356–APP-Q365).
export const getPolicies = (locale?: string) =>
  request<PolicyState>(`/policies${locale ? `?locale=${encodeURIComponent(locale)}` : ''}`);

export const acceptPolicy = (kind: string, version: string) =>
  request<{ kind: string; version: string; accepted_at: string | null }>(
    `/policies/${encodeURIComponent(kind)}/accept`,
    { method: 'POST', body: JSON.stringify({ version }) }
  );

export const dismissPolicyNotice = (kind: string, version: string) =>
  request<{ kind: string; version: string; dismissed_at: string | null }>(
    `/policies/${encodeURIComponent(kind)}/dismiss`,
    { method: 'POST', body: JSON.stringify({ version }) }
  );

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

export const updateSellerProfile = (data: Record<string, string | boolean | string[] | null>) =>
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
export const getNatCashAvailability = (sellerIds: string[]) =>
  request(`/checkout/natcash-availability?sellerIds=${encodeURIComponent(sellerIds.join(','))}`);
export const getPopularMeetupSpots = (sellerIds: string[]) =>
  request(`/checkout/popular-meetup-spots?sellerIds=${encodeURIComponent(sellerIds.join(','))}`);
export const confirmMeetupPlace = (orderId: string, sellerId: string) =>
  request(`/orders/${orderId}/meetup/place-confirm`, { method: 'POST', body: JSON.stringify({ sellerId }) });
export const reportMeetupPlace = (orderId: string, sellerId: string, reason: string, details?: string) =>
  request(`/orders/${orderId}/meetup/place-report`, { method: 'POST', body: JSON.stringify({ sellerId, reason, details }) });

export const checkPendingStatus = (pendingId: string) =>
  request(`/checkout/pending/${pendingId}/status`);

export const getSellerFulfillmentProposals = () => request('/seller/fulfillment-proposals');
export const getPendingAgreements = (pendingId: string) => request(`/checkout/pending/${pendingId}/agreements`);
export const removePendingCheckoutSeller = (pendingId: string, sellerId: string) =>
  request(`/checkout/pending/${pendingId}/sellers/${sellerId}`, { method: 'DELETE' });
export const decideBuyerFulfillment = (pendingId: string, sellerId: string, decision: 'accept' | 'counter' | 'cancel', payload: Record<string, unknown> = {}) =>
  request(`/checkout/pending/${pendingId}/agreements/${sellerId}/buyer-decision`, { method: 'PUT', body: JSON.stringify({ decision, ...payload }) });
export const counterSellerFulfillment = (pendingId: string, sellerId: string, location: Record<string, unknown>, meetupAt: string) =>
  request(`/checkout/pending/${pendingId}/agreements/${sellerId}/counter`, { method: 'POST', body: JSON.stringify({ location, meetupAt }) });
export const getNatCashAccess = () => request('/natcash-access');
export const createNatCashAccessPayment = () => request('/natcash-access/payment', { method: 'POST', body: JSON.stringify({}) });
export const pauseNatCashAccess = () => request('/natcash-access/pause', { method: 'POST', body: JSON.stringify({}) });
export const reactivateNatCashAccess = () => request('/natcash-access/reactivate', { method: 'POST', body: JSON.stringify({}) });
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
export const confirmNatCashReceived = (orderId: string) =>
  request(`/orders/${orderId}/confirm-natcash-received`, { method: 'POST', body: JSON.stringify({}) });
export const reportNatCashNotReceived = (orderId: string) =>
  request(`/orders/${orderId}/report-natcash-not-received`, { method: 'POST', body: JSON.stringify({}) });

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

export const cancelOrder = (orderId: string, scope?: { scope: 'seller' | 'order'; sellerId?: string }) =>
  request(`/orders/${orderId}/cancel`, { method: 'PUT', body: JSON.stringify(scope || {}) });
export const sellerCancelOrder = (orderId: string, data: { reason: string; details?: string }) =>
  request(`/orders/${orderId}/seller-cancel`, { method: 'PUT', body: JSON.stringify(data) });
export const requestOrderCancellation = (orderId: string, data: { sellerId: string; reason: string; details?: string }) =>
  request(`/orders/${orderId}/cancellation-requests`, { method: 'POST', body: JSON.stringify(data) });
export const respondToCancellationRequest = (orderId: string, requestId: string, decision: 'accept' | 'decline') =>
  request(`/orders/${orderId}/cancellation-requests/${requestId}/respond`, { method: 'PUT', body: JSON.stringify({ decision }) });
export const withdrawCancellationRequest = (orderId: string, requestId: string) =>
  request(`/orders/${orderId}/cancellation-requests/${requestId}/withdraw`, { method: 'PUT' });

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

export const refundEscrow = (orderId: string, reason = 'Buyer requested a refund because the meetup did not complete.') =>
  request(`/orders/${orderId}/escrow/refund`, { method: 'POST', body: JSON.stringify({ reason }) });

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
export const getSellerDebts = () => request('/seller/debts');
export const createSellerDebtPayment = () => request('/seller/debts/pay', { method: 'POST' });
export const checkSellerDebtPayment = (paymentId: string) => request(`/seller/debts/payments/${paymentId}`);
export const getAdminMonCashRefunds = async () => {
  const results = await Promise.all(['pending', 'processing', 'failed', 'completed'].map(status =>
    request(`/admin/moncash/refunds?status=${status}`) as Promise<{ refunds: any[] }>
  ));
  return { refunds: results.flatMap(result => result.refunds || []) };
};
export const approveAdminMonCashRefund = (id: string, receiverPhone: string, reason: string) =>
  request(`/admin/moncash/refunds/${id}/approve`, { method: 'POST', body: JSON.stringify({ receiverPhone, reason }) });
export const getAdminMonCashProcessing = () => request('/admin/moncash/transfers/processing');
export const reconcileAdminMonCashTransfer = (kind: string, id: string, providerReference: string, outcome: 'completed' | 'failed', note: string) =>
  request(`/admin/moncash/transfers/${kind}/${id}/reconcile`, { method: 'POST', body: JSON.stringify({ providerReference, outcome, note }) });
export const getAdminMonCashLegacyTransfers = () => request('/admin/moncash/legacy-transfers');
export const confirmAdminMonCashLegacyTransfer = (kind: string, id: string, providerReference: string, note: string) =>
  request(`/admin/moncash/legacy-transfers/${kind}/${id}/confirm`, { method: 'POST', body: JSON.stringify({ providerReference, note }) });
export const requestPayout = (amount: number) =>
  request('/seller/payouts/request', { method: 'POST', body: JSON.stringify({ amount }) });
export const getSellerAnalytics = () => request('/seller/analytics');
export const getLowStockProducts = () => request('/seller/products/low-stock');

// Listing management (Add Product experience)
export const getSellerListings = () => request('/seller/listings');
export const createListingDraft = (data: Record<string, unknown>) =>
  request('/listings/drafts', { method: 'POST', body: JSON.stringify(data) });
export const getListingDrafts = () => request('/listings/drafts');
export const getListingDraft = (id: string) => request(`/listings/drafts/${id}`);
export const updateListingDraft = (id: string, data: Record<string, unknown>) =>
  request(`/listings/drafts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteListingDraft = (id: string) =>
  request(`/listings/drafts/${id}`, { method: 'DELETE' });
export const pauseListing = (id: string) =>
  request(`/products/${id}/pause`, { method: 'POST' });
export const resumeListing = (id: string) =>
  request(`/products/${id}/resume`, { method: 'POST' });
export const resubmitListing = (id: string, data: Record<string, unknown>) =>
  request(`/products/${id}/resubmit`, { method: 'POST', body: JSON.stringify(data) });
export const appealListing = (id: string, note: string) =>
  request(`/products/${id}/appeal`, { method: 'POST', body: JSON.stringify({ note }) });
export const duplicateListing = (id: string) =>
  request(`/products/${id}/duplicate`, { method: 'POST' });
export const getSellerListingStats = (id: string) => request(`/products/${id}/seller-stats`);

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

export const editReview = (reviewId: string, rating?: number, comment?: string) =>
  request(`/reviews/${reviewId}`, { method: 'PUT', body: JSON.stringify({ rating, comment }) });

export const deleteReview = (reviewId: string) =>
  request(`/reviews/${reviewId}`, { method: 'DELETE' });

export const replyToReview = (reviewId: string, reply: string) =>
  request(`/reviews/${reviewId}/reply`, { method: 'POST', body: JSON.stringify({ reply }) });

export const editReviewReply = (reviewId: string, reply: string) =>
  request(`/reviews/${reviewId}/reply`, { method: 'PUT', body: JSON.stringify({ reply }) });

export const reportReview = (reviewId: string, reason: string, details?: string, targetType: 'review' | 'reply' = 'review') =>
  request(`/reviews/${reviewId}/report`, { method: 'POST', body: JSON.stringify({ reason, details, targetType }) });

// On-demand content translation (reviews). The client hides the translate
// affordance while the server reports no provider is configured, so users never
// see a button that cannot work.
export const getTranslationStatus = () =>
  request('/translate/status') as Promise<{ available: boolean; target_languages: string[] }>;

export const translateText = (text: string, targetLang: string) =>
  request('/translate', { method: 'POST', body: JSON.stringify({ text, targetLang }) }) as Promise<{ translated_text: string; target_lang: string }>;

export const reportUser = (userId: string, reason: string, details?: string) =>
  request(`/users/${userId}/report`, { method: 'POST', body: JSON.stringify({ reason, details }) });

export const submitReport = (payload: UserReportPayload) =>
  request('/reports', { method: 'POST', body: JSON.stringify(payload) });

export const pinListing = (productId: string | null) =>
  request('/seller/pin-listing', { method: 'POST', body: JSON.stringify({ productId }) });

export const getBlockedUsers = () =>
  request<{ blockedUsers: BlockedUser[] }>('/users/blocked');

export const unblockUser = (userId: string) =>
  request(`/api/users/${userId}/block`, { method: 'DELETE' });


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
  deliveryFeeType: 'free' | 'flat' | 'distance' | 'per_distance';
  flatDeliveryFee: number;
  distanceFeeRules: Array<{ maxDistanceMeters: number; fee: number }>;
  distanceStepMeters: number;
  distanceStepFee: number;
};

export const getSellerFulfillmentProfile = () => request('/seller/fulfillment-profile');
export const updateSellerFulfillmentProfile = (data: Partial<SellerFulfillmentProfile>) =>
  request('/seller/fulfillment-profile', { method: 'PUT', body: JSON.stringify(data) });

export const toggleSellerVisibility = (isVisible: boolean) =>
  request('/seller/location', { method: 'PUT', body: JSON.stringify({ isVisible }) });

// Notifications
export const getNotifications = (filter?: string) =>
  request(`/notifications${filter ? `?filter=${encodeURIComponent(filter)}` : ''}`);
export const getUnreadCount = () => request('/notifications/unread-count');
export const markNotificationRead = (id: string) =>
  request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PUT' });
export const markAllNotificationsRead = () =>
  request('/notifications/read-all', { method: 'PUT' });
export const dismissNotification = (id: string) =>
  request(`/notifications/${encodeURIComponent(id)}/dismiss`, { method: 'PUT' });
export const undoDismissNotification = (id: string) =>
  request('/notifications/dismiss-undo', { method: 'POST', body: JSON.stringify({ id }) });
export const clearReadNotifications = () =>
  request('/notifications/read', { method: 'DELETE' });
export const getNotificationPreferences = () =>
  request('/notifications/preferences');
export const updateNotificationPreferences = (preferences: Partial<NotificationPreferences>) =>
  request('/notifications/preferences', { method: 'PUT', body: JSON.stringify(preferences) });
export const muteSellerUpdates = (sellerId: string, muted: boolean) =>
  request('/notifications/mute-seller', { method: 'POST', body: JSON.stringify({ sellerId, muted }) });

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
export const sendMessage = (conversationId: string, content: string, imageUrl?: string, clientId?: string, audioUrl?: string, audioDuration?: number) =>
  request(`/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content, imageUrl, messageType: audioUrl ? 'audio' : imageUrl ? 'image' : 'text', clientId, audioUrl, audioDuration }) });
export const getConversationUnreadCount = () => request('/conversations/unread-count');
export type ConversationMediaItem = { id: string; sender_id: string; image_url: string; created_at: string };
export const getConversationMedia = (conversationId: string) =>
  request(`/conversations/${conversationId}/media`) as Promise<{ media: ConversationMediaItem[] }>;
export type LinkPreviewData = { url: string; title?: string | null; description?: string | null; image?: string | null; siteName?: string | null };
export const getLinkPreview = (url: string) =>
  request(`/link-preview?url=${encodeURIComponent(url)}`) as Promise<{ preview: LinkPreviewData | null }>;
export const sendTyping = (conversationId: string) =>
  request(`/conversations/${conversationId}/typing`, { method: 'POST' });
export const getTypingStatus = (conversationId: string) =>
  request(`/conversations/${conversationId}/typing`);
export const getDeliveryStatuses = (conversationId: string) =>
  request(`/conversations/${conversationId}/delivery-status`) as Promise<{ statuses: { id: string; status: 'sent' | 'delivered' | 'read' }[] }>;
export const getPresence = (userId: string) =>
  request(`/users/${userId}/presence`) as Promise<{ online: boolean; lastSeen: string | null }>;
export const getPresenceVisibility = () =>
  request('/users/me/presence-visibility') as Promise<{ visibility: 'everyone' | 'chatted_with' | 'nobody' }>;
export const setPresenceVisibility = (visibility: 'everyone' | 'chatted_with' | 'nobody') =>
  request('/users/me/presence-visibility', { method: 'PUT', body: JSON.stringify({ visibility }) });
export const sendProductCard = (conversationId: string, productId: string) =>
  request(`/conversations/${conversationId}/products`, { method: 'POST', body: JSON.stringify({ productId }) });

// Offers
export const sendOffer = (conversationId: string, data: { productId: string; offeredPrice: number; quantity: number }) =>
  request(`/conversations/${conversationId}/offer`, { method: 'POST', body: JSON.stringify(data) });
export const respondToOffer = (messageId: string, action: 'accepted' | 'declined') =>
  request(`/offers/${messageId}/respond`, { method: 'POST', body: JSON.stringify({ action }) });
export const counterOffer = (messageId: string, offeredPrice: number) =>
  request(`/offers/${messageId}/counter`, { method: 'POST', body: JSON.stringify({ offeredPrice }) });
export const markOfferSeen = (messageId: string) => request(`/offers/${messageId}/seen`, { method: 'PUT' });
export const getSellerItems = (sellerId: string) =>
  request(`/sellers/${sellerId}/items`);
export const searchSellersForChat = (query: string) =>
  request(`/sellers/search?q=${encodeURIComponent(query)}`) as Promise<{ sellers: any[] }>;
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
export const sendMessageWithReply = (conversationId: string, content: string, replyToId?: string, imageUrl?: string, clientId?: string, audioUrl?: string, audioDuration?: number) =>
  request(`/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content, imageUrl, messageType: audioUrl ? 'audio' : imageUrl ? 'image' : 'text', replyToId, clientId, audioUrl, audioDuration }) });
export const markConversationRead = (conversationId: string) =>
  request(`/conversations/${conversationId}/read`, { method: 'PUT' });
export const pinConversation = (conversationId: string) =>
  request(`/conversations/${conversationId}/pin`, { method: 'PUT' });
export const muteConversation = (conversationId: string, durationHours: number | null, enabled = true) =>
  request(`/conversations/${conversationId}/mute`, { method: 'PUT', body: JSON.stringify({ durationHours, enabled }) });
export const blockUser = (userId: string) =>
  request(`/users/${userId}/block`, { method: 'POST' });
export const reportConversationUser = (conversationId: string, reason: string, details?: string) =>
  request(`/conversations/${conversationId}/report`, { method: 'POST', body: JSON.stringify({ reason, details }) });

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

function guessAudioMime(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.3gp')) return 'audio/3gpp';
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.mp4') || lower.endsWith('.m4a')) return 'audio/mp4';
  if (Platform.OS === 'web') return 'audio/webm';
  return 'audio/mp4';
}

async function fileToAudioDataUri(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return uri;
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to read audio file'));
      reader.readAsDataURL(blob);
    });
  }
  const FileSystem = require('expo-file-system/legacy');
  const base64: string = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  return `data:${guessAudioMime(uri)};base64,${base64}`;
}

export const uploadAudio = async (uri: string): Promise<{ url: string }> => {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const dataUri = await fileToAudioDataUri(uri);
  const res = await fetch(`${API_BASE}/upload-audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ audio: dataUri }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Voice note upload failed (${res.status})`);
  return { url: data.url };
};

export const uploadImage = async (uri: string, expiration?: number, purpose?: 'kyc'): Promise<{ url: string; width?: number; height?: number; deleteUrl?: string }> => {
  console.log(`[UPLOAD-DEBUG] uploadImage called, uri=${uri?.substring(0, 80)}, expiration=${expiration}`);
  // Use the same Better Auth token source as request(). `mm_token` is a
  // retired key and is cleared when the current session is stored.
  const token = await getToken();
  if (!token) {
    console.log(`[UPLOAD-DEBUG] ❌ No auth token found`);
    throw new Error('Not authenticated');
  }

  console.log(`[UPLOAD-DEBUG] Calling resizeAndConvert...`);
  const { base64 } = await resizeAndConvert(uri);
  console.log(`[UPLOAD-DEBUG] resizeAndConvert done, base64 length=${base64?.length}`);

  // Send to backend — Supabase Storage primary, then R2/imgBB fallback
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ image: `data:image/jpeg;base64,${base64}`, expiration, purpose }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`[UPLOAD-DEBUG] Server upload failed, status=${res.status}, error=${data.error || 'unknown error'}`);
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
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

export const getRealtimeTopic = () =>
  request('/realtime/topic') as Promise<{ enabled: boolean; topic?: string }>;
