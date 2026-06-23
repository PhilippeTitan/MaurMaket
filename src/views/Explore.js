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
        <div class="topbar-right"><i class="ti ti-adjustments-horizontal" id="filter-toggle"></i></div>
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
      <div id="filter-panel" style="display:none;padding:0 16px 12px;background:var(--bg);">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <select id="sort-select" style="flex:1;min-width:100px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px 10px;color:var(--text);font-size:0.8rem;">
            <option value="">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
          <input type="number" id="min-price" placeholder="Min Rs" style="flex:1;min-width:80px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px 10px;color:var(--text);font-size:0.8rem;" />
          <input type="number" id="max-price" placeholder="Max Rs" style="flex:1;min-width:80px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px 10px;color:var(--text);font-size:0.8rem;" />
          <button class="btn btn-sm btn-primary" id="apply-filters" style="padding:8px 14px;font-size:0.8rem;border-radius:10px;">Apply</button>
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
  let currentSort = '';
  let currentMinPrice = '';
  let currentMaxPrice = '';

  async function loadProducts() {
    const container = page.querySelector('#explore-grid');
    container.innerHTML = '<div class="loading" style="height:40vh;"><div class="spinner"></div></div>';
    try {
      const params = { limit: 50 };
      if (currentSearch) params.search = currentSearch;
      if (currentCategory) params.category = currentCategory;
      if (currentSort) params.sort = currentSort;
      if (currentMinPrice) params.minPrice = currentMinPrice;
      if (currentMaxPrice) params.maxPrice = currentMaxPrice;
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

  let filterVisible = false;
  page.querySelector('#filter-toggle').addEventListener('click', () => {
    filterVisible = !filterVisible;
    const panel = page.querySelector('#filter-panel');
    panel.style.display = filterVisible ? 'block' : 'none';
  });

  page.querySelector('#apply-filters').addEventListener('click', () => {
    currentSort = page.querySelector('#sort-select').value;
    currentMinPrice = page.querySelector('#min-price').value;
    currentMaxPrice = page.querySelector('#max-price').value;
    loadProducts();
  });

  page.querySelector('#sort-select').addEventListener('change', () => {
    currentSort = page.querySelector('#sort-select').value;
    loadProducts();
  });

  loadProducts();
}
