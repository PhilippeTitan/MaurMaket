import { Platform } from 'react-native';
import type { User, CartItem, CartSyncIssue, CartSyncNotice } from './types';
import { setCachedToken, clearSessionToken } from './api';
import { clearAccountDeviceData } from './signOutCleanup';
import { CART_ACCOUNT_KEY, CART_GUEST_KEY, cartLineKey as cartLineKeyOf, cartNeedsPush, mergeCarts, toCartPayload } from './utils/cartSync.js';
import { applyAppearanceMode, type AppearanceMode } from './theme';

type Listener = () => void;

/**
 * Identity of a cart line: product id, or product+variant when options differ.
 * Defined in src/utils/cartSync.js so the sync layer and every screen agree on
 * what counts as the same line (Batch 75 / APP-Q097).
 */
export const cartLineKey = (c: Pick<CartItem, 'id' | 'variantId'>) => cartLineKeyOf(c);

interface StoreState {
  user: User | null;
  token: string | null;
  cart: CartItem[];
  /** What the account cart said it could not keep, for the cart screen to explain. */
  cartIssues: CartSyncNotice[];
  followedSellerIds: Set<string>;
  followerCount: number;
  followingCount: number;
  appearanceMode: AppearanceMode;
  lowDataMode: boolean;
  listeners: Listener[];
}

const isWeb = Platform.OS === 'web';

const storage = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) return localStorage.getItem(key);
    const SecureStore = require('expo-secure-store');
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) { localStorage.setItem(key, value); return; }
    const SecureStore = require('expo-secure-store');
    return SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string): Promise<void> {
    if (isWeb) { localStorage.removeItem(key); return; }
    const SecureStore = require('expo-secure-store');
    return SecureStore.deleteItemAsync(key);
  },
};

const state: StoreState = {
  user: null,
  token: null,
  cart: [],
  cartIssues: [],
  followedSellerIds: new Set(),
  followerCount: 0,
  followingCount: 0,
  appearanceMode: 'system',
  lowDataMode: false,
  listeners: [],
};

let usernamePromptPending = false;

function notify() {
  state.listeners.forEach(fn => fn());
}

export const store = {
  get user() { return state.user; },
  get token() { return state.token; },
  get cart() { return state.cart; },
  get isLoggedIn() { return !!state.token; },
  get isSeller() { return state.user?.role === 'seller'; },
  get isEmailVerified() { return !!state.user?.email_verified; },
  markUsernamePromptPending() { usernamePromptPending = true; },
  consumeUsernamePrompt() {
    const pending = usernamePromptPending;
    usernamePromptPending = false;
    return pending;
  },
  get cartIssues() { return state.cartIssues; },
  clearCartIssues() {
    if (state.cartIssues.length === 0) return;
    state.cartIssues = [];
    notify();
  },
  get followedSellerIds() { return state.followedSellerIds; },
  get followerCount() { return state.followerCount; },
  get followingCount() { return state.followingCount; },
  get appearanceMode() { return state.appearanceMode; },
  isFollowing(sellerId: string) { return state.followedSellerIds.has(sellerId); },

  async init() {
    const [tokenStr, userStr, cartStr, accountCartStr, appearanceStr, lowDataStr] = await Promise.all([
      storage.getItem('ba_session_token'),
      storage.getItem('mm_user'),
      storage.getItem(CART_GUEST_KEY),
      storage.getItem(CART_ACCOUNT_KEY),
      storage.getItem('mm_appearance_mode'),
      storage.getItem('mm_low_data_mode'),
    ]);
    state.appearanceMode = appearanceStr === 'light' || appearanceStr === 'dark' ? appearanceStr : 'system';
    applyAppearanceMode(state.appearanceMode);
    state.lowDataMode = lowDataStr === 'true';
    if (tokenStr) {
      state.token = tokenStr;
      setCachedToken(tokenStr);
    }
    // APP-Q097: a signed-in session starts from the account's own cart; the guest
    // cart is the fallback (and is merged into the account on hydration).
    const cartSource = (tokenStr && accountCartStr) ? accountCartStr : cartStr;
    if (cartSource) {
      try { state.cart = JSON.parse(cartSource); } catch { /* ignore */ }
    }
    if (userStr) {
      try { state.user = JSON.parse(userStr); } catch { /* ignore */ }
    }
  },

  async setAppearanceMode(mode: AppearanceMode) {
    state.appearanceMode = mode;
    applyAppearanceMode(mode);
    await storage.setItem('mm_appearance_mode', mode);
    notify();
  },

  async setUser(user: User | null, token: string | null) {
    state.user = user;
    state.token = token;
    setCachedToken(token);
    await storage.deleteItem('mm_token');
    // Persist user whenever present (even without token, e.g. pending email confirmation).
    // Only clear on explicit logout (user === null).
    if (user) await storage.setItem('mm_user', JSON.stringify(user));
    else await storage.deleteItem('mm_user');
    notify();
    // APP-Q097: signing in hands the device's cart to the account (merged, never
    // replaced by a half-remembered server copy). Fire-and-forget: a failed sync
    // must not hold up the sign-in the user just completed.
    if (user && token) void store.hydrateAccountCart();
  },

  /**
   * Reconcile this device's cart with the account's cart: union by line, larger
   * quantity per shared line, server data for shared lines. The guest cart is
   * folded into the account and cleared, so the next sign-in on this device starts
   * from the account's cart rather than re-merging the same items.
   *
   * Best-effort: offline, the device cart simply stays what it is and syncs on the
   * next cart change or sign-in.
   */
  async hydrateAccountCart() {
    if (!state.token || !state.user) return;
    const { getAccountCart, pushAccountCart } = require('./api');
    try {
      const res = await getAccountCart() as { items: CartItem[] };
      const remote = res?.items || [];
      const merged = mergeCarts(state.cart, remote) as CartItem[];
      state.cart = merged;
      await storage.setItem(CART_ACCOUNT_KEY, JSON.stringify(merged));
      // The device's own cart has now been handed over; keep nothing behind that
      // would be merged a second time on the next launch.
      await storage.deleteItem(CART_GUEST_KEY);
      notify();
      // Only push when the merge holds something the server does not: a line it
      // has never seen, a larger quantity, or an offer agreement accepted here.
      if (cartNeedsPush(merged, remote)) {
        const pushed = await pushAccountCart(toCartPayload(merged)) as { items: CartItem[]; ignored?: CartSyncIssue[]; released?: CartSyncIssue[] } | null;
        if (pushed) {
          state.cart = pushed.items;
          await storage.setItem(CART_ACCOUNT_KEY, JSON.stringify(state.cart));
          store.recordCartIssues(pushed);
          notify();
        }
      }
    } catch { /* offline or token expired — the device cart stands */ }
  },

  /**
   * Where the cart is kept: the account's cache while signed in, the device's own
   * key while signed out. Two keys, because a guest cart must survive sign-in and
   * an account cart must not follow the account onto someone else's session.
   */
  cartStorageKey() { return state.user && state.token ? CART_ACCOUNT_KEY : CART_GUEST_KEY; },

  /**
   * Persist the cart, and mirror it to the account when there is one.
   *
   * The account's answer is authoritative about what it kept, so it is applied
   * rather than discarded: a line whose listing is gone is removed here as well
   * (otherwise the next hydration would merge it straight back in and push it
   * again, forever), and a line whose agreed price lapsed stays but is unlocked
   * and shows the live price. Both are recorded so the cart screen can say so
   * instead of the shopper discovering it silently.
   */
  async persistCart() {
    await storage.setItem(store.cartStorageKey(), JSON.stringify(state.cart));
    if (!state.user || !state.token) return;
    try {
      const { pushAccountCart } = require('./api');
      const pushed = await pushAccountCart(toCartPayload(state.cart)) as { items: CartItem[]; ignored?: CartSyncIssue[]; released?: CartSyncIssue[] } | null;
      if (pushed) {
        store.applyCartAnswer(pushed);
        await storage.setItem(store.cartStorageKey(), JSON.stringify(state.cart));
      }
    } catch { /* offline: the account cart catches up on the next change or sign-in */ }
  },

  /**
   * Apply the account cart's answer to this device's cart. Only the lines the
   * server named are touched — a local change made while the request was in
   * flight must not be overwritten by a reply that predates it.
   */
  applyCartAnswer(answer: { items?: CartItem[]; ignored?: CartSyncIssue[]; released?: CartSyncIssue[] }) {
    const ignored = answer.ignored || [];
    const released = answer.released || [];
    if (ignored.length > 0) {
      const dropped = new Set(ignored.map((issue) => cartLineKeyOf({ id: issue.productId, variantId: issue.variantId || undefined })));
      state.cart = state.cart.filter((item) => !dropped.has(cartLineKey(item)));
    }
    for (const issue of released) {
      const key = cartLineKeyOf({ id: issue.productId, variantId: issue.variantId || undefined });
      const line = state.cart.find((item) => cartLineKey(item) === key);
      const live = answer.items?.find((item) => cartLineKey(item) === key);
      if (!line) continue;
      // The agreement is gone; the line is not. Unlock the quantity and take the
      // live price the server just read, so the shopper sees what they will pay.
      delete line.acceptedOfferMessageId;
      // The server's copy of that line carries the live price and stock.
      if (live) {
        Object.assign(line, live);
        delete line.acceptedOfferMessageId;
      }
    }
    store.recordCartIssues(answer);
    notify();
  },

  /** Remember what to explain on the cart screen; an empty answer clears it. */
  recordCartIssues(answer: { ignored?: CartSyncIssue[]; released?: CartSyncIssue[] }) {
    const notices: CartSyncNotice[] = [
      ...(answer.ignored || []).map((issue) => ({ kind: 'removed' as const, productId: issue.productId, variantId: issue.variantId ?? null, reason: issue.reason })),
      ...(answer.released || []).map((issue) => ({ kind: 'released' as const, productId: issue.productId, variantId: issue.variantId ?? null, reason: issue.reason })),
    ];
    if (notices.length === 0 && state.cartIssues.length === 0) return;
    state.cartIssues = notices;
  },

  async refreshUser() {
    if (!state.token) return;
    try {
      const { getMe } = require('./api');
      const res = await getMe() as { user: any };
      if (res.user) {
        state.user = res.user;
        await storage.setItem('mm_user', JSON.stringify(res.user));
        notify();
      }
    } catch { /* token expired or network error — keep current state */ }
  },

  async logout(options?: { removeDrafts?: boolean }) {
    // Batch 75 — unregister this device's push token FIRST, while the session that
    // owns the registration is still valid: otherwise the account keeps pushing to
    // a phone nobody is signed into. Best-effort, and never a reason to fail a
    // sign-out the user asked for.
    try {
      const { unregisterPushToken } = require('./notifications');
      await unregisterPushToken();
    } catch { /* offline or unsupported: the sign-out proceeds */ }
    // Sign out from Better Auth (fire-and-forget, don't block on errors)
    try {
      const { API_BASE } = require('./api');
      await fetch(`${API_BASE.replace('/api', '')}/api/auth/sign-out`, { method: 'POST' });
    } catch { /* ignore — server might be down */ }
    state.user = null;
    state.token = null;
    state.cartIssues = [];
    await clearSessionToken();
    await storage.deleteItem('mm_user');
    // APP-Q403: authenticated caches and credentials leave the device. Unsent
    // drafts, the local cart, and device preferences stay unless the user chose
    // to remove their drafts in the sign-out dialog.
    await clearAccountDeviceData({ removeDrafts: options?.removeDrafts });
    notify();
  },

  async addToCart(product: CartItem) {
    if (product.seller_id && state.user?.id && product.seller_id === state.user.id) {
      return { added: false, reason: 'own-product' as const, quantity: 0, stock: 0 };
    }
    const stock = Math.max(0, Number(product.stock) || 0);
    if (stock <= 0) return { added: false, reason: 'out-of-stock' as const, quantity: 0, stock };
    const existing = state.cart.find(c => cartLineKey(c) === cartLineKey(product));
    if (existing) {
      if (existing.quantity >= stock) {
        existing.quantity = stock;
        await store.persistCart();
        notify();
        return { added: false, reason: 'max-stock' as const, quantity: existing.quantity, stock };
      }
      existing.quantity = Math.min(stock, existing.quantity + 1);
      existing.stock = stock;
    } else {
      state.cart.push({ ...product, stock, quantity: 1 });
    }
    await store.persistCart();
    notify();
    const quantity = state.cart.find(c => cartLineKey(c) === cartLineKey(product))?.quantity || 0;
    return { added: true, quantity, stock };
  },

  get lowDataMode() { return state.lowDataMode; },
  async setLowDataMode(enabled: boolean) {
    await storage.setItem('mm_low_data_mode', String(enabled));
    state.lowDataMode = enabled;
    notify();
  },

  async addAcceptedOfferToCart(product: CartItem, offerMessageId: string) {
    if (product.seller_id && state.user?.id && product.seller_id === state.user.id) {
      return { added: false, reason: 'own-product' as const };
    }
    const stock = Math.max(0, Number(product.stock) || 0);
    const quantity = Math.floor(Number(product.quantity) || 0);
    if (stock < quantity || quantity < 1) return { added: false, reason: 'out-of-stock' as const };
    const existing = state.cart.find(item => cartLineKey(item) === cartLineKey(product));
    const acceptedItem: CartItem = {
      ...existing,
      ...product,
      stock,
      quantity,
      acceptedOfferMessageId: offerMessageId,
      effective_price: Number(product.price),
      is_on_sale: false,
      discount_pct: 0,
    };
    if (existing) Object.assign(existing, acceptedItem);
    else state.cart.push(acceptedItem);
    await store.persistCart();
    notify();
    return { added: true, quantity, stock };
  },

  async removeFromCart(lineKey: string) {
    state.cart = state.cart.filter(c => cartLineKey(c) !== lineKey);
    await store.persistCart();
    notify();
  },

  async updateQuantity(lineKey: string, qty: number) {
    const item = state.cart.find(c => cartLineKey(c) === lineKey);
    if (item) {
      if (qty <= 0) {
        state.cart = state.cart.filter(c => cartLineKey(c) !== lineKey);
      } else {
        const stock = Math.max(0, Number(item.stock) || 0);
        if (stock <= 0) {
          state.cart = state.cart.filter(c => cartLineKey(c) !== lineKey);
        } else {
          item.quantity = Math.min(qty, stock);
        }
      }
      await store.persistCart();
      notify();
    }
  },

  async clearCart() {
    state.cart = [];
    state.cartIssues = [];
    await storage.deleteItem(store.cartStorageKey());
    notify();
    // Emptying the cart is a decision the account should hear about too, so a
    // device that still holds the old cart cannot push it back later.
    if (state.user && state.token) {
      try {
        const { clearAccountCart } = require('./api');
        await clearAccountCart();
      } catch { /* offline: the next push replaces the account cart anyway */ }
    }
  },

  setFollowingList(ids: string[]) {
    state.followedSellerIds = new Set(ids);
    notify();
  },

  setFollowerCount(count: number) {
    state.followerCount = count;
    notify();
  },

  setFollowingCount(count: number) {
    state.followingCount = count;
    notify();
  },

  toggleFollowing(sellerId: string, following: boolean) {
    if (following) state.followedSellerIds.add(sellerId);
    else state.followedSellerIds.delete(sellerId);
    notify();
  },

  get cartCount() {
    return state.cart.reduce((sum, c) => sum + c.quantity, 0);
  },

  onChange(fn: Listener) {
    state.listeners.push(fn);
    return () => {
      state.listeners = state.listeners.filter(l => l !== fn);
    };
  },
};
