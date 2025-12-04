// ===== STACK AUTH CONFIG (Netlify-ready) =====
function getStackEnv(key) {
    try {
        if (typeof process !== 'undefined' && process && process.env && process.env[key]) {
            return process.env[key];
        }
    } catch (e) {}
    if (window && window.__STACK_CONFIG__ && window.__STACK_CONFIG__[key]) {
        return window.__STACK_CONFIG__[key];
    }
    return null;
}

const STACK_PROJECT_ID = getStackEnv('NEXT_PUBLIC_STACK_PROJECT_ID');
const STACK_PCK = getStackEnv('NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY');
const LOGIN_API_URL = STACK_PROJECT_ID
    ? `https://api.stack-auth.com/api/v1/projects/${STACK_PROJECT_ID}/users/email-password/sign-in`
    : null;

// ===== TOAST NOTIFICATION SYSTEM =====
function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    
    const bgColor = type === 'error' ? '#ff4040' : type === 'success' ? '#4caf50' : '#2196f3';
    const textColor = '#fff';
    
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: ${bgColor};
        color: ${textColor};
        padding: 16px 20px;
        border-radius: 8px;
        font-weight: 500;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 9999;
        animation: slideInRight 300ms ease;
        max-width: 320px;
        word-wrap: break-word;
    `;
    
    toast.innerHTML = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 300ms ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ===== FORM HANDLING =====
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const submitBtn = document.getElementById('login-submit-btn');
    const btnText = document.getElementById('btn-text');
    const btnSpinner = document.getElementById('btn-spinner');
    const errorMessage = document.getElementById('error-message');

    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        
        if (!username || !password) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        // Disable button and show spinner
        submitBtn.disabled = true;
        btnText.classList.add('hidden');
        btnSpinner.classList.remove('hidden');
        errorMessage.classList.add('hidden');

        try {
            // If LOGIN_API_URL & STACK_PCK are available, call Stack Auth
            if (LOGIN_API_URL && STACK_PCK) {
                const payload = { email: username, password };
                const response = await fetch(LOGIN_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Stack-Publishable-Key': STACK_PCK,
                    },
                    body: JSON.stringify(payload),
                });

                const responseText = await response.text();
                console.log('Login API response:', response.status, responseText);

                let data;
                try { data = JSON.parse(responseText); } catch (parseErr) { data = null; }

                if (!response.ok) {
                    const errorMsg = (data && (data.error || data.message)) || `Login failed (${response.status})`;
                    errorMessage.textContent = errorMsg;
                    errorMessage.classList.remove('hidden');
                    showToast(errorMsg, 'error');
                    return;
                }

                const accessToken = data && (data.access_token || data.token || data.id_token || (data.data && (data.data.access_token || data.data.token)));
                const user = data && (data.user || (data.data && data.data.user) || (data.user_id ? { id: data.user_id, email: username } : null));

                if (!accessToken) {
                    const msg = 'No access token returned from auth provider';
                    console.warn(msg);
                    showToast('Login succeeded (no token). Using local session.', 'info');
                    const devToken = 'local-dev-token-' + Date.now();
                    const devUser = { email: username };
                    setAuthSession(devToken, devUser);
                    setTimeout(() => { window.location.href = '/index.html'; }, 500);
                    return;
                }

                setAuthSession(accessToken, user);
                showToast('Login successful! Redirecting...', 'success', 1200);
                setTimeout(() => { window.location.href = '/index.html'; }, 600);
                return;
            }

            // Fallback local-mode if env not configured
            showToast('Login (local): env not configured; creating dev session', 'info');
            const devToken = 'local-dev-token-' + Date.now();
            setAuthSession(devToken, { email: username });
            setTimeout(() => { window.location.href = '/index.html'; }, 500);

        } catch (err) {
            console.error('Login error:', err);
            const errorMsg = err.message || 'An error occurred. Please try again.';
            errorMessage.textContent = errorMsg;
            errorMessage.classList.remove('hidden');
            showToast(errorMsg, 'error');
        } finally {
            // Re-enable button and hide spinner
            submitBtn.disabled = false;
            btnText.classList.remove('hidden');
            btnSpinner.classList.add('hidden');
        }
    });
});

// ===== SESSION MANAGEMENT =====
function getAuthToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function getUser() {
    const userJson = localStorage.getItem(USER_KEY);
    return userJson ? JSON.parse(userJson) : null;
}

function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = '/login/login.html';
}

// ===== PAGE LOAD CHECK =====
// If user is already logged in and visits /login, redirect to /index
window.addEventListener('load', () => {
    const token = getAuthToken();
    if (token && window.location.pathname.includes('/login')) {
        window.location.href = '/index.html';
    }
});

// ===== ANIMATION STYLES (injected) =====
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }

    #login-form {
        animation: fadeInUp 500ms ease;
    }

    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    #login-submit-btn:hover:not(:disabled) {
        opacity: 0.9;
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(38, 198, 218, 0.3);
    }

    #login-submit-btn:active:not(:disabled) {
        transform: translateY(0);
    }

    #login-submit-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
`;
document.head.appendChild(style);
