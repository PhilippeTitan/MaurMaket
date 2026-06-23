import * as api from '../api.js';
import store from '../store.js';
import { showToast } from '../toast.js';
import { navigate } from '../main.js';

const emojiList = ['💻', '📱', '👟', '🎧', '☕', '🕶️', '🎮', '👜', '👗', '📚'];

export default async function StorefrontPage(page, { id }) {
  if (!id) { navigate('/'); return; }

  page.innerHTML = '<div class="fullscreen-page"><div class="loading"><div class="spinner"></div></div></div>';

  try {
    const [{ seller }, { products }] = await Promise.all([
      api.getSellerProfile(id),
      api.getProducts({ seller: id, limit: 50 }),
    ]);

    const productList = products || [];

    page.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);">
        <div class="topbar">
          <i class="ti ti-arrow-left" id="store-back" style="font-size:22px;color:var(--text2);cursor:pointer;padding:4px;"></i>
          <span class="logo" style="margin-left:4px;">${seller.full_name}</span>
          <div class="topbar-right"></div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:12px;">
          <div style="background:var(--surface);border-radius:16px;padding:16px;margin-bottom:12px;text-align:center;">
            <div class="avatar-lg" style="margin:0 auto 8px;">${(seller.full_name || 'U')[0]}</div>
            <div style="font-size:1.1rem;font-weight:700;color:var(--text);">
              ${seller.full_name}
              ${seller.avg_rating >= 4.5 && seller.review_count >= 10 && seller.sales_count >= 20 ? '<span style="display:inline-block;background:var(--blue);color:#fff;font-size:0.55rem;padding:2px 8px;border-radius:10px;margin-left:6px;vertical-align:middle;">✓ Verified</span>' : ''}
            </div>
            ${seller.bio ? `<div style="font-size:0.85rem;color:var(--text2);margin-top:4px;">${seller.bio}</div>` : ''}
            <div class="stats-row" style="margin-top:12px;">
              <div class="stat-card"><div class="stat-num">${seller.product_count}</div><div class="stat-label">Products</div></div>
              <div class="stat-card"><div class="stat-num">${seller.sales_count}</div><div class="stat-label">Sales</div></div>
              <div class="stat-card"><div class="stat-num" style="color:var(--coral);">${seller.review_count > 0 ? '★ ' + seller.avg_rating : '—'}</div><div class="stat-label">${seller.review_count} review${seller.review_count !== 1 ? 's' : ''}</div></div>
            </div>
            ${seller.phone ? `<a href="tel:${seller.phone}" style="display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:8px 16px;background:var(--surface2);border-radius:10px;color:var(--text);text-decoration:none;font-size:0.85rem;"><i class="ti ti-phone"></i> Call Seller</a>` : ''}
            ${store.isLoggedIn && store.user?.id !== id ? `<button class="btn btn-outline" id="follow-btn" style="width:100%;border-radius:14px;padding:10px;margin-top:8px;">Follow</button>` : ''}
          </div>

          <div class="section-label">Products</div>
          ${productList.length > 0 ? `
            <div class="explore-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
              ${productList.map(p => {
                const img = p.image_url;
                const color = ['#FF4D6A', '#00C2FF', '#00E5A0', '#FF9F1C', '#B388FF'][p.name.length % 5];
                return `
                  <div class="explore-card" data-id="${p.id}" style="cursor:pointer;border-radius:10px;overflow:hidden;background:var(--surface);position:relative;">
                    <div style="aspect-ratio:1;background:${img ? `url(${img}) center/cover` : `linear-gradient(135deg,${color},${color}88)`};display:flex;align-items:center;justify-content:center;">
                      ${!img ? `<span style="font-size:1.8rem;font-weight:700;color:#fff;">${p.name[0]}</span>` : ''}
                    </div>
                    <div style="padding:6px;">
                      <div style="font-size:0.7rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
                      <div style="font-size:0.75rem;color:var(--coral);font-weight:700;">Rs ${parseFloat(p.price).toFixed(0)}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : '<div style="text-align:center;padding:20px;color:var(--text2);font-size:0.85rem;">No products listed yet</div>'}
        </div>
      </div>
    `;

    page.querySelector('#store-back').addEventListener('click', () => window.history.back());

    page.querySelector('.explore-grid')?.addEventListener('click', (e) => {
      const card = e.target.closest('.explore-card');
      if (card) navigate('/product', { id: card.dataset.id });
    });

    const followBtn = page.querySelector('#follow-btn');
    if (followBtn) {
      api.getFollowerCount(id).then(({ count }) => {
        followBtn.textContent = `Follow (${count})`;
      }).catch(() => {});
      followBtn.addEventListener('click', async () => {
        try {
          const { following } = await api.toggleFollow(id);
          followBtn.textContent = following ? 'Unfollow' : 'Follow';
          showToast(following ? 'Following seller' : 'Unfollowed', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

  } catch (err) {
    page.innerHTML = `<div class="fullscreen-page"><div class="empty-state"><h3>Not found</h3><p>${err.message}</p></div></div>`;
  }
}
