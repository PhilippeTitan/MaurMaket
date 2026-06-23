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
            <div style="display:flex;gap:6px;margin-top:6px;">
              <button class="btn btn-sm btn-outline edit-product-btn" data-id="${p.id}" style="padding:4px 12px;font-size:0.7rem;">Edit</button>
              <button class="btn btn-sm btn-ghost delete-product-btn" data-id="${p.id}" style="padding:4px 12px;font-size:0.7rem;color:var(--coral);">Delete</button>
            </div>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.edit-product-btn').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.dataset.id;
          const product = products.find(p => p.id === id);
          if (product) renderEditForm(product);
        });
      });

      container.querySelectorAll('.delete-product-btn').forEach(el => {
        el.addEventListener('click', async () => {
          const id = el.dataset.id;
          if (!confirm('Delete this product?')) return;
          try {
            await api.deleteProduct(id);
            showToast('Product deleted', 'info');
            loadProducts();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  }

  function renderEditForm(product) {
    activeTab = 'edit';
    renderTabs();
    const container = page.querySelector('.seller-content');
    container.innerHTML = `
      <form id="product-form" class="add-form">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <i class="ti ti-arrow-left" id="edit-back" style="font-size:20px;color:var(--text2);cursor:pointer;"></i>
          <h3 style="font-size:1rem;">Edit Product</h3>
        </div>
        <div class="form-group">
          <label>Product Name *</label>
          <input type="text" id="p-name" value="${product.name}" required />
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="p-desc" rows="3">${product.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label>Price (Rs) *</label>
          <input type="number" id="p-price" step="0.01" min="0" value="${product.price}" required />
        </div>
        <div class="form-group">
          <label>Stock</label>
          <input type="number" id="p-stock" min="0" value="${product.stock}" />
        </div>
        <div class="form-group">
          <label>Available</label>
          <select id="p-available">
            <option value="true" ${product.is_available ? 'selected' : ''}>Active</option>
            <option value="false" ${!product.is_available ? 'selected' : ''}>Hidden</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;border-radius:14px;padding:14px;">Save Changes</button>
        <button type="button" class="btn btn-ghost" id="edit-cancel" style="width:100%;margin-top:6px;">Cancel</button>
      </form>
    `;

    page.querySelector('#edit-back').addEventListener('click', () => { activeTab = 'products'; renderTabs(); loadProducts(); });
    page.querySelector('#edit-cancel').addEventListener('click', () => { activeTab = 'products'; renderTabs(); loadProducts(); });

    page.querySelector('#product-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = page.querySelector('#p-name').value;
      const description = page.querySelector('#p-desc').value;
      const price = page.querySelector('#p-price').value;
      const stock = parseInt(page.querySelector('#p-stock').value) || 0;
      const isAvailable = page.querySelector('#p-available').value === 'true';
      const btn = page.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Saving...';
      try {
        await api.updateProduct(product.id, { name, description, price, stock, isAvailable });
        showToast('Product updated!', 'success');
        activeTab = 'products';
        renderTabs(); loadProducts();
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Save Changes';
      }
    });
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

  async function loadBalance() {
    const container = page.querySelector('.seller-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      const { balance } = await api.getSellerBalance();
      const { payouts } = await api.getSellerPayouts();

      container.innerHTML = `
        <div style="padding:16px;">
          <div class="balance-card" style="background:var(--surface);border-radius:16px;padding:20px;margin-bottom:16px;">
            <div style="font-size:0.8rem;color:var(--text2);margin-bottom:4px;">Available Balance</div>
            <div style="font-size:2rem;font-weight:700;color:var(--coral);">Rs ${parseFloat(balance.balance).toFixed(2)}</div>
            <div style="display:flex;gap:16px;margin:16px 0;">
              <div style="flex:1;">
                <div style="font-size:0.7rem;color:var(--text2);">Total Earned</div>
                <div style="font-size:1rem;font-weight:600;color:var(--text);">Rs ${parseFloat(balance.total_earned).toFixed(2)}</div>
              </div>
              <div style="flex:1;">
                <div style="font-size:0.7rem;color:var(--text2);">Total Paid Out</div>
                <div style="font-size:1rem;font-weight:600;color:var(--text);">Rs ${parseFloat(balance.total_paid_out).toFixed(2)}</div>
              </div>
            </div>
            <button class="btn btn-primary" id="request-payout-btn" style="width:100%;border-radius:14px;padding:14px;" ${balance.balance <= 0 ? 'disabled' : ''}>
              Request Payout
            </button>
          </div>
          <h3 style="font-size:1rem;margin:0 0 12px 0;color:var(--text);">Payout History</h3>
          ${payouts.length === 0
            ? '<p style="color:var(--text2);font-size:0.85rem;">No payouts yet</p>'
            : payouts.map(p => `
              <div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface);border-radius:12px;padding:12px;margin-bottom:8px;">
                <div>
                  <div style="font-weight:600;color:var(--text);">Rs ${parseFloat(p.amount).toFixed(2)}</div>
                  <div style="font-size:0.7rem;color:var(--text2);">${new Date(p.created_at).toLocaleDateString()}</div>
                </div>
                <span style="font-size:0.75rem;padding:2px 10px;border-radius:20px;background:${p.status === 'completed' ? 'var(--green)' : p.status === 'failed' ? 'var(--coral)' : 'var(--accent2)'};color:white;">${p.status}</span>
              </div>
            `).join('')
          }
        </div>
      `;

      const btn = page.querySelector('#request-payout-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          const amount = prompt('Enter amount to withdraw (Rs):');
          if (amount && parseFloat(amount) > 0) {
            requestPayoutAction(parseFloat(amount));
          }
        });
      }
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  }

  async function requestPayoutAction(amount) {
    const btn = page.querySelector('#request-payout-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }
    try {
      await api.requestPayout(amount);
      showToast('Payout requested! Check your MonCash soon.', 'success');
      loadBalance();
    } catch (err) {
      showToast(err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Request Payout'; }
    }
  }

  function renderTabs() {
    const tabs = page.querySelector('.seller-tabs');
    const isEdit = activeTab === 'edit';
    tabs.innerHTML = `
      <button class="seller-tab ${activeTab === 'products' ? 'active' : ''}" data-tab="products">Products</button>
      <button class="seller-tab ${activeTab === 'orders' ? 'active' : ''}" data-tab="orders">Orders</button>
      <button class="seller-tab ${activeTab === 'balance' ? 'active' : ''}" data-tab="balance">Balance</button>
      <button class="seller-tab ${activeTab === 'add' || isEdit ? 'active' : ''}" data-tab="add">+ Add</button>
    `;
    tabs.querySelectorAll('.seller-tab').forEach(el => {
      el.addEventListener('click', () => {
        activeTab = el.dataset.tab;
        renderTabs();
        if (activeTab === 'products') loadProducts();
        else if (activeTab === 'orders') loadOrders();
        else if (activeTab === 'balance') loadBalance();
        else renderAddForm();
      });
    });
  }

  page.innerHTML = `
    <div style="height:100%;display:flex;flex-direction:column;background:var(--bg);">
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
