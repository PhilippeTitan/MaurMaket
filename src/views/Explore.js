import * as api from '../api.js';
import { navigate } from '../main.js';

const categoryList = ['All', 'Electronics', 'Fashion', 'Home', 'Sports', 'Books'];

const gradientBgs = [
  'linear-gradient(135deg,#1C2235,#2a1a3e)',
  'linear-gradient(135deg,#1a2535,#0f1c2e)',
  'linear-gradient(135deg,#2a1a1a,#1a0f0f)',
  'linear-gradient(135deg,#1a351a,#0f2e0f)',
  'linear-gradient(135deg,#1a1a35,#0f0f2e)',
  'linear-gradient(135deg,#35351a,#2e2e0f)',
  'linear-gradient(135deg,#2a1535,#1a0f2e)',
  'linear-gradient(135deg,#351a1a,#2e0f0f)',
];

const emojis = ['☕', '📱', '👟', '🎧', '💻', '🕶️', '🎮', '👜', '📷', '⌚'];

const sizeClasses = ['h1', 'h2', 'h3', 'h1', 'h2', 'h3', 'h2', 'h1'];

export default async function ExplorePage(page) {
  page.innerHTML = `
    <div class="explore-page">
      <div class="topbar">
        <span class="logo">Maur<span>Maket</span></span>
        <div class="topbar-right"><i class="ti ti-adjustments-horizontal"></i></div>
      </div>
      <div class="explore-top">
        <div class="search-bar">
          <i class="ti ti-search"></i>
          <input type="text" id="explore-search" placeholder="Search MaurMaket..." />
        </div>
        <div class="cats" id="category-pills">
          ${categoryList.map((cat, i) => `
            <button class="cat-pill ${i === 0 ? 'active' : ''}" data-cat="${cat}">${cat}</button>
          `).join('')}
        </div>
      </div>
      <div id="explore-grid" class="pin-grid">
        <div class="loading" style="height:40vh;"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  let allProducts = [];
  let currentSearch = '';
  let currentCategory = '';

  async function loadProducts() {
    const container = page.querySelector('#explore-grid');
    container.innerHTML = '<div class="loading" style="height:40vh;"><div class="spinner"></div></div>';
    try {
      const params = { limit: 50 };
      if (currentSearch) params.search = currentSearch;
      if (currentCategory) params.category = currentCategory;
      const data = await api.getProducts(params);
      allProducts = data.products;
      renderMasonry();
    } catch (err) {
      container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text2);"><p>${err.message}</p></div>`;
    }
  }

  function renderMasonry() {
    const container = page.querySelector('#explore-grid');
    if (allProducts.length === 0) {
      container.innerHTML = '<div style="padding:80px 20px;text-align:center;color:var(--text2);"><h3 style="color:var(--text);margin-bottom:4px;">No results</h3><p style="font-size:0.85rem;">Try a different search</p></div>';
      return;
    }

    const items = allProducts.map((p, i) => {
      const size = sizeClasses[i % sizeClasses.length];
      const bg = gradientBgs[i % gradientBgs.length];
      const emoji = emojis[i % emojis.length];
      return { ...p, size, bg, emoji };
    });

    container.innerHTML = items.map(p => `
      <div class="pin-item" data-id="${p.id}">
        <div class="pin-img ${p.size}" style="background:${p.bg};">
          <span>${p.emoji}</span>
          <img src="${p.image_url || ''}" alt="${p.name}" loading="lazy"
               style="width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;"
               onerror="this.style.display='none'" />
        </div>
        <div class="pin-info">
          <div class="pin-price">Rs ${parseFloat(p.price).toFixed(0)}</div>
          <div class="pin-title">${p.name}</div>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.pin-item').forEach(el => {
      el.addEventListener('click', () => {
        navigate('/product', { id: el.dataset.id });
      });
    });
  }

  page.querySelector('#category-pills').addEventListener('click', (e) => {
    const pill = e.target.closest('.cat-pill');
    if (!pill) return;
    page.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentCategory = pill.dataset.cat === 'All' ? '' : pill.dataset.cat;
    loadProducts();
  });

  page.querySelector('#explore-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      currentSearch = e.target.value.trim();
      loadProducts();
    }
  });

  loadProducts();
}
