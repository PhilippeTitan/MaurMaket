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

export function deleteProduct(id) {
  return request(`/products/${id}`, { method: 'DELETE' });
}

export function getCategories() {
  return request('/categories');
}

export function createOrder(data) {
  return request('/orders', { method: 'POST', body: JSON.stringify(data) });
}

export function getOrders() {
  return request('/orders');
}

export function getOrder(id) {
  return request(`/orders/${id}`);
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

export function addOrderNote(orderId, note) {
  return request(`/orders/${orderId}/note`, { method: 'POST', body: JSON.stringify({ note }) });
}
export function updateOrderStatus(orderId, status) {
  return request(`/seller/orders/${orderId}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
}

export function cancelOrder(orderId) {
  return request(`/orders/${orderId}/cancel`, { method: 'PUT' });
}

export function retryPayment(orderId) {
  return request(`/payments/retry/${orderId}`, { method: 'POST' });
}

export function becomeSeller() {
  return request('/auth/become-seller', { method: 'PUT' });
}

export function toggleWishlist(productId) {
  return request(`/wishlist/${productId}`, { method: 'POST' });
}

export function getWishlist() {
  return request('/wishlist');
}

export function checkWishlist(productId) {
  return request(`/wishlist/check/${productId}`);
}

export function toggleFollow(sellerId) {
  return request(`/follow/${sellerId}`, { method: 'POST' });
}

export function getFollowing() {
  return request('/following');
}

export function getFollowerCount(sellerId) {
  return request(`/followers/count/${sellerId}`);
}

export function getNotifications() {
  return request('/notifications');
}
export function getUnreadCount() {
  return request('/notifications/unread-count');
}
export function markNotificationRead(id) {
  return request(`/notifications/${id}/read`, { method: 'PUT' });
}
export function getConversations() {
  return request('/conversations');
}
export function createConversation(data) {
  return request('/conversations', { method: 'POST', body: JSON.stringify(data) });
}
export function getMessages(conversationId) {
  return request(`/conversations/${conversationId}/messages`);
}
export function sendMessage(conversationId, content) {
  return request(`/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content }) });
}
export function validatePromo(code, orderTotal) {
  return request('/promos/validate', { method: 'POST', body: JSON.stringify({ code, orderTotal }) });
}
export function createPromo(data) {
  return request('/promos', { method: 'POST', body: JSON.stringify(data) });
}
export function getMyPromos() {
  return request('/promos/mine');
}
export function getConversationUnreadCount() {
  return request('/conversations/unread-count');
}
export function markAllNotificationsRead() {
  return request('/notifications/read-all', { method: 'PUT' });
}
export function reorder(orderId) {
  return request(`/orders/${orderId}/reorder`, { method: 'POST' });
}
export function changePassword(currentPassword, newPassword) {
  return request('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) });
}

export function proposeMeetup(orderId, lat, lng, address, note) {
  return request(`/orders/${orderId}/meetup`, { method: 'PUT', body: JSON.stringify({ lat, lng, address, note }) });
}

export function confirmMeetup(orderId) {
  return request(`/orders/${orderId}/meetup/confirm`, { method: 'PUT' });
}

export function completeOrder(orderId) {
  return request(`/orders/${orderId}/complete`, { method: 'PUT' });
}

export function getOrderTimeline(orderId) {
  return request(`/orders/${orderId}/timeline`);
}

export function createReview(orderId, rating, comment) {
  return request('/reviews', { method: 'POST', body: JSON.stringify({ orderId, rating, comment }) });
}

export function getSellerReviews(sellerId) {
  return request(`/reviews/seller/${sellerId}`);
}

export function getSellerProfile(sellerId) {
  return request(`/sellers/${sellerId}`);
}

export function getSellerAnalytics() {
  return request('/seller/analytics');
}
export function getLowStockProducts() {
  return request('/seller/products/low-stock');
}
export function createDispute(data) {
  return request('/disputes', { method: 'POST', body: JSON.stringify(data) });
}
export function getDisputes() {
  return request('/disputes');
}
export function getAdminUsers() {
  return request('/admin/users');
}
export function getAdminDisputes() {
  return request('/admin/disputes');
}
export function updateAdminDispute(id, data) {
  return request(`/admin/disputes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}
export function getAddresses() {
  return request('/addresses');
}

export function createAddress(data) {
  return request('/addresses', { method: 'POST', body: JSON.stringify(data) });
}

export function updateAddress(id, data) {
  return request(`/addresses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteAddress(id) {
  return request(`/addresses/${id}`, { method: 'DELETE' });
}

export function uploadImage(file) {
  const token = localStorage.getItem('mm_token');
  const formData = new FormData();
  formData.append('image', file);
  return fetch('/api/upload', {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData,
  }).then(res => res.json());
}
