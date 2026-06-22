import store from '../store.js';
import { showToast } from '../toast.js';
import { navigate } from '../main.js';
import * as api from '../api.js';

export default function ProfilePage(page) {
  if (!store.isLoggedIn) { navigate('/login'); return; }

  page.innerHTML = '<div class="fullscreen-page"><div class="loading"><div class="spinner"></div></div></div>';

  api.getMe().then(({ user }) => {
    store.state.user = user;

    api.getOrders().then(({ orders }) => {
      page.innerHTML = `
        <div style="height:100dvh;display:flex;flex-direction:column;background:var(--bg);">
          <div class="topbar">
            <span class="logo">Profile</span>
            <div class="topbar-right"><i class="ti ti-settings"></i></div>
          </div>
          <div class="profile-body">
            <div class="profile-hero">
              <div class="avatar-lg">${(user.full_name || 'U')[0]}</div>
              <div class="profile-name">${user.full_name}</div>
              <div class="profile-email">${user.email}</div>
              <div class="role-pill">${user.role}</div>
            </div>

            <div class="stats-row">
              <div class="stat-card"><div class="stat-num">${orders ? orders.length : 0}</div><div class="stat-label">Orders</div></div>
              <div class="stat-card"><div class="stat-num">${store.cartCount}</div><div class="stat-label">In Cart</div></div>
              <div class="stat-card"><div class="stat-num">${store.cart.length}</div><div class="stat-label">Saved</div></div>
            </div>

            <div class="section-label">Recent Orders</div>
            <div id="my-orders">
              ${orders && orders.length > 0 ? orders.map(o => `
                <div class="order-row">
                  <div>
                    <div class="order-id-text">${o.id.slice(0, 8)}...</div>
                    <div class="order-date">${new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  </div>
                  <div style="text-align:right;">
                    <div class="order-amt">Rs ${parseFloat(o.total_amount).toFixed(0)}</div>
                    <span class="badge ${o.status === 'completed' || o.status === 'delivered' ? 'badge-green' : 'badge-blue'}">${o.status}</span>
                  </div>
                </div>
              `).join('') : '<div style="text-align:center;padding:20px 0;color:var(--text2);font-size:0.85rem;">No orders yet</div>'}
            </div>
          </div>
        </div>
      `;
    }).catch(() => {
      page.innerHTML = `<div style="height:100dvh;display:flex;flex-direction:column;background:var(--bg);">
        <div class="topbar"><span class="logo">Profile</span><div class="topbar-right"><i class="ti ti-settings"></i></div></div>
        <div class="profile-body">
          <div class="profile-hero">
            <div class="avatar-lg">${(user.full_name || 'U')[0]}</div>
            <div class="profile-name">${user.full_name}</div>
            <div class="profile-email">${user.email}</div>
            <div class="role-pill">${user.role}</div>
          </div>
        </div>
      </div>`;
    });
  }).catch(() => {
    store.logout();
    navigate('/');
  });
}
