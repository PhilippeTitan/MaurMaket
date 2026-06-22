import * as api from '../api.js';
import store from '../store.js';
import { showToast } from '../toast.js';
import { navigate } from '../main.js';

export default async function ProductDetailPage(page, { id }) {
  if (!id) { navigate('/'); return; }

  page.innerHTML = '<div class="fullscreen-page"><div class="loading"><div class="spinner"></div></div></div>';

  try {
    const { product } = await api.getProduct(id);
    const images = product.images || [];
    const mainImage = images.find(i => i.is_primary) || images[0] || { url: '' };

    page.innerHTML = `
      <div style="height:100dvh;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);">
        <div class="pd-wrap">
          <div class="pd-img-frame" style="background:linear-gradient(135deg,#1C2235,#2a1a3e);">
            <span style="font-size:80px;">☕</span>
            <img src="${mainImage.url}" alt="${product.name}" id="pd-img"
                 style="width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;"
                 onerror="this.style.display='none'" />
            <button class="pd-back" id="pd-back"><i class="ti ti-arrow-left"></i></button>
            <div class="pd-price-badge">Rs ${parseFloat(product.price).toFixed(0)}</div>
          </div>

          <div class="seller-row">
            <div class="avatar-md">${(product.seller_name || 'U')[0]}</div>
            <div class="seller-card">
              <div>
                <div class="seller-card-name">${product.seller_name}</div>
                ${product.seller_phone ? `<div class="seller-card-phone">${product.seller_phone}</div>` : ''}
              </div>
              <div>
                <div class="stock-val">${product.stock}</div>
                <div class="stock-label">in stock</div>
              </div>
            </div>
          </div>

          <div class="pd-card">
            <div class="pd-name-row">
              <div class="pd-name">${product.name}</div>
            </div>
            ${product.category ? `<div class="pd-cat">${product.category}</div>` : ''}
            ${product.description ? `<div class="pd-desc">${product.description}</div>` : ''}
            <div class="pd-actions">
              <button class="btn btn-primary" id="pd-add-cart" ${product.stock <= 0 ? 'disabled' : ''}>
                ${product.stock > 0 ? 'Add to Cart' : 'Out of Stock'}
              </button>
              ${product.stock > 0 && store.isLoggedIn ? `
                <button class="btn btn-outline" id="pd-buy">Buy Now</button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;

    page.querySelector('#pd-back').addEventListener('click', () => navigate('/'));

    if (images.length > 1) {
      let idx = 0;
      const imgEl = page.querySelector('#pd-img');
      const dots = document.createElement('div');
      dots.className = 'gallery-dots';
      dots.style.cssText = 'position:absolute;bottom:10px;left:0;right:0;';
      dots.innerHTML = images.map((_, i) => `<button class="gallery-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>`).join('');
      page.querySelector('.pd-img-frame').appendChild(dots);

      dots.addEventListener('click', (e) => {
        const dot = e.target.closest('.gallery-dot');
        if (!dot) return;
        idx = parseInt(dot.dataset.index);
        imgEl.src = images[idx].url;
        dots.querySelectorAll('.gallery-dot').forEach(d => d.classList.toggle('active', parseInt(d.dataset.index) === idx));
      });
    }

    page.querySelector('#pd-add-cart').addEventListener('click', () => {
      if (!store.isLoggedIn) { showToast('Sign in to add items', 'info'); navigate('/login'); return; }
      store.addToCart({ id: product.id, name: product.name, price: product.price, image_url: mainImage.url });
      showToast('Added to cart!', 'success');
    });

    const buyBtn = page.querySelector('#pd-buy');
    if (buyBtn) buyBtn.addEventListener('click', () => {
      store.addToCart({ id: product.id, name: product.name, price: product.price, image_url: mainImage.url });
      navigate('/cart');
    });
  } catch (err) {
    page.innerHTML = `<div class="fullscreen-page"><div class="empty-state"><h3>Not found</h3><p>${err.message}</p></div></div>`;
  }
}
