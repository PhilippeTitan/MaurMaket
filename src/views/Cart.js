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
        <div style="height:100dvh;display:flex;flex-direction:column;background:var(--bg);">
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
      <div style="height:100dvh;display:flex;flex-direction:column;background:var(--bg);">
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
        window.location.href = paymentUrl;
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
