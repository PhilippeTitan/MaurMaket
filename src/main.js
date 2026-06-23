import store from './store.js';
import * as api from './api.js';
import HomePage from './views/Home.js';
import ExplorePage from './views/Explore.js';
import LoginPage from './views/Login.js';
import SignupPage from './views/Signup.js';
import ProductDetailPage from './views/ProductDetail.js';
import CartPage from './views/Cart.js';
import SellerPage from './views/Seller.js';
import ProfilePage from './views/Profile.js';
import SettingsPage from './views/Settings.js';

const tabRoutes = {
  home:    { path: '/', label: 'Home', icon: 'ti-home', view: HomePage },
  explore: { path: '/explore', label: 'Explore', icon: 'ti-search', view: ExplorePage },
  sell:    { path: '/seller', label: 'Sell', icon: 'ti-plus', view: SellerPage },
  cart:    { path: '/cart', label: 'Cart', icon: 'ti-shopping-cart', view: CartPage },
  profile: { path: '/profile', label: 'Profile', icon: 'ti-user', view: ProfilePage },
};

const fullscreenRoutes = ['/login', '/signup', '/product', '/payment', '/profile/settings'];

function renderShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div id="shell">
      <div id="page"></div>
      <nav id="tab-bar"></nav>
    </div>
  `;
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
        ${key === 'cart' && store.cartCount > 0 ? `<span class="tab-badge">${store.cartCount}</span>` : ''}
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

  if (path === '/payment/return') {
    page.innerHTML = `
      <div style="height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);padding:20px;text-align:center;">
        <div class="spinner" style="margin-bottom:16px;"></div>
        <h3 style="margin-bottom:4px;">Checking payment...</h3>
        <p style="color:var(--text2);font-size:0.85rem;">Please wait while we confirm your payment</p>
      </div>
    `;

    import('./api.js').then(({ getOrders }) => {
      getOrders().then(({ orders }) => {
        const latest = orders[0];
        if (latest && (latest.status === 'paid' || latest.status === 'processing')) {
          page.innerHTML = `
            <div style="height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);padding:20px;text-align:center;">
              <div style="font-size:3rem;margin-bottom:8px;">✅</div>
              <h3 style="margin-bottom:4px;">Payment Successful!</h3>
              <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px;">Your order has been placed</p>
              <button class="btn btn-primary" id="goto-profile">View Orders</button>
            </div>
          `;
          page.querySelector('#goto-profile')?.addEventListener('click', () => navigate('/profile'));
        } else {
          page.innerHTML = `
            <div style="height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);padding:20px;text-align:center;">
              <div style="font-size:3rem;margin-bottom:8px;">⏳</div>
              <h3 style="margin-bottom:4px;">Payment Pending</h3>
              <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px;">We're waiting for MonCash confirmation. Check your orders for status updates.</p>
              <button class="btn btn-primary" id="goto-profile">View Orders</button>
            </div>
          `;
          page.querySelector('#goto-profile')?.addEventListener('click', () => navigate('/profile'));
        }
      }).catch(() => {
        page.innerHTML = `
          <div style="height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);padding:20px;text-align:center;">
            <div style="font-size:3rem;margin-bottom:8px;">✅</div>
            <h3 style="margin-bottom:4px;">Payment Submitted!</h3>
            <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px;">Your payment is being processed. Check your orders for updates.</p>
            <button class="btn btn-primary" id="goto-profile">View Orders</button>
          </div>
        `;
        page.querySelector('#goto-profile')?.addEventListener('click', () => navigate('/profile'));
      });
    });
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

  window.addEventListener('store:logout', () => navigate('/'));
}

document.addEventListener('DOMContentLoaded', init);
