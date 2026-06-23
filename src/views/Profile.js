import store from '../store.js';
import { showToast } from '../toast.js';
import { navigate } from '../main.js';
import * as api from '../api.js';
import { modalConfirm } from '../modal.js';

export default function ProfilePage(page) {
  if (!store.isLoggedIn) { navigate('/login'); return; }

  page.innerHTML = '<div class="fullscreen-page"><div class="loading"><div class="spinner"></div></div></div>';

  api.getMe().then(({ user }) => {
    store.state.user = user;

    Promise.all([
      api.getOrders(),
      api.getProducts({ seller: user.id, limit: 50 }).catch(() => ({ products: [] })),
      api.getWishlist().catch(() => ({ wishlist: [] })),
    ]).then(([{ buyerOrders, sellerOrders }, { products }, { wishlist }]) => {
      const orders = [...(buyerOrders || []), ...(sellerOrders || [])];
      const myProducts = products || [];
      const savedItems = wishlist || [];

      page.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;background:var(--bg);">
          <div class="topbar">
            <span class="logo">Profile</span>
            <div class="topbar-right"><i class="ti ti-settings" id="profile-settings-btn"></i></div>
          </div>
          <div class="profile-body">

            <div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 0 16px;">
              <div class="avatar-lg" style="width:80px;height:80px;font-size:30px;margin-bottom:6px;">${(user.full_name || 'U')[0]}</div>
              <div class="profile-name">${user.full_name}</div>
              <div style="font-size:13px;color:var(--text2);text-align:center;max-width:240px;">${user.email}</div>
              ${user.bio ? `<div style="font-size:12px;color:var(--text2);text-align:center;max-width:240px;margin-top:2px;">${user.bio}</div>` : ''}
            </div>

            <div style="display:flex;justify-content:space-around;align-items:center;padding:10px 0 16px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:14px;">
              <div style="text-align:center;flex:1;">
                <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:var(--text);">${myProducts.length}</div>
                <div style="font-size:11px;color:var(--text2);">Products</div>
              </div>
              <div style="text-align:center;flex:1;">
                <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:var(--text);">${orders.length}</div>
                <div style="font-size:11px;color:var(--text2);">Orders</div>
              </div>
              <div style="text-align:center;flex:1;">
                <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:var(--text);">${savedItems.length}</div>
                <div style="font-size:11px;color:var(--text2);">Saved</div>
              </div>
            </div>

            <div style="display:flex;gap:8px;margin-bottom:18px;">
              <button class="btn btn-outline" id="edit-profile-btn" style="flex:1;border-radius:12px;padding:10px;font-size:0.8rem;">
                <i class="ti ti-user-edit" style="font-size:14px;"></i> Edit Profile
              </button>
              <button class="btn btn-outline" id="share-profile-btn" style="flex:1;border-radius:12px;padding:10px;font-size:0.8rem;">
                <i class="ti ti-share" style="font-size:14px;"></i> Share
              </button>
            </div>

            ${store.user?.role !== 'seller' ? `
              <button class="btn btn-primary" id="become-seller-btn" style="width:100%;border-radius:12px;padding:12px;font-size:0.85rem;margin-bottom:8px;">
                <i class="ti ti-crown"></i> Become a Seller
              </button>
            ` : ''}

            ${myProducts.length > 0 ? `
              <div class="section-label" style="display:flex;align-items:center;gap:8px;">
                <i class="ti ti-apps" style="color:var(--coral);font-size:14px;"></i> My Products
                <span style="font-size:11px;color:var(--text2);font-family:'Inter',sans-serif;font-weight:400;">${myProducts.length} item${myProducts.length > 1 ? 's' : ''}</span>
              </div>
              <div class="profile-grid" id="my-products">
                ${myProducts.map(p => {
                  const img = p.images && p.images.length > 0 ? p.images.find(i => i.is_primary)?.image_url || p.images[0]?.image_url : null;
                  const colors = ['#FF4D6A', '#00C2FF', '#00E5A0', '#FF9F1C', '#B388FF', '#FF6B6B'];
                  const color = colors[p.name.length % colors.length];
                  return `
                    <div class="profile-grid-cell" data-id="${p.id}">
                      <div class="profile-grid-img" style="${img ? `background-image:url(${img});background-size:cover;background-position:center;` : `background:linear-gradient(135deg,${color},${color}88);display:flex;align-items:center;justify-content:center;`}">
                        ${!img ? `<span style="font-size:1.5rem;font-weight:700;color:#fff;font-family:'Syne',sans-serif;">${p.name[0]}</span>` : ''}
                        ${!p.is_available ? '<div style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.7);color:#fff;font-size:9px;padding:2px 6px;border-radius:4px;">Unavailable</div>' : ''}
                      </div>
                      <div class="profile-grid-info">
                        <div class="profile-grid-name">${p.name}</div>
                        <div class="profile-grid-price">Rs ${parseFloat(p.price).toFixed(0)}</div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : ''}

            <div class="section-label" style="margin-top:4px;">
              <i class="ti ti-package" style="color:var(--blue);font-size:14px;"></i> Recent Orders
            </div>
            <div id="my-orders">
              ${orders && orders.length > 0 ? orders.map(o => `
                <div class="order-row">
                  <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;">
                      <span class="order-id-text">#${o.id.slice(0, 6)}</span>
                      <span class="badge ${o.status === 'completed' || o.status === 'delivered' ? 'badge-green' : o.status === 'cancelled' ? 'badge-blue' : 'badge-blue'}" style="font-size:9px;padding:1px 7px;">${o.status}</span>
                    </div>
                    <div class="order-date">${new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  </div>
                  <div style="text-align:right;">
                    <div class="order-amt">Rs ${parseFloat(o.total_amount).toFixed(0)}</div>
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

            <div class="section-label" style="margin-top:4px;">
              <i class="ti ti-heart" style="color:var(--coral);font-size:14px;"></i> Saved
            </div>
            <div id="wishlist-section" style="font-size:0.85rem;color:var(--text2);padding:8px 0;text-align:center;">Loading...</div>

            <div style="height:24px;"></div>
          </div>
        </div>
      `;

      page.querySelector('#profile-settings-btn').addEventListener('click', () => navigate('/profile/settings'));

      page.querySelector('#edit-profile-btn').addEventListener('click', () => navigate('/profile/settings'));

      page.querySelector('#share-profile-btn')?.addEventListener('click', () => {
        if (navigator.share) {
          navigator.share({ title: user.full_name, text: `Check out ${user.full_name}'s profile on MaurMaket!`, url: window.location.origin + '/?profile=' + user.id }).catch(() => {});
        } else {
          const url = `${window.location.origin}/?profile=${user.id}`;
          navigator.clipboard?.writeText(url).then(() => showToast('Profile link copied!', 'success')).catch(() => {});
        }
      });

      const ws = page.querySelector('#wishlist-section');
      if (savedItems.length === 0) {
        ws.innerHTML = '<div style="color:var(--text2);font-size:0.85rem;padding:8px 0;">No saved items</div>';
      } else {
        ws.innerHTML = savedItems.map(w => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
            <span style="color:var(--text);font-size:0.85rem;">${w.name}</span>
            <span style="color:var(--coral);font-weight:600;font-size:0.85rem;">Rs ${parseFloat(w.price).toFixed(0)}</span>
          </div>
        `).join('');
      }

      page.querySelector('#become-seller-btn')?.addEventListener('click', async () => {
        try {
          const { user, token } = await api.becomeSeller();
          store.setUser(user, token);
          showToast('You are now a seller!', 'success');
          navigate('/seller');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      page.querySelector('#my-products')?.addEventListener('click', (e) => {
        const cell = e.target.closest('.profile-grid-cell');
        if (cell) navigate('/product', { id: cell.dataset.id });
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
          if (!(await modalConfirm('Cancel Order', 'Are you sure you want to cancel this order?'))) return;
          cancelBtn.disabled = true; cancelBtn.textContent = '...';
          try {
            await api.cancelOrder(orderId);
            showToast('Order cancelled', 'info');
            api.getOrders().then(({ buyerOrders, sellerOrders }) => {
              const orders = [...(buyerOrders || []), ...(sellerOrders || [])];
              const container = page.querySelector('#my-orders');
              if (!container) return;
              container.innerHTML = orders.map(o => `
                <div class="order-row">
                  <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;">
                      <span class="order-id-text">#${o.id.slice(0, 6)}</span>
                      <span class="badge ${o.status === 'completed' || o.status === 'delivered' ? 'badge-green' : o.status === 'cancelled' ? 'badge-blue' : 'badge-blue'}">${o.status}</span>
                    </div>
                    <div class="order-date">${new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  </div>
                  <div style="text-align:right;">
                    <div class="order-amt">Rs ${parseFloat(o.total_amount).toFixed(0)}</div>
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
      renderFallback(page, user);
    });
  }).catch(() => {
    store.logout();
    navigate('/');
  });
}

function renderFallback(page, user) {
  page.innerHTML = `<div style="height:100%;display:flex;flex-direction:column;background:var(--bg);">
    <div class="topbar"><span class="logo">Profile</span><div class="topbar-right"><i class="ti ti-settings" id="profile-settings-btn"></i></div></div>
    <div class="profile-body">
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 0 16px;">
        <div class="avatar-lg" style="width:80px;height:80px;font-size:30px;margin-bottom:6px;">${(user.full_name || 'U')[0]}</div>
        <div class="profile-name">${user.full_name}</div>
        <div style="font-size:13px;color:var(--text2);text-align:center;max-width:240px;">${user.email}</div>
      </div>
    </div>
  </div>`;
  page.querySelector('#profile-settings-btn').addEventListener('click', () => navigate('/profile/settings'));
}
