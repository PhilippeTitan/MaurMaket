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
            <input type="tel" id="phone" placeholder="5XXX XXXX" />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="password" placeholder="At least 6 characters" required minlength="6" />
          </div>
          <div class="form-group">
            <label>I want to...</label>
            <div class="role-selector">
              <button type="button" class="role-btn active" data-role="buyer">Buy</button>
              <button type="button" class="role-btn" data-role="seller">Sell</button>
            </div>
          </div>
          <button type="submit" class="btn btn-primary" style="margin-top:4px;width:100%;border-radius:14px;padding:14px;font-size:15px;">Create Account</button>
        </form>
        <div class="auth-toggle">
          Already have one? <a id="goto-login">Sign In</a>
        </div>
      </div>
    </div>
  `;

  let selectedRole = 'buyer';

  page.querySelectorAll('.role-btn').forEach(el => {
    el.addEventListener('click', () => {
      page.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
      el.classList.add('active');
      selectedRole = el.dataset.role;
    });
  });

  page.querySelector('#signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = page.querySelector('#fullName').value;
    const email = page.querySelector('#email').value;
    const phone = page.querySelector('#phone').value;
    const password = page.querySelector('#password').value;
    const btn = page.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Creating account...';

    try {
      const { user, token } = await api.signup(fullName, email, password, phone, selectedRole);
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
