import store from '../store.js';
import { showToast } from '../toast.js';
import { navigate } from '../main.js';
import * as api from '../api.js';

export default function SellerPage(page) {
  if (!store.isLoggedIn) { navigate('/login'); return; }
  if (!store.isSeller) { navigate('/'); return; }

  let state = { products: [], orders: [], balance: null, payouts: [] };

  async function loadAll() {
    try {
      const [prodRes, ordRes, balRes, payRes] = await Promise.all([
        api.getSellerProducts(),
        api.getSellerOrders().catch(() => ({ orders: [] })),
        api.getSellerBalance().catch(() => ({ balance: { balance: 0, total_earned: 0, total_paid_out: 0 } })),
        api.getSellerPayouts().catch(() => ({ payouts: [] })),
      ]);
      state.products = prodRes.products || [];
      state.orders = ordRes.orders || [];
      state.balance = balRes.balance || { balance: 0, total_earned: 0, total_paid_out: 0 };
      state.payouts = payRes.payouts || [];
      renderDash();
    } catch (err) {
      page.innerHTML = `<div style="height:100%;display:flex;flex-direction:column;background:var(--bg);"><div class="topbar"><span class="logo">Seller</span></div><div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:0.85rem;"><p>${err.message}</p></div></div>`;
    }
  }

  function renderDash() {
    const { products, orders, balance, payouts } = state;
    const activeOrders = orders.filter(o => o.status !== 'completed' && o.status !== 'cancelled' && o.status !== 'delivered').length;
    const colors = ['#FF4D6A', '#00C2FF', '#00E5A0', '#FF9F1C', '#B388FF', '#FF6B6B'];

    page.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;background:var(--bg);">
        <div class="topbar">
          <span class="logo">Seller</span>
          <div class="topbar-right"></div>
        </div>
        <div class="seller-content" style="flex:1;overflow-y:auto;scrollbar-width:none;padding:0 12px 80px;">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0 14px;">
            <div class="stat-card" style="padding:10px 4px;"><div class="stat-num" style="font-size:18px;">${products.length}</div><div class="stat-label">Items</div></div>
            <div class="stat-card" style="padding:10px 4px;"><div class="stat-num" style="font-size:18px;color:var(--blue);">${activeOrders}</div><div class="stat-label">Active</div></div>
            <div class="stat-card" style="padding:10px 4px;"><div class="stat-num" style="font-size:16px;color:var(--green);">Rs ${parseFloat(balance.balance).toFixed(0)}</div><div class="stat-label">Balance</div></div>
            <div class="stat-card" style="padding:10px 4px;"><div class="stat-num" style="font-size:16px;">Rs ${parseFloat(balance.total_earned).toFixed(0)}</div><div class="stat-label">Earned</div></div>
          </div>

          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <div class="section-label" style="margin:0;flex:1;">My Items</div>
            <button class="btn btn-sm" id="add-product-btn" style="background:var(--coral);color:#fff;border:none;border-radius:10px;padding:6px 14px;font-size:0.75rem;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;display:flex;align-items:center;gap:4px;"><i class="ti ti-plus" style="font-size:14px;"></i> Add</button>
            <button class="btn btn-sm btn-ghost" id="refresh-btn" style="padding:6px;border-radius:10px;font-size:0.75rem;"><i class="ti ti-refresh"></i></button>
          </div>

          <div id="products-section">
            ${products.length === 0 ? '<div style="text-align:center;padding:20px;color:var(--text2);font-size:0.85rem;background:var(--surface);border-radius:14px;border:1px dashed var(--border);">No items yet — tap + Add to list your first product</div>' : `
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
                ${products.map((p, i) => {
                  const img = p.image_url || null;
                  const c = colors[p.name.length % colors.length];
                  return `
                    <div class="seller-grid-cell" data-id="${p.id}" style="cursor:pointer;border-radius:10px;overflow:hidden;background:var(--surface);border:1px solid var(--border);position:relative;">
                      <div style="width:100%;aspect-ratio:1;${img ? `background-image:url(${img});background-size:cover;background-position:center;` : `background:linear-gradient(135deg,${c},${c}88);display:flex;align-items:center;justify-content:center;`}">
                        ${!img ? `<span style="font-size:1.8rem;font-weight:700;color:#fff;font-family:'Syne',sans-serif;">${p.name[0]}</span>` : ''}
                        ${!p.is_available ? '<div style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.7);color:#fff;font-size:8px;padding:2px 6px;border-radius:4px;">Hidden</div>' : ''}
                      </div>
                      <div style="padding:5px 7px 7px;">
                        <div style="font-size:10px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</div>
                        <div style="font-size:10px;font-weight:700;color:var(--coral);margin-top:1px;">Rs ${parseFloat(p.price).toFixed(0)}</div>
                        <div style="font-size:9px;color:var(--text2);">Stock: ${p.stock}</div>
                      </div>
                      <button class="seller-delete-btn" data-id="${p.id}" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;border:none;background:rgba(0,0,0,0.6);color:#fff;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">×</button>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>

          <div class="section-label" style="margin:16px 0 8px;">Orders</div>
          <div id="orders-section">
            ${orders.length === 0 ? '<div style="text-align:center;padding:16px;color:var(--text2);font-size:0.85rem;background:var(--surface);border-radius:14px;border:1px dashed var(--border);">No orders yet</div>' : `
              ${orders.map(o => {
                const nextMap = { paid: 'processing', processing: 'shipped', shipped: 'delivered' };
                const next = nextMap[o.status];
                return `
                  <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:6px;">
                    <div style="display:flex;justify-content:space-between;align-items:start;">
                      <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                          <span style="font-size:10px;color:var(--text2);">${o.id.slice(0,8)}...</span>
                          <span style="font-size:9px;padding:2px 7px;border-radius:6px;font-weight:600;background:${o.status === 'delivered' || o.status === 'completed' ? 'rgba(0,229,160,0.12)' : o.status === 'cancelled' ? 'rgba(255,77,106,0.12)' : 'rgba(0,194,255,0.12)'};color:${o.status === 'delivered' || o.status === 'completed' ? 'var(--green)' : o.status === 'cancelled' ? 'var(--coral)' : 'var(--blue)'};">${o.status}</span>
                        </div>
                        <div style="font-size:13px;font-weight:600;color:var(--coral);">Rs ${parseFloat(o.total_amount).toFixed(0)}</div>
                        <div style="font-size:10px;color:var(--text2);">${o.buyer_name || 'Buyer'} ${o.buyer_phone ? '· ' + o.buyer_phone : ''}</div>
                      </div>
                      ${next ? `<button class="status-btn" data-id="${o.id}" data-next="${next}" style="background:var(--coral);color:#fff;border:none;border-radius:8px;padding:5px 10px;font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:'Inter',sans-serif;flex-shrink:0;">${next}</button>` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            `}
          </div>

          <div class="section-label" style="margin:16px 0 8px;">Balance</div>
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div>
                <div style="font-size:11px;color:var(--text2);">Available</div>
                <div style="font-size:22px;font-weight:700;color:var(--coral);">Rs ${parseFloat(balance.balance).toFixed(0)}</div>
              </div>
              <button class="btn btn-primary" id="payout-btn" style="padding:8px 16px;border-radius:10px;font-size:0.75rem;" ${balance.balance <= 0 ? 'disabled' : ''}>Withdraw</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px;">
              <div><span style="color:var(--text2);">Earned:</span> <span style="color:var(--text);font-weight:600;">Rs ${parseFloat(balance.total_earned).toFixed(0)}</span></div>
              <div><span style="color:var(--text2);">Paid out:</span> <span style="color:var(--text);font-weight:600;">Rs ${parseFloat(balance.total_paid_out).toFixed(0)}</span></div>
            </div>
            ${state.payouts.length > 0 ? `
              <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
                <div style="font-size:10px;color:var(--text2);margin-bottom:6px;">Recent payouts</div>
                ${state.payouts.slice(0, 3).map(p => `
                  <div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;">
                    <span style="color:var(--text);">Rs ${parseFloat(p.amount).toFixed(0)}</span>
                    <span style="color:${p.status === 'completed' ? 'var(--green)' : p.status === 'failed' ? 'var(--coral)' : 'var(--text2)'};">${p.status}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    page.querySelector('#add-product-btn').addEventListener('click', showAddForm);
    page.querySelector('#refresh-btn').addEventListener('click', loadAll);

    page.querySelector('#products-section')?.addEventListener('click', (e) => {
      const cell = e.target.closest('.seller-grid-cell');
      if (cell && !e.target.closest('.seller-delete-btn')) {
        const product = state.products.find(p => p.id === cell.dataset.id);
        if (product) showEditForm(product);
      }
      const delBtn = e.target.closest('.seller-delete-btn');
      if (delBtn) {
        const id = delBtn.dataset.id;
        if (confirm('Delete this item?')) {
          api.deleteProduct(id).then(() => { showToast('Deleted', 'info'); loadAll(); }).catch(e => showToast(e.message, 'error'));
        }
      }
    });

    page.querySelector('#orders-section')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.status-btn');
      if (btn) {
        btn.disabled = true; btn.textContent = '...';
        api.updateOrderStatus(btn.dataset.id, btn.dataset.next)
          .then(() => { showToast('Order ' + btn.dataset.next, 'success'); loadAll(); })
          .catch(e => { showToast(e.message, 'error'); btn.disabled = false; btn.textContent = btn.dataset.next; });
      }
    });

    page.querySelector('#payout-btn')?.addEventListener('click', () => {
      const amount = prompt('Withdraw amount (Rs):');
      if (amount && parseFloat(amount) > 0) {
        api.requestPayout(parseFloat(amount))
          .then(() => { showToast('Payout requested!', 'success'); loadAll(); })
          .catch(e => showToast(e.message, 'error'));
      }
    });
  }

  function showAddForm() {
    showProductForm(null);
  }

  function showEditForm(product) {
    showProductForm(product);
  }

  function showProductForm(product) {
    const isEdit = !!product;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:flex-end;padding:0;overflow-y:auto;';
    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:20px 20px 0 0;padding:20px;width:100%;max-height:92vh;overflow-y:auto;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
          <i class="ti ti-arrow-left" id="form-back" style="font-size:20px;color:var(--text2);cursor:pointer;"></i>
          <h3 style="font-size:1.05rem;margin:0;">${isEdit ? 'Edit' : 'New'} Product</h3>
        </div>

        <div class="form-group">
          <label>Name</label>
          <input type="text" id="f-name" value="${isEdit ? product.name : ''}" placeholder="What are you selling?" required />
        </div>

        <div class="form-group">
          <label>Description</label>
          <textarea id="f-desc" rows="2" placeholder="Brief description...">${isEdit ? (product.description || '') : ''}</textarea>
        </div>

        <div class="form-group">
          <label>Price: <strong id="price-display" style="color:var(--coral);">Rs ${isEdit ? parseFloat(product.price).toFixed(0) : '500'}</strong></label>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:11px;color:var(--text2);min-width:30px;">Rs 0</span>
            <input type="range" id="f-price" min="0" max="100000" step="50" value="${isEdit ? Math.min(parseFloat(product.price), 100000) : '500'}" style="flex:1;height:6px;-webkit-appearance:none;appearance:none;background:linear-gradient(to right,var(--coral) ${Math.min((isEdit ? parseFloat(product.price) : 500) / 100000 * 100, 100)}%,var(--border) ${Math.min((isEdit ? parseFloat(product.price) : 500) / 100000 * 100, 100)}%);border-radius:3px;outline:none;cursor:pointer;" />
            <span style="font-size:11px;color:var(--text2);min-width:40px;">Rs 100k</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text2);margin-top:2px;">
            <span>Common: Rs 50-500 (accessories), Rs 500-5000 (electronics), Rs 5k-50k (furniture)</span>
          </div>
        </div>

        <div class="form-group">
          <label>Stock</label>
          <div style="display:flex;align-items:center;gap:8px;">
            <button type="button" class="stock-adjust" data-delta="-1" style="width:36px;height:36px;border-radius:50%;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">−</button>
            <input type="number" id="f-stock" value="${isEdit ? product.stock : '1'}" min="0" style="width:50px;text-align:center;font-size:16px;font-weight:700;" />
            <button type="button" class="stock-adjust" data-delta="1" style="width:36px;height:36px;border-radius:50%;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">+</button>
            <span style="font-size:10px;color:var(--text2);">units</span>
          </div>
        </div>

        <div class="form-group">
          <label>Category</label>
          <select id="f-category"><option value="">Select...</option></select>
        </div>

        <div class="form-group">
          <label>Images</label>
          <input type="file" id="f-images-file" accept="image/*" multiple style="display:none;" />
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;" id="image-previews"></div>
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn btn-sm btn-outline" id="f-upload-btn" style="padding:6px 12px;font-size:0.7rem;border-radius:8px;">+ Upload</button>
            <button type="button" class="btn btn-sm btn-ghost" id="f-url-btn" style="padding:6px 12px;font-size:0.7rem;border-radius:8px;">Paste URL</button>
          </div>
          <textarea id="f-image-urls" placeholder="Paste image URLs (one per line)" rows="2" style="margin-top:6px;font-size:0.75rem;display:none;"></textarea>
        </div>

        <button type="submit" id="form-submit" class="btn btn-primary" style="width:100%;border-radius:14px;padding:14px;margin-top:4px;">${isEdit ? 'Save Changes' : 'Add Product'}</button>
        <button type="button" id="form-cancel" class="btn btn-ghost" style="width:100%;margin-top:6px;">Cancel</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const uploadedUrls = [];
    if (isEdit && product.images) {
      product.images.forEach(img => {
        if (img.image_url) {
          uploadedUrls.push(img.image_url);
          addPreview(img.image_url);
        }
      });
    }

    api.getCategories().then(({ categories }) => {
      const select = overlay.querySelector('#f-category');
      categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id; opt.textContent = c.name;
        if (isEdit && product.category_id == c.id) opt.selected = true;
        select.appendChild(opt);
      });
    }).catch(() => {});

    const priceSlider = overlay.querySelector('#f-price');
    const priceDisplay = overlay.querySelector('#price-display');
    priceSlider.addEventListener('input', () => {
      const val = parseInt(priceSlider.value);
      priceDisplay.textContent = 'Rs ' + val;
      const pct = Math.min(val / 100000 * 100, 100);
      priceSlider.style.background = `linear-gradient(to right,var(--coral) ${pct}%,var(--border) ${pct}%)`;
    });

    overlay.querySelectorAll('.stock-adjust').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = overlay.querySelector('#f-stock');
        const val = parseInt(input.value) || 0;
        input.value = Math.max(0, val + parseInt(btn.dataset.delta));
      });
    });

    overlay.querySelector('#f-upload-btn').addEventListener('click', () => {
      overlay.querySelector('#f-images-file').click();
    });

    overlay.querySelector('#f-url-btn').addEventListener('click', () => {
      const ta = overlay.querySelector('#f-image-urls');
      ta.style.display = ta.style.display === 'none' ? 'block' : 'none';
    });

    overlay.querySelector('#f-images-file').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      for (const file of files) {
        try {
          const data = await api.uploadImage(file);
          if (data.url) {
            uploadedUrls.push(data.url);
            addPreview(data.url);
          }
        } catch (err) {
          showToast('Upload failed', 'error');
        }
      }
    });

    function addPreview(url) {
      const container = overlay.querySelector('#image-previews');
      const div = document.createElement('div');
      div.style.cssText = 'width:52px;height:52px;border-radius:8px;overflow:hidden;position:relative;flex-shrink:0;';
      div.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" /><span data-url="${url}" style="position:absolute;top:2px;right:2px;background:var(--coral);color:white;border-radius:50%;width:16px;height:16px;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;">×</span>`;
      div.querySelector('span').addEventListener('click', function () {
        const idx = uploadedUrls.indexOf(this.dataset.url);
        if (idx > -1) uploadedUrls.splice(idx, 1);
        div.remove();
      });
      container.appendChild(div);
    }

    overlay.querySelector('#form-back').addEventListener('click', () => document.body.removeChild(overlay));
    overlay.querySelector('#form-cancel').addEventListener('click', () => document.body.removeChild(overlay));

    overlay.querySelector('#form-submit').addEventListener('click', async () => {
      const name = overlay.querySelector('#f-name').value.trim();
      const desc = overlay.querySelector('#f-desc').value.trim();
      const price = parseInt(priceSlider.value);
      const stock = parseInt(overlay.querySelector('#f-stock').value) || 0;
      const categoryId = overlay.querySelector('#f-category').value || null;
      const urlsText = overlay.querySelector('#f-image-urls').value;
      const urlsFromText = urlsText ? urlsText.split('\n').map(s => s.trim()).filter(Boolean) : [];
      const images = [...uploadedUrls, ...urlsFromText];

      if (!name) { showToast('Product name required', 'error'); return; }
      if (price <= 0) { showToast('Price must be greater than 0', 'error'); return; }

      const btn = overlay.querySelector('#form-submit');
      btn.disabled = true; btn.textContent = isEdit ? 'Saving...' : 'Adding...';

      try {
        if (isEdit) {
          await api.updateProduct(product.id, { name, description: desc, price, stock, isAvailable: true, categoryId });
        } else {
          await api.createProduct({ name, description: desc, price, stock, categoryId, images });
        }
        showToast(isEdit ? 'Product updated!' : 'Product added!', 'success');
        document.body.removeChild(overlay);
        loadAll();
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false; btn.textContent = isEdit ? 'Save Changes' : 'Add Product';
      }
    });
  }

  loadAll();
}
