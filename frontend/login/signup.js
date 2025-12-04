// ===== STACK AUTH CONFIG (Netlify-ready) =====
// Prefer build-time env injection (process.env.NEXT_PUBLIC_*) when bundled,
// otherwise support a runtime `window.__STACK_CONFIG__` object for Netlify.
function getStackEnv(key) {
    try {
        if (typeof process !== 'undefined' && process && process.env && process.env[key]) {
            return process.env[key];
        }
    } catch (e) {
        // ignore
    }
    if (window && window.__STACK_CONFIG__ && window.__STACK_CONFIG__[key]) {
        return window.__STACK_CONFIG__[key];
    }
    return null;
}

const STACK_PROJECT_ID = getStackEnv('NEXT_PUBLIC_STACK_PROJECT_ID');
const STACK_PCK = getStackEnv('NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY');
const SIGNUP_API_URL = STACK_PROJECT_ID
    ? `https://api.stack-auth.com/api/v1/projects/${STACK_PROJECT_ID}/users/email-password/sign-up`
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

// ===== VALIDATION FUNCTIONS =====
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePassword(password) {
    // At least 8 characters (adjust as needed)
    return password.length >= 8;
}

function validateUsername(username) {
    // At least 3 characters, alphanumeric + underscore
    const usernameRegex = /^[a-zA-Z0-9_]{3,}$/;
    return usernameRegex.test(username);
}

// ===== FORM HANDLING =====
document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signup-form');
    const emailInput = document.getElementById('email');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const submitBtn = document.getElementById('signup-submit-btn');
    const btnText = document.getElementById('btn-text');
    const btnSpinner = document.getElementById('btn-spinner');
    const errorMessage = document.getElementById('error-message');

    if (!signupForm) return;

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        const confirmPassword = confirmPasswordInput.value.trim();
        
        // Validation
        if (!email || !username || !password || !confirmPassword) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        if (!validateEmail(email)) {
            const msg = 'Please enter a valid email address';
            errorMessage.textContent = msg;
            errorMessage.classList.remove('hidden');
            showToast(msg, 'error');
            return;
        }

        if (!validateUsername(username)) {
            const msg = 'Username must be at least 3 characters (letters, numbers, underscores only)';
            errorMessage.textContent = msg;
            errorMessage.classList.remove('hidden');
            showToast(msg, 'error');
            return;
        }

        if (!validatePassword(password)) {
            const msg = 'Password must be at least 8 characters long';
            errorMessage.textContent = msg;
            errorMessage.classList.remove('hidden');
            showToast(msg, 'error');
            return;
        }

        if (password !== confirmPassword) {
            const msg = 'Passwords do not match';
            errorMessage.textContent = msg;
            errorMessage.classList.remove('hidden');
            showToast(msg, 'error');
            return;
        }

        // Disable button and show spinner
        submitBtn.disabled = true;
        btnText.classList.add('hidden');
        btnSpinner.classList.remove('hidden');
        errorMessage.classList.add('hidden');

        try {
            // If SIGNUP_API_URL & STACK_PCK are available, call Stack Auth endpoint.
            if (SIGNUP_API_URL && STACK_PCK) {
                const payload = { email: email, password: password };
                const resp = await fetch(SIGNUP_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Stack-Publishable-Key': STACK_PCK,
                    },
                    body: JSON.stringify(payload),
                });

                const text = await resp.text();
                console.log('Signup API response:', resp.status, text);

                let data;
                try { data = JSON.parse(text); } catch (parseErr) { data = null; }

                if (!resp.ok) {
                    const msg = (data && (data.error || data.message)) || `Signup failed (${resp.status})`;
                    errorMessage.textContent = msg;
                    errorMessage.classList.remove('hidden');
                    showToast(msg, 'error');
                    return;
                }

                const accessToken = data && (data.access_token || data.token || data.id_token || (data.data && (data.data.access_token || data.data.token)));
                const user = data && (data.user || (data.data && data.data.user) || (data.user_id ? { id: data.user_id, email } : null));

                if (!accessToken) {
                    // Fallback to local-session if provider returns no token
                    console.warn('No access token from Stack response — falling back to local session');
                    const devToken = 'local-dev-token-' + Date.now();
                    const devUser = { email, username: username || email.split('@')[0] };
                    setAuthSession(devToken, devUser);
                    showToast('Account created (local fallback). Redirecting...', 'success');
                    setTimeout(() => { window.location.href = '/index.html'; }, 600);
                    return;
                }

                setAuthSession(accessToken, user);
                showToast('Account created! Redirecting...', 'success', 1200);
                setTimeout(() => { window.location.href = '/index.html'; }, 700);
                return;
            }

            // If env not configured, stay in local-dev neutral mode for safety
            const devToken = 'local-dev-token-' + Date.now();
            const devUser = { email: email, username: username || email.split('@')[0] };
            setAuthSession(devToken, devUser);
            showToast('Account created (local). Redirecting...', 'success', 1200);
            setTimeout(() => { window.location.href = '/index.html'; }, 600);

        } catch (err) {
            console.error('Signup error:', err);
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

// ===== PAGE LOAD CHECK =====
// If user is already logged in and visits /signup, redirect to /index
window.addEventListener('load', () => {
    const token = getAuthToken();
    if (token && window.location.pathname.includes('/signup')) {
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

    #signup-form {
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

    #signup-submit-btn:hover:not(:disabled) {
        opacity: 0.9;
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(38, 198, 218, 0.3);
    }

    #signup-submit-btn:active:not(:disabled) {
        transform: translateY(0);
    }

    #signup-submit-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
`;
document.head.appendChild(style);
