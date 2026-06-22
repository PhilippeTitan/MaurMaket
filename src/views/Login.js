import * as api from '../api.js';
import store from '../store.js';
import { showToast } from '../toast.js';
import { navigate } from '../main.js';

export default function LoginPage(page) {
  page.innerHTML = `
    <div class="fullscreen-page">
      <div class="auth-page">
        <h1>Welcome back</h1>
        <p class="subtitle">Sign in to continue</p>
        <form id="login-form">
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="email" placeholder="your@email.com" required />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="password" placeholder="Enter your password" required />
          </div>
          <button type="submit" class="btn btn-primary" style="margin-top:8px;width:100%;border-radius:14px;padding:14px;font-size:15px;">Sign In</button>
        </form>
        <div class="auth-toggle">
          Don't have an account? <a id="goto-signup">Sign Up</a>
        </div>
      </div>
    </div>
  `;

  page.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = page.querySelector('#email').value;
    const password = page.querySelector('#password').value;
    const btn = page.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Signing in...';

    try {
      const { user, token } = await api.login(email, password);
      store.setUser(user, token);
      showToast(`Welcome back, ${user.full_name}!`, 'success');
      navigate('/');
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  });

  page.querySelector('#goto-signup').addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/signup');
  });
}
