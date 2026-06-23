import store from '../store.js';
import { showToast } from '../toast.js';
import { navigate } from '../main.js';
import * as api from '../api.js';

export default async function SettingsPage(page) {
  if (!store.isLoggedIn) { navigate('/login'); return; }

  page.innerHTML = '<div class="fullscreen-page"><div class="loading"><div class="spinner"></div></div></div>';

  try {
    const { user } = await api.getMe();

    page.innerHTML = `
      <div class="fullscreen-page">
        <div class="topbar">
          <i class="ti ti-arrow-left" id="settings-back" style="font-size:22px;color:var(--text2);cursor:pointer;padding:4px;"></i>
          <span class="logo" style="margin-left:4px;">Settings</span>
          <div class="topbar-right"></div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:16px;">
          <form id="settings-form">
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" id="s-name" value="${user.full_name || ''}" required />
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="s-email" value="${user.email || ''}" required />
            </div>
            <div class="form-group">
              <label>Phone (for payouts)</label>
              <div style="display:flex;gap:0;align-items:stretch;">
                <div style="background:var(--surface);border:1px solid var(--border);border-right:none;border-radius:14px 0 0 14px;padding:14px 10px;color:var(--text2);font-size:1rem;font-weight:600;white-space:nowrap;display:flex;align-items:center;">+509</div>
                <input type="tel" id="s-phone" placeholder="XX XX XXXX" value="${(user.phone || '').replace(/^509/, '').replace(/^\+509/, '')}" style="border-radius:0 14px 14px 0;" />
              </div>
              <div style="font-size:0.75rem;color:var(--text2);margin-top:4px;">Your 8-digit MonCash number</div>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%;border-radius:14px;padding:14px;margin-top:8px;">Save Changes</button>
          </form>
        </div>
      </div>
    `;

    page.querySelector('#settings-back').addEventListener('click', () => navigate('/profile'));

    page.querySelector('#settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullName = page.querySelector('#s-name').value;
      const email = page.querySelector('#s-email').value;
      const rawPhone = page.querySelector('#s-phone').value.replace(/\s/g, '');
      const phone = rawPhone ? '+509' + rawPhone : '';
      const btn = page.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Saving...';

      try {
        const { user: updated } = await api.updateProfile({ fullName, email, phone });
        store.state.user = updated;
        showToast('Profile updated!', 'success');
        navigate('/profile');
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Save Changes';
      }
    });
  } catch (err) {
    page.innerHTML = `<div class="fullscreen-page"><div class="empty-state"><h3>Error</h3><p>${err.message}</p></div></div>`;
  }
}
