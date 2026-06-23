import store from './store.js';
import * as api from './api.js';
import HomePage from './views/Home.js';
import ExplorePage from './views/Explore.js';
import LoginPage from './views/Login.js';
import SignupPage from './views/Signup.js';
import ProductDetailPage from './views/ProductDetail.js';
import CartPage from './views/Cart.js';
import OrdersPage from './views/Orders.js';
import SellerPage from './views/Seller.js';
import ProfilePage from './views/Profile.js';
import SettingsPage from './views/Settings.js';
import StorefrontPage from './views/Storefront.js';
import NotificationsPage from './views/Notifications.js';
import MessagesPage from './views/Messages.js';

const tabRoutes = {
  home:    { path: '/', label: 'Home', icon: 'ti-home', view: HomePage },
  explore: { path: '/explore', label: 'Explore', icon: 'ti-search', view: ExplorePage },
  sell:    { path: '/seller', label: 'Sell', icon: 'ti-plus', view: SellerPage },
  orders:  { path: '/orders', label: 'Orders', icon: 'ti-truck', view: OrdersPage },
  profile: { path: '/profile', label: 'Profile', icon: 'ti-user', view: ProfilePage },
};

const fullscreenRoutes = ['/login', '/signup', '/product', '/payment', '/profile/settings', '/cart', '/store', '/notifications', '/messages'];

function renderShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div id="shell">
      <div id="shell-topbar" class="topbar" style="display:none;">
        <div style="flex:1"></div>
        <div style="display:flex;gap:16px;align-items:center;">
          <div style="position:relative;">
            <i class="ti ti-message" id="shell-messages" style="font-size:22px;color:var(--text2);cursor:pointer;"></i>
            <span id="shell-msg-badge" class="notif-badge" style="display:none;"></span>
          </div>
          <div style="position:relative;">
            <i class="ti ti-bell" id="shell-bell" style="font-size:22px;color:var(--text2);cursor:pointer;"></i>
            <span id="shell-bell-badge" class="notif-badge" style="display:none;"></span>
          </div>
        </div>
      </div>
      <div id="page"></div>
      <nav id="tab-bar"></nav>
    </div>
  `;
  document.getElementById('shell-bell')?.addEventListener('click', () => navigate('/notifications'));
  document.getElementById('shell-messages')?.addEventListener('click', () => navigate('/messages'));
  return app.querySelector('#page');
}

function renderTabBar(activeKey) {
  const tabBar = document.getElementById('tab-bar');
  if (!tabBar) return;

  const tabs = Object.entries(tabRoutes);
  tabBar.innerHTML = tabs.map(([key, tab]) => {
    const isActive = key === activeKey;
    return `
      <button class="tab-btn ${isActive ? 'active' : ''}" data-tab="${key}">
        <i class="ti ${tab.icon}"></i>
        <span>${tab.label}</span>
      </button>
    `;
  }).join('');

  tabBar.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.tab;
      const tab = tabRoutes[key];
      if (tab) navigateToTab(key);
    });
  });
}

export function navigateToTab(key) {
  const tab = tabRoutes[key];
  if (!tab) return;
  const page = document.getElementById('page');
  if (!page) return;
  showTabBar();
  renderTabBar(key);
  tab.view(page);
  window.scrollTo(0, 0);
}

export function navigate(path, params = {}) {
  const page = document.getElementById('page');
  if (!page) return;

  const isFullscreen = fullscreenRoutes.some(r => path.startsWith(r));
  if (isFullscreen) hideTabBar();
  else showTabBar();

  for (const [key, tab] of Object.entries(tabRoutes)) {
    if (tab.path === path) { navigateToTab(key); return; }
  }

  if (path === '/login') { LoginPage(page); return; }
  if (path === '/signup') { SignupPage(page); return; }
  if (path.startsWith('/product')) { ProductDetailPage(page, params); return; }
  if (path === '/profile/settings') { SettingsPage(page); return; }
  if (path.startsWith('/store')) { StorefrontPage(page, params); return; }
  if (path === '/notifications') { NotificationsPage(page); return; }
  if (path.startsWith('/messages')) { MessagesPage(page, params); return; }

  if (path === '/cart') { CartPage(page); return; }

  if (path === '/payment/return') {
    const orderId = new URLSearchParams(window.location.search).get('order');
    page.innerHTML = `
      <div style="height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);padding:20px;text-align:center;">
        <div class="spinner" style="margin-bottom:16px;"></div>
        <h3 style="margin-bottom:4px;">Checking payment...</h3>
        <p style="color:var(--text2);font-size:0.85rem;">Please wait while we confirm your payment</p>
      </div>
    `;

    async function checkOrder() {
      try {
        const res = await fetch('/api/orders/' + orderId, {
          headers: { 'Authorization': 'Bearer ' + (store.token || localStorage.getItem('mm_token')) }
        });
        const data = await res.json();
        const status = data.order?.status;
        if (status === 'paid' || status === 'processing') {
          page.innerHTML = `
            <div style="height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);padding:20px;text-align:center;">
              <div style="font-size:3rem;margin-bottom:8px;">✅</div>
              <h3 style="margin-bottom:4px;">Payment Successful!</h3>
              <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px;">Your order has been placed</p>
              <button class="btn btn-primary" id="goto-profile">View Orders</button>
            </div>
          `;
        } else if (status === 'pending') {
          page.innerHTML = `
            <div style="height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);padding:20px;text-align:center;">
              <div style="font-size:3rem;margin-bottom:8px;">⏳</div>
              <h3 style="margin-bottom:4px;">Payment Pending</h3>
              <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px;">We're waiting for MonCash confirmation. Check your orders for status updates.</p>
              <button class="btn btn-primary" id="goto-profile">View Orders</button>
            </div>
          `;
        } else {
          page.innerHTML = `
            <div style="height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);padding:20px;text-align:center;">
              <div style="font-size:3rem;margin-bottom:8px;">❌</div>
              <h3 style="margin-bottom:4px;">Payment Failed</h3>
              <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px;">Please try again</p>
              <button class="btn btn-primary" id="goto-cart">Back to Cart</button>
            </div>
          `;
        }
      } catch {
        page.innerHTML = `
          <div style="height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);padding:20px;text-align:center;">
            <div style="font-size:3rem;margin-bottom:8px;">✅</div>
            <h3 style="margin-bottom:4px;">Payment Submitted!</h3>
            <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px;">Your payment is being processed. Check your orders for updates.</p>
            <button class="btn btn-primary" id="goto-profile">View Orders</button>
          </div>
        `;
      }
      page.querySelector('#goto-profile')?.addEventListener('click', () => navigate('/profile'));
      page.querySelector('#goto-cart')?.addEventListener('click', () => navigate('/cart'));
    }

    // Retry with exponential backoff since the webhook may not have fired yet
    async function pollPayment(attempt = 0) {
      await checkOrder();
      const maxAttempts = 8;
      if (attempt < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(1.5, attempt), 15000);
        setTimeout(() => pollPayment(attempt + 1), delay);
      }
    }
    pollPayment();
    return;
  }

  page.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text2);"><p>Not found</p></div>`;
}

function showTabBar() {
  const tb = document.getElementById('tab-bar');
  if (tb) tb.style.display = 'flex';
}
function hideTabBar() {
  const tb = document.getElementById('tab-bar');
  if (tb) tb.style.display = 'none';
}

function init() {
  renderShell();

  const initialPath = window.location.pathname;

  if (store.token) {
    api.getMe().then(({ user }) => {
      store.state.user = user;
      navigate(initialPath);
    }).catch(() => {
      store.logout();
      navigateToTab('home');
    });
  } else {
    navigate(initialPath);
  }

  store.onChange(() => {
    const active = document.querySelector('.tab-btn.active');
    if (active) {
      const key = active.dataset.tab;
      renderTabBar(key);
    }
  });

  async function pollUnread() {
    if (!store.token) { document.getElementById('shell-topbar').style.display = 'none'; return; }
    document.getElementById('shell-topbar').style.display = 'flex';
    try {
      const { count } = await api.getUnreadCount();
      const badge = document.getElementById('shell-bell-badge');
      if (badge) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = count > 0 ? 'flex' : 'none';
      }
    } catch {}
    try {
      const { count } = await api.getConversationUnreadCount();
      const badge = document.getElementById('shell-msg-badge');
      if (badge) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = count > 0 ? 'flex' : 'none';
      }
    } catch {}
  }
  pollUnread();
  setInterval(pollUnread, 30000);

  window.addEventListener('store:logout', () => navigate('/'));
}

document.addEventListener('DOMContentLoaded', init);
