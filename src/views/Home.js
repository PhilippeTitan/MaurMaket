import * as api from '../api.js';
import store from '../store.js';
import { showToast } from '../toast.js';
import { navigate } from '../main.js';

const gradientBgs = [
  'linear-gradient(135deg, #1C2235, #2a1a3e)',
  'linear-gradient(135deg, #1a2535, #0f1c2e)',
  'linear-gradient(135deg, #1a351a, #0f2e0f)',
  'linear-gradient(135deg, #2a1a1a, #1a0f0f)',
  'linear-gradient(135deg, #1a1a35, #0f0f2e)',
];

const emojis = ['☕', '📱', '👟', '🎧', '💻', '🕶️', '🎮', '👜', '📷', '⌚', '🧥', '👗'];

export default async function HomePage(page) {
  page.innerHTML = `
    <div class="home-page">
      <div class="topbar" style="justify-content:space-between;">
        <div style="display:flex;gap:16px;align-items:center;">
          <i class="ti ti-bell"></i>
          <i class="ti ti-heart"></i>
        </div>
        <span class="logo">Maur<span>Maket</span></span>
        <div style="display:flex;gap:16px;align-items:center;position:relative;">
          <i class="ti ti-shopping-cart" id="home-cart-btn"></i>
          <span id="home-cart-badge" style="display:${store.cartCount > 0 ? 'flex' : 'none'};position:absolute;top:-4px;right:-6px;background:var(--coral);color:#fff;font-size:0.55rem;font-weight:700;padding:1px 5px;border-radius:8px;min-width:15px;text-align:center;height:15px;align-items:center;justify-content:center;">${store.cartCount}</span>
        </div>
      </div>
      <div id="ig-feed" class="ig-feed">
        <div class="loading"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  let products = [];
  let pageNum = 1;
  let hasMore = true;
  let isLoading = false;

  async function loadProducts(append = false) {
    if (isLoading) return;
    isLoading = true;

    try {
      const data = await api.getProducts({ page: pageNum, limit: 10 });
      if (append) products = [...products, ...data.products];
      else products = data.products;
      hasMore = pageNum < data.pages;
      renderFeed(append);
      pageNum++;
    } catch (err) {
      const feed = page.querySelector('#ig-feed');
      if (!append) feed.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:0.85rem;">${err.message}</div>`;
    } finally {
      isLoading = false;
    }
  }

  function renderFeed(append) {
    const feed = page.querySelector('#ig-feed');
    if (!append) feed.innerHTML = '';

    const startIdx = append ? products.length - 10 : 0;
    const newProducts = products.slice(startIdx);

    for (const p of newProducts) {
      const post = document.createElement('div');
      post.className = 'ig-post';

      const bg = gradientBgs[Math.floor(Math.random() * gradientBgs.length)];
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];

      post.innerHTML = `
        <div class="ig-post-frame" style="background:${bg};">
          <span style="font-size:80px;">${emoji}</span>
          <img src="${p.image_url || ''}" alt="${p.name}" loading="lazy" class="ig-post-img"
               onerror="this.style.display='none'" />
          <div class="ig-price-tag">Rs ${parseFloat(p.price).toFixed(0)}</div>
          <div class="ig-seller-overlay">
            <div class="ig-avatar-sm">${(p.seller_name || 'U')[0]}</div>
            <div class="ig-seller-info">
              <div class="ig-seller-name">${p.seller_name}</div>
              ${p.category ? `<div class="ig-seller-cat">${p.category}</div>` : ''}
            </div>
          </div>
        </div>
        <div class="ig-post-foot">
          <span class="ig-name">${p.name}</span>
          <button class="btn btn-primary btn-sm ig-add-cart">+ Cart</button>
          ${store.isLoggedIn ? `<button class="btn btn-outline btn-sm ig-buy">Buy</button>` : ''}
        </div>
      `;

      feed.appendChild(post);

      post.querySelector('.ig-post-frame').addEventListener('click', () => navigate('/product', { id: p.id }));
      post.querySelector('.ig-add-cart')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!store.isLoggedIn) { showToast('Sign in to add items', 'info'); navigate('/login'); return; }
        store.addToCart({ id: p.id, name: p.name, price: p.price, image_url: p.image_url });
        showToast('Added to cart!', 'success');
      });
      post.querySelector('.ig-buy')?.addEventListener('click', (e) => {
        e.stopPropagation();
        store.addToCart({ id: p.id, name: p.name, price: p.price, image_url: p.image_url });
        navigate('/cart');
      });
    }

    if (hasMore) {
      const sentinel = document.createElement('div');
      sentinel.style.cssText = 'height:1px;scroll-snap-align:none;';
      feed.appendChild(sentinel);
      const obs = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMore) loadProducts(true);
      }, { rootMargin: '300px' });
      obs.observe(sentinel);
    }

    if (products.length === 0) {
      feed.innerHTML = `
        <div style="height:100%;display:flex;align-items:center;justify-content:center;text-align:center;">
          <div><div style="font-size:3rem;margin-bottom:8px;">📦</div><h3 style="color:var(--text);margin-bottom:4px;">Nothing yet</h3><p style="color:var(--text2);font-size:0.85rem;">Products will show up here</p></div>
        </div>
      `;
    }
  }

  page.querySelector('#home-cart-btn')?.addEventListener('click', () => navigate('/cart'));

  store.onChange(() => {
    const badge = page.querySelector('#home-cart-badge');
    if (badge) {
      badge.textContent = store.cartCount;
      badge.style.display = store.cartCount > 0 ? 'flex' : 'none';
    }
  });

  loadProducts(false);
}
