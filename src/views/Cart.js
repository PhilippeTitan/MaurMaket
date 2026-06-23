import store from '../store.js';
import { showToast } from '../toast.js';
import { navigate } from '../main.js';
import * as api from '../api.js';

const emojis = ['☕', '📱', '👟', '🎧', '💻', '🕶️', '🎮', '👜'];

export default function CartPage(page) {
  function render() {
    const cart = store.cart;
    const isFullscreen = !document.getElementById('tab-bar') || document.getElementById('tab-bar').style.display === 'none';

    if (cart.length === 0) {
      page.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;background:var(--bg);">
          <div class="topbar">
            ${isFullscreen ? '<i class="ti ti-arrow-left" id="cart-back" style="font-size:22px;color:var(--text2);cursor:pointer;padding:4px;"></i>' : ''}
            <span class="logo" style="${isFullscreen ? 'margin-left:4px;' : ''}">Cart</span>
            <div class="topbar-right"></div>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;">
            <div style="font-size:3rem;margin-bottom:8px;">🛒</div>
            <h3 style="margin-bottom:4px;">Cart is empty</h3>
            <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px;">Browse and add items you like</p>
          </div>
        </div>
      `;
      page.querySelector('#cart-back')?.addEventListener('click', () => window.history.back());
      return;
    }

    const total = cart.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);

    page.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;background:var(--bg);">
        <div class="topbar">
          ${isFullscreen ? '<i class="ti ti-arrow-left" id="cart-back" style="font-size:22px;color:var(--text2);cursor:pointer;padding:4px;"></i>' : ''}
          <span class="logo" style="${isFullscreen ? 'margin-left:4px;' : ''}">Cart</span>
          <div class="topbar-right"><i class="ti ti-trash" id="clear-cart" style="cursor:pointer;"></i></div>
        </div>
        <div class="cart-body">
          ${cart.map((item, i) => `
            <div class="cart-item" data-id="${item.id}">
              <div class="cart-thumb">
                <span>${emojis[i % emojis.length]}</span>
                ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}" onerror="this.style.display='none'" />` : ''}
              </div>
              <div class="cart-info">
                <div class="cart-title">${item.name}</div>
                <div class="cart-price">Rs ${parseFloat(item.price).toFixed(0)}</div>
                <div class="qty-row">
                  <button class="qty-btn qty-minus">−</button>
                  <span class="qty-val">${item.quantity}</span>
                  <button class="qty-btn qty-plus">+</button>
                  <button class="cart-remove qty-remove"><i class="ti ti-trash"></i></button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="cart-footer">
          <div class="cart-total">Total: <span>Rs ${total.toFixed(0)}</span></div>
          <button class="btn btn-primary" id="checkout-btn" style="border-radius:14px;padding:11px 22px;">Checkout →</button>
        </div>
      </div>
    `;

    page.querySelector('.cart-body').addEventListener('click', (e) => {
      const el = e.target.closest('.cart-item');
      if (!el) return;
      const id = el.dataset.id;
      const item = store.cart.find(c => c.id === id);
      if (!item) return;
      if (e.target.closest('.qty-plus')) store.updateQuantity(id, item.quantity + 1);
      else if (e.target.closest('.qty-minus')) store.updateQuantity(id, item.quantity - 1);
      else if (e.target.closest('.qty-remove')) store.removeFromCart(id);
    });

    page.querySelector('#clear-cart')?.addEventListener('click', () => {
      if (store.cart.length > 0) {
        store.clearCart();
        showToast('Cart cleared', 'info');
      }
    });

    page.querySelector('#cart-back')?.addEventListener('click', () => window.history.back());

    page.querySelector('#checkout-btn').addEventListener('click', () => {
      if (!store.isLoggedIn) { showToast('Sign in to checkout', 'info'); navigate('/login'); return; }
      showDeliveryForm();
    });

    function showDeliveryForm() {
      const userPhone = store.user?.phone || '';
      const userDisplayPhone = userPhone.replace(/^509/, '');
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;';
      overlay.innerHTML = `
        <div style="background:var(--surface);border-radius:20px;padding:20px;max-width:360px;width:100%;max-height:90vh;overflow-y:auto;">
          <h3 style="margin-bottom:4px;font-size:1.1rem;">Delivery Options</h3>
          <p style="color:var(--text2);font-size:0.8rem;margin-bottom:14px;">How should the seller get your items to you?</p>

          <div style="display:flex;gap:8px;margin-bottom:14px;">
            <button class="delivery-method-btn active" data-method="meetup" style="flex:1;padding:10px;border:2px solid var(--coral);border-radius:14px;background:rgba(255,77,106,0.1);color:var(--coral);cursor:pointer;text-align:center;font-size:0.8rem;font-weight:600;font-family:'Inter',sans-serif;">
              <div style="font-size:1.5rem;">📍</div>
              Meetup
            </button>
            <button class="delivery-method-btn" data-method="delivery" style="flex:1;padding:10px;border:2px solid var(--border);border-radius:14px;background:var(--surface);color:var(--text2);cursor:pointer;text-align:center;font-size:0.8rem;font-weight:500;font-family:'Inter',sans-serif;">
              <div style="font-size:1.5rem;">🚚</div>
              Delivery
            </button>
          </div>

          <div id="delivery-fields" style="display:none;">
            <div class="form-group">
              <label>Saved Addresses</label>
              <select id="d-saved" style="padding:10px 14px;font-size:0.85rem;">
                <option value="">— Enter new address —</option>
              </select>
            </div>
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" id="d-name" value="${store.user?.full_name || ''}" placeholder="Recipient name" />
            </div>
            <div class="form-group">
              <label>Phone</label>
              <div style="display:flex;gap:0;align-items:stretch;">
                <div style="background:var(--bg);border:1px solid var(--border);border-right:none;border-radius:14px 0 0 14px;padding:14px 10px;color:var(--text2);font-size:1rem;font-weight:600;white-space:nowrap;display:flex;align-items:center;">+509</div>
                <input type="tel" id="d-phone" value="${userDisplayPhone}" placeholder="XX XX XXXX" style="border-radius:0 14px 14px 0;" />
              </div>
            </div>
            <div class="form-group">
              <label>Address</label>
              <input type="text" id="d-address" placeholder="Street, neighborhood, landmark" />
            </div>
            <div class="form-group">
              <label>City / Town</label>
              <input type="text" id="d-city" placeholder="e.g. Port-au-Prince, Jacmel" />
            </div>
            <div class="form-group">
              <label>Delivery Notes (optional)</label>
              <textarea id="d-note" placeholder="e.g. Call when arriving, leave at gate" rows="2"></textarea>
            </div>
            <label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:var(--text2);cursor:pointer;">
              <input type="checkbox" id="d-save-address" /> Save this address for next time
            </label>
          </div>

          <div style="display:flex;justify-content:space-between;font-size:0.9rem;margin-bottom:14px;padding-top:6px;border-top:1px solid var(--border);">
            <span>Total</span>
            <span style="color:var(--coral);font-weight:700;">Rs ${cart.reduce((s, i) => s + parseFloat(i.price) * i.quantity, 0).toFixed(0)}</span>
          </div>

          <button id="delivery-proceed" class="btn btn-primary" style="width:100%;border-radius:14px;padding:14px;">Proceed to Payment</button>
          <button id="delivery-cancel" class="btn btn-ghost" style="width:100%;margin-top:6px;">Cancel</button>
        </div>
      `;
      document.body.appendChild(overlay);

      let method = 'meetup';
      let savedAddresses = [];

      // Load saved addresses
      api.getAddresses().then(data => {
        savedAddresses = data.addresses || [];
        const select = overlay.querySelector('#d-saved');
        savedAddresses.forEach(addr => {
          const opt = document.createElement('option');
          opt.value = addr.id;
          opt.textContent = addr.label ? `${addr.label} — ${addr.address}, ${addr.city}` : `${addr.address}, ${addr.city}`;
          if (addr.is_default) opt.selected = true;
          select.appendChild(opt);
        });
        // Auto-fill from default address
        const def = savedAddresses.find(a => a.is_default) || savedAddresses[0];
        if (def) fillAddress(def);
      }).catch(() => {});

      function fillAddress(addr) {
        overlay.querySelector('#d-name').value = addr.name || store.user?.full_name || '';
        overlay.querySelector('#d-phone').value = (addr.phone || '').replace(/^509/, '');
        overlay.querySelector('#d-address').value = addr.address || '';
        overlay.querySelector('#d-city').value = addr.city || '';
      }

      overlay.querySelector('#d-saved').addEventListener('change', (e) => {
        const addr = savedAddresses.find(a => a.id === e.target.value);
        if (addr) fillAddress(addr);
      });

      overlay.querySelectorAll('.delivery-method-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          method = btn.dataset.method;
          overlay.querySelectorAll('.delivery-method-btn').forEach(b => {
            b.style.borderColor = 'var(--border)';
            b.style.background = 'var(--surface)';
            b.style.color = 'var(--text2)';
          });
          btn.style.borderColor = 'var(--coral)';
          btn.style.background = 'rgba(255,77,106,0.1)';
          btn.style.color = 'var(--coral)';
          const fields = overlay.querySelector('#delivery-fields');
          fields.style.display = method === 'delivery' ? 'block' : 'none';
        });
      });

      overlay.querySelector('#delivery-cancel').addEventListener('click', () => {
        document.body.removeChild(overlay);
      });

      overlay.querySelector('#delivery-proceed').addEventListener('click', async () => {
        const btn = overlay.querySelector('#delivery-proceed');
        btn.disabled = true; btn.textContent = 'Creating order...';

        const deliveryData = method === 'delivery' ? {
          deliveryMethod: 'delivery',
          deliveryName: overlay.querySelector('#d-name').value,
          deliveryPhone: '509' + overlay.querySelector('#d-phone').value.replace(/\s/g, ''),
          deliveryAddress: overlay.querySelector('#d-address').value,
          deliveryCity: overlay.querySelector('#d-city').value,
          deliveryNote: overlay.querySelector('#d-note').value,
        } : { deliveryMethod: 'meetup' };

        if (method === 'delivery' && (!deliveryData.deliveryAddress || !deliveryData.deliveryCity)) {
          showToast('Please enter your address and city', 'error');
          btn.disabled = false; btn.textContent = 'Proceed to Payment';
          return;
        }

        try {
          const { order } = await api.createOrder({
            items: store.cart.map(item => ({ productId: item.id, quantity: item.quantity })),
            ...deliveryData,
          });

          // Save address if checkbox checked
          if (method === 'delivery' && overlay.querySelector('#d-save-address').checked) {
            api.createAddress({
              label: '',
              name: deliveryData.deliveryName,
              phone: deliveryData.deliveryPhone,
              address: deliveryData.deliveryAddress,
              city: deliveryData.deliveryCity,
              isDefault: false,
            }).catch(() => {});
          }

          const returnUrl = window.location.origin + '/payment/return?order=' + order.id;
          const { paymentUrl } = await api.createPayment(order.id, returnUrl);

          document.body.removeChild(overlay);
          showMonCashModal(paymentUrl, order.id);
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false; btn.textContent = 'Proceed to Payment';
        }
      });
    }

    function showMonCashModal(paymentUrl, orderId) {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;';
      overlay.innerHTML = `
        <div style="background:var(--surface);border-radius:20px;padding:24px;max-width:320px;width:100%;text-align:center;">
          <div style="font-size:2.5rem;margin-bottom:8px;">💳</div>
          <h3 style="margin-bottom:4px;">Pay with MonCash</h3>
          <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px;">You'll be redirected to MonCash to complete your payment</p>
          <div style="text-align:left;background:var(--bg);border-radius:12px;padding:12px;margin-bottom:16px;font-size:0.8rem;color:var(--text2);">
            <div style="display:flex;gap:8px;margin-bottom:8px;"><span style="color:var(--coral);">1.</span> Confirm the payment on your phone</div>
            <div style="display:flex;gap:8px;margin-bottom:8px;"><span style="color:var(--coral);">2.</span> Wait for the confirmation screen</div>
            <div style="display:flex;gap:8px;"><span style="color:var(--coral);">3.</span> You'll be brought back automatically</div>
          </div>
          <button id="moncash-proceed" class="btn btn-primary" style="width:100%;border-radius:14px;padding:14px;">Continue to MonCash</button>
          <button id="moncash-cancel" class="btn btn-ghost" style="width:100%;margin-top:6px;">Cancel</button>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#moncash-proceed').addEventListener('click', () => {
        store.clearCart();
        window.location.href = paymentUrl;
      });
      overlay.querySelector('#moncash-cancel').addEventListener('click', () => {
        document.body.removeChild(overlay);
        render();
      });
    }
  }

  render();
  store.onChange(() => {
    render();
  });
}
