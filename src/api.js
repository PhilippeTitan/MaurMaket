const API_BASE = '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('mm_token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function signup(fullName, email, password, phone, role) {
  return request('/auth/signup', { method: 'POST', body: JSON.stringify({ fullName, email, password, phone, role }) });
}

export function login(email, password) {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function getMe() {
  return request('/auth/me');
}

export function updateProfile(data) {
  return request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) });
}

export function getProducts(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`/products${qs ? '?' + qs : ''}`);
}

export function getProduct(id) {
  return request(`/products/${id}`);
}

export function createProduct(data) {
  return request('/products', { method: 'POST', body: JSON.stringify(data) });
}

export function updateProduct(id, data) {
  return request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function getCategories() {
  return request('/categories');
}

export function createOrder(items) {
  return request('/orders', { method: 'POST', body: JSON.stringify({ items }) });
}

export function getOrders() {
  return request('/orders');
}

export function getSellerProducts() {
  return request('/seller/products');
}

export function getSellerOrders() {
  return request('/seller/orders');
}

export function createPayment(orderId, returnUrl) {
  return request('/payments/create', { method: 'POST', body: JSON.stringify({ orderId, returnUrl }) });
}

export function getSellerBalance() {
  return request('/seller/balance');
}

export function getSellerPayouts() {
  return request('/seller/payouts');
}

export function requestPayout(amount) {
  return request('/seller/payouts/request', { method: 'POST', body: JSON.stringify({ amount }) });
}
