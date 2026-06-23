import store from '../store.js';
import { showToast } from '../toast.js';
import { navigate } from '../main.js';
import * as api from '../api.js';
import { modalConfirm } from '../modal.js';

export default async function SettingsPage(page) {
  if (!store.isLoggedIn) { navigate('/login'); return; }

  page.innerHTML = '<div class="fullscreen-page"><div class="loading"><div class="spinner"></div></div></div>';

  try {
    const { user } = await api.getMe();
    const { addresses } = await api.getAddresses();

    function renderAddresses() {
      const container = page.querySelector('#saved-addresses-list');
      if (!container) return;
      if (addresses.length === 0) {
        container.innerHTML = '<div style="font-size:0.8rem;color:var(--text2);padding:4px 0;">No saved addresses yet</div>';
        return;
      }
      container.innerHTML = addresses.map((addr, idx) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">
          <div style="flex:1;">
            <div style="font-size:0.85rem;color:var(--text);">${addr.label ? `<strong>${addr.label}</strong> — ` : ''}${addr.address}, ${addr.city}</div>
            <div style="font-size:0.7rem;color:var(--text2);">${addr.name} — +509${addr.phone}${addr.is_default ? ' <span style="color:var(--blue);">(default)</span>' : ''}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <i class="ti ti-trash" data-idx="${idx}" style="color:var(--coral);cursor:pointer;font-size:1.1rem;padding:4px;"></i>
          </div>
        </div>
      `).join('');
      container.querySelectorAll('.ti-trash').forEach(el => {
        el.addEventListener('click', async () => {
          const addr = addresses[parseInt(el.dataset.idx)];
          if (!(await modalConfirm('Delete Address', 'Delete this saved address?'))) return;
          try {
            await api.deleteAddress(addr.id);
            addresses.splice(parseInt(el.dataset.idx), 1);
            renderAddresses();
            showToast('Address deleted', 'info');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    }

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

          <hr style="border:none;border-top:1px solid var(--border);margin:24px 0;" />

          <h3 style="font-size:1rem;margin:0 0 12px 0;color:var(--text);">Change Password</h3>
          <form id="password-form">
            <div class="form-group">
              <label>Current Password</label>
              <input type="password" id="s-current-pw" placeholder="Enter current password" required />
            </div>
            <div class="form-group">
              <label>New Password</label>
              <input type="password" id="s-new-pw" placeholder="At least 6 characters" required minlength="6" />
            </div>
            <button type="submit" class="btn btn-outline" style="width:100%;border-radius:14px;padding:14px;">Change Password</button>
          </form>

          <hr style="border:none;border-top:1px solid var(--border);margin:24px 0;" />

          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h3 style="font-size:1rem;margin:0;color:var(--text);">Saved Addresses</h3>
            <button class="btn btn-sm" id="add-address-btn" style="background:var(--blue);color:#fff;border:none;border-radius:10px;padding:6px 12px;font-size:0.7rem;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;display:flex;align-items:center;gap:4px;"><i class="ti ti-plus" style="font-size:12px;"></i> Add</button>
          </div>
          <div id="saved-addresses-list"></div>

          <hr style="border:none;border-top:1px solid var(--border);margin:24px 0;" />

          <button class="btn btn-ghost" id="signout-btn" style="width:100%;border-radius:14px;padding:14px;color:var(--coral);font-size:0.9rem;font-weight:600;">
            <i class="ti ti-logout" style="font-size:16px;"></i> Sign Out
          </button>
        </div>
      </div>
    `;

    renderAddresses();

    page.querySelector('#settings-back').addEventListener('click', () => navigate('/profile'));

    page.querySelector('#signout-btn').addEventListener('click', async () => {
      const ok = await modalConfirm('Sign Out', 'Are you sure you want to sign out?');
      if (ok) {
        store.logout();
        navigate('/');
      }
    });

    page.querySelector('#add-address-btn')?.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:flex-end;padding:0;';
      overlay.innerHTML = `
        <div style="background:var(--surface);border-radius:20px 20px 0 0;padding:20px;width:100%;max-height:85vh;overflow-y:auto;">
          <h3 style="margin-bottom:14px;">Add Address</h3>
          <div class="form-group">
            <label>Label (e.g. Home, Work)</label>
            <input type="text" id="addr-label" placeholder="Home" style="padding:10px 14px;font-size:0.85rem;" />
          </div>
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" id="addr-name" value="${store.user?.full_name || ''}" placeholder="Recipient name" style="padding:10px 14px;font-size:0.85rem;" />
          </div>
          <div class="form-group">
            <label>Phone</label>
            <div style="display:flex;gap:0;align-items:stretch;">
              <div style="background:var(--bg);border:1px solid var(--border);border-right:none;border-radius:14px 0 0 14px;padding:14px 10px;color:var(--text2);font-size:1rem;font-weight:600;white-space:nowrap;display:flex;align-items:center;">+509</div>
              <input type="tel" id="addr-phone" placeholder="XX XX XXXX" style="border-radius:0 14px 14px 0;" />
            </div>
          </div>
          <div class="form-group">
            <label>Address</label>
            <input type="text" id="addr-address" placeholder="Street, neighborhood, landmark" style="padding:10px 14px;font-size:0.85rem;" />
          </div>
          <div class="form-group">
            <label>City / Town</label>
            <input type="text" id="addr-city" placeholder="e.g. Port-au-Prince" style="padding:10px 14px;font-size:0.85rem;" />
          </div>
          <label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:var(--text2);cursor:pointer;margin:10px 0;">
            <input type="checkbox" id="addr-default" style="accent-color:var(--coral);" /> Set as default address
          </label>
          <button class="btn btn-primary" id="addr-save" style="width:100%;border-radius:14px;padding:14px;">Save Address</button>
          <button class="btn btn-ghost" id="addr-cancel" style="width:100%;margin-top:6px;">Cancel</button>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector('#addr-cancel').addEventListener('click', () => document.body.removeChild(overlay));
      overlay.querySelector('#addr-save').addEventListener('click', async () => {
        const label = overlay.querySelector('#addr-label').value;
        const name = overlay.querySelector('#addr-name').value;
        const rawPhone = overlay.querySelector('#addr-phone').value.replace(/\s/g, '');
        const phone = rawPhone ? '509' + rawPhone : '';
        const address = overlay.querySelector('#addr-address').value;
        const city = overlay.querySelector('#addr-city').value;
        const isDefault = overlay.querySelector('#addr-default').checked;
        if (!address || !city) { showToast('Address and city required', 'error'); return; }
        try {
          await api.createAddress({ label, name, phone, address, city, isDefault });
          showToast('Address saved!', 'success');
          document.body.removeChild(overlay);
          const { addresses: newAddresses } = await api.getAddresses();
          addresses.length = 0;
          addresses.push(...newAddresses);
          renderAddresses();
        } catch (err) { showToast(err.message, 'error'); }
      });
    });

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

    page.querySelector('#password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = page.querySelector('#s-current-pw').value;
      const newPassword = page.querySelector('#s-new-pw').value;
      const btn = page.querySelector('#password-form button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Changing...';
      try {
        await api.changePassword(currentPassword, newPassword);
        showToast('Password changed!', 'success');
        page.querySelector('#s-current-pw').value = '';
        page.querySelector('#s-new-pw').value = '';
        btn.disabled = false; btn.textContent = 'Change Password';
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Change Password';
      }
    });
  } catch (err) {
    page.innerHTML = `<div class="fullscreen-page"><div class="empty-state"><h3>Error</h3><p>${err.message}</p></div></div>`;
  }
}
