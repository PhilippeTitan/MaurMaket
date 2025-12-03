// ===== MAURMAKET AUTHENTICATION UTILITIES =====
// Shared across all pages for token management, session checks, and API calls

const TOKEN_KEY = 'maurmaket_auth_token';
const USER_KEY = 'maurmaket_user';

/**
 * Retrieve the stored JWT token
 * @returns {string|null} JWT token or null if not found
 */
function getAuthToken() {
    return localStorage.getItem(TOKEN_KEY);
}

/**
 * Retrieve the stored user object
 * @returns {object|null} User object or null if not found
 */
function getUser() {
    const userJson = localStorage.getItem(USER_KEY);
    return userJson ? JSON.parse(userJson) : null;
}

/**
 * Check if user is authenticated (has valid token)
 * @returns {boolean} True if token exists, false otherwise
 */
function isAuthenticated() {
    return !!getAuthToken();
}

/**
 * Clear session and logout user
 */
function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = '/login/login.html';
}

/**
 * Redirect to login if not authenticated
 * Useful for protected pages
 */
function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = '/login/login.html';
    }
}

/**
 * Make an authenticated API call with JWT bearer token
 * @param {string} url - API endpoint URL
 * @param {object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise} Fetch response promise
 */
function fetchWithAuth(url, options = {}) {
    const token = getAuthToken();
    
    if (!token) {
        console.warn('No auth token found. User may not be authenticated.');
        // Optionally redirect to login
        requireAuth();
        return Promise.reject(new Error('Not authenticated'));
    }

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
        'Authorization': `Bearer ${token}`,
    };

    return fetch(url, {
        ...options,
        headers,
    });
}

/**
 * Store token and user in localStorage after successful login
 * @param {string} token - JWT access token
 * @param {object} user - User object from backend
 */
function setAuthSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// Export for use in other modules (if using ES6)
// export { getAuthToken, getUser, isAuthenticated, logout, requireAuth, fetchWithAuth, setAuthSession };
