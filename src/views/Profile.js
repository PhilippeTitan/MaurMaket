import store from '../store.js';
import { showToast } from '../toast.js';
import { navigate } from '../main.js';
import * as api from '../api.js';

export default function ProfilePage(page) {
  if (!store.isLoggedIn) { navigate('/login'); return; }

  page.innerHTML = '<div class="fullscreen-page"><div class="loading"><div class="spinner"></div></div></div>';

  api.getMe().then(({ user }) => {
    store.state.user = user;

    api.getOrders().then(({ buyerOrders, sellerOrders }) => {
      const orders = [...(buyerOrders || []), ...(sellerOrders || [])];
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
                    ${o.status === 'pending' ? `
                      <div style="display:flex;gap:4px;margin-top:4px;">
                        <button class="btn btn-sm btn-outline retry-payment-btn" data-id="${o.id}" style="padding:2px 8px;font-size:0.65rem;">Retry</button>
                        <button class="btn btn-sm btn-ghost cancel-order-btn" data-id="${o.id}" style="padding:2px 8px;font-size:0.65rem;color:var(--coral);">Cancel</button>
                      </div>
                    ` : ''}
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
      page.querySelector('#my-orders')?.addEventListener('click', async (e) => {
        const retryBtn = e.target.closest('.retry-payment-btn');
        if (retryBtn) {
          const orderId = retryBtn.dataset.id;
          retryBtn.disabled = true; retryBtn.textContent = '...';
          try {
            const { paymentUrl } = await api.retryPayment(orderId);
            window.location.href = paymentUrl;
          } catch (err) {
            showToast(err.message, 'error');
            retryBtn.disabled = false; retryBtn.textContent = 'Retry';
          }
          return;
        }
        const cancelBtn = e.target.closest('.cancel-order-btn');
        if (cancelBtn) {
          const orderId = cancelBtn.dataset.id;
          if (!confirm('Cancel this order?')) return;
          cancelBtn.disabled = true; cancelBtn.textContent = '...';
          try {
            await api.cancelOrder(orderId);
            showToast('Order cancelled', 'info');
            // Refresh the profile section
            api.getOrders().then(({ buyerOrders, sellerOrders }) => {
              const orders = [...(buyerOrders || []), ...(sellerOrders || [])];
              const container = page.querySelector('#my-orders');
              if (!container) return;
              container.innerHTML = orders.map(o => `
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
              `).join('');
            }).catch(() => {});
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
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
