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
                <div class="seller-card-name" id="pd-seller-link" style="cursor:pointer;">${product.seller_name} <span id="pd-verified-badge" style="display:none;"></span></div>
                ${product.seller_phone && store.isLoggedIn ? `<div class="seller-card-phone">${product.seller_phone}</div>` : ''}
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
              ${store.isLoggedIn ? `<button class="btn btn-ghost" id="pd-wishlist" style="font-size:0.8rem;"><i class="ti ti-heart"></i></button>` : ''}
              <button class="btn btn-ghost" id="pd-share" style="font-size:0.8rem;">
                <i class="ti ti-share"></i> Share
              </button>
              ${store.isLoggedIn ? `<button class="btn btn-ghost" id="pd-message-seller" style="font-size:0.8rem;"><i class="ti ti-message"></i> Message</button>` : ''}
            </div>
          </div>
          <div id="product-reviews" style="padding:12px 16px 80px;">
            <div style="font-size:0.8rem;font-weight:600;color:var(--text2);margin-bottom:8px;">Reviews</div>
            <div style="text-align:center;padding:12px;"><div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0 auto;"></div></div>
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

    api.getSellerProfile(product.seller_id).then(profileData => {
      const sellerInfo = profileData.seller;
      if (sellerInfo.avg_rating >= 4.5 && sellerInfo.review_count >= 10 && sellerInfo.sales_count >= 20) {
        const badge = page.querySelector('#pd-verified-badge');
        if (badge) { badge.style.display = 'inline-block'; badge.textContent = '✓ Verified'; badge.style.cssText = 'display:inline-block;background:var(--blue);color:#fff;font-size:0.55rem;padding:2px 8px;border-radius:10px;margin-left:4px;vertical-align:middle;'; }
      }
    }).catch(() => {});

    api.getSellerReviews(product.seller_id).then(({ reviews, stats }) => {
      const container = page.querySelector('#product-reviews');
      if (stats.review_count > 0) {
        container.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="font-size:0.8rem;font-weight:600;color:var(--text2);">Reviews</span>
            <span style="font-size:0.75rem;color:var(--coral);font-weight:600;">★ ${stats.avg_rating}</span>
            <span style="font-size:0.7rem;color:var(--text2);">(${stats.review_count})</span>
          </div>
          ${reviews.slice(0, 5).map(r => `
            <div style="background:var(--surface);border-radius:12px;padding:10px;margin-bottom:6px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:0.8rem;font-weight:600;color:var(--text);">${r.reviewer_name}</span>
                <span style="color:var(--coral);font-size:0.85rem;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
              </div>
              ${r.comment ? `<div style="font-size:0.75rem;color:var(--text2);margin-top:4px;">${r.comment}</div>` : ''}
              <div style="font-size:0.65rem;color:var(--text2);margin-top:4px;">${new Date(r.created_at).toLocaleDateString()}</div>
            </div>
          `).join('')}
        `;
      } else {
        container.innerHTML = `
          <div style="font-size:0.8rem;font-weight:600;color:var(--text2);margin-bottom:4px;">Reviews</div>
          <div style="font-size:0.8rem;color:var(--text2);text-align:center;padding:8px;">No reviews yet</div>
        `;
      }
    }).catch(() => {
      page.querySelector('#product-reviews').innerHTML = '';
    });

    page.querySelector('#pd-share').addEventListener('click', () => {
      const shareUrl = `${window.location.origin}/product?id=${product.id}`;
      const text = `Check out ${product.name} on MaurMaket — Rs ${parseFloat(product.price).toFixed(0)}`;
      if (navigator.share) {
        navigator.share({ title: product.name, text, url: shareUrl }).catch(() => {});
      } else {
        const waUrl = `https://wa.me/?text=${encodeURIComponent(text + ' ' + shareUrl)}`;
        window.open(waUrl, '_blank');
      }
    });

    page.querySelector('#pd-seller-link')?.addEventListener('click', () => {
      navigate('/store', { id: product.seller_id });
    });

    page.querySelector('#pd-message-seller')?.addEventListener('click', async () => {
      if (!store.isLoggedIn) { showToast('Sign in to message', 'info'); navigate('/login'); return; }
      try {
        const { conversationId } = await api.createConversation({ productId: product.id });
        navigate('/messages', { conversationId });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    const wishlistBtn = page.querySelector('#pd-wishlist');
    if (wishlistBtn) {
      api.checkWishlist(product.id).then(({ wishlisted }) => {
        wishlistBtn.style.color = wishlisted ? 'var(--coral)' : 'var(--text2)';
        wishlistBtn.innerHTML = wishlisted ? '<i class="ti ti-heart-filled"></i>' : '<i class="ti ti-heart"></i>';
      }).catch(() => {});
      wishlistBtn.addEventListener('click', async () => {
        try {
          const { wishlisted } = await api.toggleWishlist(product.id);
          wishlistBtn.style.color = wishlisted ? 'var(--coral)' : 'var(--text2)';
          wishlistBtn.innerHTML = wishlisted ? '<i class="ti ti-heart-filled"></i>' : '<i class="ti ti-heart"></i>';
          showToast(wishlisted ? 'Added to wishlist' : 'Removed from wishlist', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
  } catch (err) {
    page.innerHTML = `<div class="fullscreen-page"><div class="empty-state"><h3>Not found</h3><p>${err.message}</p></div></div>`;
  }
}
