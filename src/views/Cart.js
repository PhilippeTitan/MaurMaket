import store from '../store.js';
import { showToast } from '../toast.js';
import { navigate } from '../main.js';
import * as api from '../api.js';

const emojis = ['☕', '📱', '👟', '🎧', '💻', '🕶️', '🎮', '👜'];

export default function CartPage(page) {
  function render() {
    const cart = store.cart;
    if (cart.length === 0) {
      page.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;background:var(--bg);">
          <div class="topbar">
            <span class="logo">Cart</span>
            <div class="topbar-right"></div>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;">
            <div style="font-size:3rem;margin-bottom:8px;">🛒</div>
            <h3 style="margin-bottom:4px;">Cart is empty</h3>
            <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px;">Browse and add items you like</p>
          </div>
        </div>
      `;
      return;
    }

    const total = cart.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);

    page.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;background:var(--bg);">
        <div class="topbar">
          <span class="logo">Cart</span>
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

    page.querySelector('#checkout-btn').addEventListener('click', async () => {
      if (!store.isLoggedIn) { showToast('Sign in to checkout', 'info'); navigate('/login'); return; }
      const btn = page.querySelector('#checkout-btn');
      btn.disabled = true; btn.textContent = 'Processing...';
      try {
        const { order } = await api.createOrder(store.cart.map(item => ({ productId: item.id, quantity: item.quantity })));
        const returnUrl = window.location.origin + '/payment/return';
        const { paymentUrl } = await api.createPayment(order.id, returnUrl);
        store.clearCart();

        // Show MonCash payment modal
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
          </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#moncash-proceed').addEventListener('click', () => {
          window.location.href = paymentUrl;
        });
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Checkout →';
      }
    });
  }

  render();
  store.onChange(() => {
    render();
  });
}
