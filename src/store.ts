import { Platform } from 'react-native';
import type { User, CartItem } from './types';

type Listener = () => void;

interface StoreState {
  user: User | null;
  token: string | null;
  cart: CartItem[];
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
  listeners: [],
};

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

  async init() {
    const token = await storage.getItem('mm_token');
    const cartStr = await storage.getItem('mm_cart');
    if (token) state.token = token;
    if (cartStr) {
      try { state.cart = JSON.parse(cartStr); } catch { /* ignore */ }
    }
  },

  async setUser(user: User | null, token: string | null) {
    state.user = user;
    state.token = token;
    if (token) await storage.setItem('mm_token', token);
    else await storage.deleteItem('mm_token');
    notify();
  },

  async logout() {
    state.user = null;
    state.token = null;
    await storage.deleteItem('mm_token');
    notify();
  },

  async addToCart(product: CartItem) {
    const stock = Math.max(0, Number(product.stock) || 0);
    if (stock <= 0) return { added: false, reason: 'out-of-stock' as const, quantity: 0, stock };
    const existing = state.cart.find(c => c.id === product.id);
    if (existing) {
      if (existing.quantity >= stock) {
        existing.quantity = stock;
        await storage.setItem('mm_cart', JSON.stringify(state.cart));
        notify();
        return { added: false, reason: 'max-stock' as const, quantity: existing.quantity, stock };
      }
      existing.quantity = Math.min(stock, existing.quantity + 1);
      existing.stock = stock;
    } else {
      state.cart.push({ ...product, stock, quantity: 1 });
    }
    await storage.setItem('mm_cart', JSON.stringify(state.cart));
    notify();
    const quantity = state.cart.find(c => c.id === product.id)?.quantity || 0;
    return { added: true, quantity, stock };
  },

  async removeFromCart(productId: string) {
    state.cart = state.cart.filter(c => c.id !== productId);
    await storage.setItem('mm_cart', JSON.stringify(state.cart));
    notify();
  },

  async updateQuantity(productId: string, qty: number) {
    const item = state.cart.find(c => c.id === productId);
    if (item) {
      if (qty <= 0) {
        state.cart = state.cart.filter(c => c.id !== productId);
      } else {
        const stock = Math.max(0, Number(item.stock) || 0);
        if (stock <= 0) {
          state.cart = state.cart.filter(c => c.id !== productId);
        } else {
          item.quantity = Math.min(qty, stock);
        }
      }
      await storage.setItem('mm_cart', JSON.stringify(state.cart));
      notify();
    }
  },

  async clearCart() {
    state.cart = [];
    await storage.deleteItem('mm_cart');
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
