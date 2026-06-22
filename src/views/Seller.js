import store from '../store.js';
import { showToast } from '../toast.js';
import { navigate } from '../main.js';
import * as api from '../api.js';

export default function SellerPage(page) {
  if (!store.isLoggedIn) { navigate('/login'); return; }
  if (!store.isSeller) { navigate('/'); return; }

  let activeTab = 'products';

  async function loadProducts() {
    const container = page.querySelector('.seller-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      const { products } = await api.getSellerProducts();
      if (products.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No products yet</h3><p>Add your first product to start selling</p></div>';
        return;
      }
      container.innerHTML = products.map(p => `
        <div class="seller-product-item">
          <img src="${p.image_url || ''}" alt="${p.name}"
               onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect fill=%22%231C2235%22 width=%22100%22 height=%22100%22/><text fill=%22%238A8FA8%22 font-size=%228%22 x=%2225%22 y=%2255%22 text-anchor=%22middle%22>No Img</text></svg>'" />
          <div class="info">
            <h4>${p.name}</h4>
            <div class="price">Rs ${parseFloat(p.price).toFixed(2)}</div>
            <div class="meta">Stock: ${p.stock} · ${p.is_available ? 'Active' : 'Hidden'}</div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  }

  async function loadOrders() {
    const container = page.querySelector('.seller-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      const { orders } = await api.getSellerOrders();
      if (orders.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No orders</h3><p>Orders from buyers will show here</p></div>';
        return;
      }
      container.innerHTML = orders.map(o => `
        <div class="order-card">
          <div class="row1">
            <span class="order-id">${o.id.slice(0, 8)}...</span>
            <span class="status ${o.status}">${o.status}</span>
          </div>
          <div style="font-size:0.85rem;color:var(--text);">Buyer: ${o.buyer_name || 'Unknown'}</div>
          ${o.buyer_phone ? `<div style="font-size:0.75rem;color:var(--text2);">${o.buyer_phone}</div>` : ''}
          <div style="font-weight:700;color:var(--coral);margin-top:6px;font-size:0.95rem;">Rs ${parseFloat(o.total_amount).toFixed(2)}</div>
          <div style="font-size:0.7rem;color:var(--text2);margin-top:2px;">${new Date(o.created_at).toLocaleString()}</div>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  }

  function renderAddForm() {
    const container = page.querySelector('.seller-content');
    container.innerHTML = `
      <form id="product-form" class="add-form">
        <div class="form-group">
          <label>Product Name *</label>
          <input type="text" id="p-name" placeholder="e.g. iPhone 13" required />
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="p-desc" placeholder="Describe your product..." rows="3"></textarea>
        </div>
        <div class="form-group">
          <label>Price (Rs) *</label>
          <input type="number" id="p-price" step="0.01" min="0" placeholder="0.00" required />
        </div>
        <div class="form-group">
          <label>Stock</label>
          <input type="number" id="p-stock" min="0" value="1" />
        </div>
        <div class="form-group">
          <label>Category</label>
          <select id="p-category"><option value="">Select...</option></select>
        </div>
        <div class="form-group">
          <label>Image URLs (one per line)</label>
          <textarea id="p-images" placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg" rows="3"></textarea>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;border-radius:14px;padding:14px;">Add Product</button>
      </form>
    `;

    api.getCategories().then(({ categories }) => {
      const select = page.querySelector('#p-category');
      categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id; opt.textContent = c.name;
        select.appendChild(opt);
      });
    }).catch(() => {});

    page.querySelector('#product-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = page.querySelector('#p-name').value;
      const description = page.querySelector('#p-desc').value;
      const price = page.querySelector('#p-price').value;
      const stock = parseInt(page.querySelector('#p-stock').value) || 0;
      const categoryId = page.querySelector('#p-category').value || null;
      const imagesRaw = page.querySelector('#p-images').value;
      const images = imagesRaw ? imagesRaw.split('\n').map(s => s.trim()).filter(Boolean) : [];
      const btn = page.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Adding...';
      try {
        await api.createProduct({ name, description, price, stock, categoryId, images });
        showToast('Product added!', 'success');
        activeTab = 'products';
        renderTabs(); loadProducts();
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Add Product';
      }
    });
  }

  function renderTabs() {
    const tabs = page.querySelector('.seller-tabs');
    tabs.innerHTML = `
      <button class="seller-tab ${activeTab === 'products' ? 'active' : ''}" data-tab="products">My Products</button>
      <button class="seller-tab ${activeTab === 'orders' ? 'active' : ''}" data-tab="orders">Orders</button>
      <button class="seller-tab ${activeTab === 'add' ? 'active' : ''}" data-tab="add">+ Add</button>
    `;
    tabs.querySelectorAll('.seller-tab').forEach(el => {
      el.addEventListener('click', () => {
        activeTab = el.dataset.tab;
        renderTabs();
        if (activeTab === 'products') loadProducts();
        else if (activeTab === 'orders') loadOrders();
        else renderAddForm();
      });
    });
  }

  page.innerHTML = `
    <div style="height:100dvh;display:flex;flex-direction:column;background:var(--bg);">
      <div class="topbar">
        <span class="logo">Seller</span>
        <div class="topbar-right"></div>
      </div>
      <div class="seller-tabs"></div>
      <div class="seller-content"></div>
    </div>
  `;

  renderTabs();
  loadProducts();
}
