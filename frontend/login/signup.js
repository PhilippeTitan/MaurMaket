// ===== STACK AUTH SIGNUP INTEGRATION =====
// Use the universal Stack Auth base for the claimed project
const STACK_PROJECT_ID = 'd76f939c-645c-4af5-8517-41a53c1d4cbf';
const STACK_BASE = `https://api.stack-auth.com/api/v1/projects/${STACK_PROJECT_ID}`;
// Publishable Client Key (safe for frontend) - updated to latest provided key
const STACK_PCK = 'pck_6b7jwm2t41zhj7y02dkgtg1fda3vqeva4243frnxwzy08';
// Use the email-password sign-up route
const SIGNUP_API_URL = `${STACK_BASE}/users/email-password/sign-up`;
const TOKEN_VERIFY_URL = `${STACK_BASE}/auth/verify`;

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
            // Prepare payload for Neon: include email/username/password and optional metadata
            // Stack Auth email-password signup expects only email+password
            const payload = {
                email: email,
                password: password
            };

            const response = await fetch(SIGNUP_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${STACK_PCK}`,
                },
                body: JSON.stringify(payload),
            });

            // Get the response text first to handle non-JSON responses
            const responseText = await response.text();
            console.log('Signup API Response:', responseText);
            console.log('Response Status:', response.status);
            console.log('Response Headers:', response.headers);

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseErr) {
                console.error('JSON Parse Error:', parseErr);
                const errorMsg = `Server error (${response.status}): Invalid response format. Check console for details.`;
                errorMessage.textContent = errorMsg;
                errorMessage.classList.remove('hidden');
                showToast(errorMsg, 'error');
                return;
            }

            if (!response.ok) {
                // Show error from API
                const errorMsg = data.error || data.message || 'Signup failed. Please try again.';
                errorMessage.textContent = errorMsg;
                errorMessage.classList.remove('hidden');
                showToast(errorMsg, 'error');
                return;
            }

            // Success: extract token and user data (be tolerant of different key names)
            const accessToken = data.access_token || data.token || data.accessToken || data.id_token || data.idToken || (data.data && (data.data.access_token || data.data.token || data.data.id_token));
            const user = data.user || (data.data && data.data.user) || (data.user_id ? { id: data.user_id, email: email, username: username } : null) || null;

            if (!accessToken) {
                throw new Error('No access token received from server');
            }

            // Store token and user in localStorage
            setAuthSession(accessToken, user);

            // Show success toast
            showToast('Account created! Redirecting...', 'success', 2000);

            // Redirect to index after a brief delay
            setTimeout(() => {
                window.location.href = '/index.html';
            }, 500);

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
