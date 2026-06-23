import * as api from '../api.js';
import store from '../store.js';
import { showToast } from '../toast.js';
import { navigate } from '../main.js';

export default function SignupPage(page) {
  page.innerHTML = `
    <div class="fullscreen-page">
      <div class="auth-page">
        <h1>Join MaurMaket</h1>
        <p class="subtitle">Create your account</p>
        <form id="signup-form">
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" id="fullName" placeholder="John Doe" required />
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="email" placeholder="your@email.com" required />
          </div>
          <div class="form-group">
            <label>Phone (optional)</label>
            <div style="display:flex;gap:0;align-items:stretch;">
              <div style="background:var(--surface);border:1px solid var(--border);border-right:none;border-radius:14px 0 0 14px;padding:14px 10px;color:var(--text2);font-size:1rem;font-weight:600;white-space:nowrap;display:flex;align-items:center;">+509</div>
              <input type="tel" id="phone" placeholder="XX XX XXXX" style="border-radius:0 14px 14px 0;" />
            </div>
            <div style="font-size:0.75rem;color:var(--text2);margin-top:4px;">Enter your 8-digit MonCash number</div>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="password" placeholder="At least 6 characters" required minlength="6" />
          </div>

          <button type="submit" class="btn btn-primary" style="margin-top:4px;width:100%;border-radius:14px;padding:14px;font-size:15px;">Create Account</button>
        </form>
        <div class="auth-toggle">
          Already have one? <a id="goto-login">Sign In</a>
        </div>
      </div>
    </div>
  `;

  page.querySelector('#signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = page.querySelector('#fullName').value;
    const email = page.querySelector('#email').value;
    const rawPhone = page.querySelector('#phone').value.replace(/\s/g, '');
    const phone = rawPhone ? '+509' + rawPhone : '';
    const password = page.querySelector('#password').value;
    const btn = page.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Creating account...';

    try {
      const { user, token } = await api.signup(fullName, email, password, phone, 'buyer');
      store.setUser(user, token);
      showToast(`Welcome to MaurMaket, ${user.full_name}!`, 'success');
      navigate('/');
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'Create Account';
    }
  });

  page.querySelector('#goto-login').addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/login');
  });
}
