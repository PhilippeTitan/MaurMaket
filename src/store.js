const store = {
  state: {
    user: null,
    token: localStorage.getItem('mm_token') || null,
    cart: JSON.parse(localStorage.getItem('mm_cart') || '[]'),
  },

  get user() { return this.state.user; },
  get token() { return this.state.token; },
  get cart() { return this.state.cart; },
  get isLoggedIn() { return !!this.state.token; },
  get isSeller() { return !!this.state.user; },

  setUser(user, token) {
    this.state.user = user;
    this.state.token = token;
    if (token) localStorage.setItem('mm_token', token);
    else localStorage.removeItem('mm_token');
  },

  logout() {
    this.state.user = null;
    this.state.token = null;
    localStorage.removeItem('mm_token');
    window.dispatchEvent(new CustomEvent('store:logout'));
  },

  addToCart(product) {
    const existing = this.state.cart.find(c => c.id === product.id);
    if (existing) existing.quantity += 1;
    else this.state.cart.push({ ...product, quantity: 1 });
    localStorage.setItem('mm_cart', JSON.stringify(this.state.cart));
    this.notify();
  },

  removeFromCart(productId) {
    this.state.cart = this.state.cart.filter(c => c.id !== productId);
    localStorage.setItem('mm_cart', JSON.stringify(this.state.cart));
    this.notify();
  },

  updateQuantity(productId, qty) {
    const item = this.state.cart.find(c => c.id === productId);
    if (item) {
      if (qty <= 0) this.removeFromCart(productId);
      else { item.quantity = qty; localStorage.setItem('mm_cart', JSON.stringify(this.state.cart)); this.notify(); }
    }
  },

  clearCart() {
    this.state.cart = [];
    localStorage.removeItem('mm_cart');
    this.notify();
  },

  get cartCount() {
    return this.state.cart.reduce((sum, c) => sum + c.quantity, 0);
  },

  listeners: [],
  notify() {
    this.listeners.forEach(fn => fn());
  },
  onChange(fn) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  },
};

export default store;
