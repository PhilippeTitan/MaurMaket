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
        <div style="height:100%;display:flex;flex-direction:column;background:var(--bg);">
          <div class="topbar">
            <span class="logo">Profile</span>
            <div class="topbar-right"><i class="ti ti-settings" id="profile-settings-btn"></i></div>
          </div>
          <div class="profile-body">
            <div class="profile-hero">
              <div class="avatar-lg">${(user.full_name || 'U')[0]}</div>
              <div class="profile-name">${user.full_name}</div>
              <div class="profile-email">${user.email}</div>
            </div>

            <div class="section-label">Contact</div>
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:18px;">
              <div style="font-size:0.85rem;color:var(--text2);margin-bottom:2px;">Phone</div>
              <div style="font-size:1rem;color:var(--text);">${user.phone || '<span style="color:var(--text2);">Not set</span>'}</div>
              ${!user.phone ? '<div style="font-size:0.75rem;color:var(--coral);margin-top:4px;">Add a phone number to receive payouts</div>' : ''}
            </div>

            <div class="stats-row">
              <div class="stat-card"><div class="stat-num">${orders ? orders.length : 0}</div><div class="stat-label">Orders</div></div>
              <div class="stat-card"><div class="stat-num">${store.cartCount}</div><div class="stat-label">In Cart</div></div>
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

            <button class="btn btn-outline" id="logout-btn" style="width:100%;border-radius:14px;padding:14px;margin-top:16px;">Sign Out</button>
          </div>
        </div>
      `;

      page.querySelector('#profile-settings-btn').addEventListener('click', () => navigate('/profile/settings'));
      page.querySelector('#logout-btn').addEventListener('click', () => {
        store.logout();
        showToast('Signed out', 'info');
        navigate('/');
      });
    }).catch(() => {
      page.innerHTML = `<div style="height:100%;display:flex;flex-direction:column;background:var(--bg);">
        <div class="topbar"><span class="logo">Profile</span><div class="topbar-right"><i class="ti ti-settings" id="profile-settings-btn"></i></div></div>
        <div class="profile-body">
          <div class="profile-hero">
            <div class="avatar-lg">${(user.full_name || 'U')[0]}</div>
            <div class="profile-name">${user.full_name}</div>
            <div class="profile-email">${user.email}</div>
          </div>
        </div>
      </div>`;
      page.querySelector('#profile-settings-btn').addEventListener('click', () => navigate('/profile/settings'));
    });
  }).catch(() => {
    store.logout();
    navigate('/');
  });
}
