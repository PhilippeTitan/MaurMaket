# MaurMaket Login System — Test Checklist

## Phase 1: Setup
- [ ] Create test user in Neon Auth dashboard
  - Email: `test@maurmaket.com`
  - Password: `TestPassword123!`
- [ ] Verify Stack Auth project is connected and active

## Phase 2: Form & Submission
- [ ] Open `/login/login.html` in browser
- [ ] Check form displays correctly with both themes (light/dark)
- [ ] Enter test credentials and click "Sign In"
- [ ] **Verify:**
  - [ ] Button disables immediately
  - [ ] Spinner appears inside button
  - [ ] Button text changes to hidden
  - [ ] No multiple submissions possible during request

## Phase 3: Success Flow
- [ ] After login, **toast notification** appears with "Login successful! Redirecting..."
- [ ] Toast is green/success colored
- [ ] Toast slides in from bottom-right
- [ ] After ~500ms, page redirects to `/index.html`
- [ ] **Verify redirection:**
  - [ ] URL changes to `/index.html`
  - [ ] Page loads correctly

## Phase 4: LocalStorage Verification
- [ ] Open browser DevTools (F12)
- [ ] Go to **Application → LocalStorage → (your domain)**
- [ ] **Check these keys exist:**
  - [ ] `maurmaket_auth_token` — contains JWT token (long alphanumeric string)
  - [ ] `maurmaket_user` — contains user object like `{"id":"...", "email":"test@maurmaket.com"}`

## Phase 5: Session Persistence
- [ ] While on `/index.html`, press **F5 (Refresh)**
- [ ] Page reloads and user remains logged in (no redirect to login)
- [ ] Visit `/login/login.html` manually
- [ ] **Verify:** Auto-redirects to `/index.html` (because token exists)

## Phase 6: Error Handling
- [ ] Go back to `/login.html`
- [ ] Try logging in with **wrong password**
- [ ] **Verify:**
  - [ ] Error message displays below form in red box
  - [ ] Red error **toast** appears (bottom-right)
  - [ ] Button re-enables after error
- [ ] Try logging in with **non-existent email**
- [ ] **Same checks as above**

## Phase 7: Form Validation
- [ ] Leave **email/username blank**, click Submit
- [ ] Toast shows "Please fill in all fields"
- [ ] Leave **password blank**, click Submit
- [ ] Toast shows "Please fill in all fields"
- [ ] Button does NOT send API request

## Phase 8: Theme Toggle
- [ ] While on login page, click the **theme toggle** (floating right panel)
- [ ] Page switches to dark theme
- [ ] Form styling updates accordingly
- [ ] Click again to return to light theme
- [ ] **Verify:** Theme persists on refresh (localStorage check)

## Phase 9: Network Monitoring (Optional - for debugging)
- [ ] Open DevTools → **Network tab**
- [ ] Refresh login page
- [ ] Look for API call to `api.stack-auth.com`
- [ ] Click the request and check:
  - [ ] **Request body** contains `email` and `password`
  - [ ] **Response** contains `access_token` and `user` object
  - [ ] Status code is `200` on success, `401` on failure

## Phase 10: Logout Flow (Once implemented)
- [ ] Add logout button to protected pages
- [ ] Click logout
- [ ] Token and user removed from localStorage
- [ ] Redirect to `/login.html`

---

## Expected Behaviors Summary

| Action | Expected Result |
|--------|-----------------|
| Submit valid credentials | ✅ Success toast → Redirect to `/index.html` |
| Submit invalid credentials | ❌ Error toast + error message below form |
| Leave fields blank | ❌ "Fill in all fields" toast |
| Submit with wrong password | ❌ "Invalid credentials" (or backend error) |
| Refresh while logged in | ✅ User stays logged in |
| Visit `/login` while logged in | ✅ Auto-redirect to `/index.html` |
| Toggle theme | ✅ Theme persists on refresh |
| Button during submission | ✅ Disabled + spinner shows |

---

## If Something Fails

**Token not storing?**
- Check browser console for errors
- Verify Stack Auth API response has `access_token` field
- Check localStorage manually in DevTools

**Redirect not working?**
- Verify `/index.html` exists and is accessible
- Check browser console for JavaScript errors
- Verify redirect URL is correct in login.js

**Toast not showing?**
- Check that `login.js` loads correctly
- Verify no JavaScript errors in console
- Toast should appear at bottom-right after 300ms

**API call failing?**
- Open Network tab in DevTools
- Check CORS errors
- Verify Stack Auth Project ID is correct in login.js
- Confirm test user exists in Neon Auth

---

## Next Steps After Successful Test

1. ✅ Add logout button and logic to customer page
2. ✅ Protect customer page with `requireAuth()` check
3. ✅ Add JWT verification using JWKS (optional, for security)
4. ✅ Implement profile page to display user data
5. ✅ Add "Remember Me" functionality (optional)
