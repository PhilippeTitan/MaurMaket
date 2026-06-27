# MaurMaket — Session Context (Compaction Save)
## Date: June 27, 2026

---

## Goal

Build and polish the **MaurMaketMobile** React Native/Expo mobile app — a Haitian marketplace (e-commerce) app. This session focused on: **deploying backend to Belmo then abandoning it for Render**, **testing MonCash commission logic**, **taking screenshots from real APK build**, **fixing 7+ bugs found in screenshots**, **rebuilding the feed to match TikTok/Instagram layout**, and **full i18n across all 22 screens**.

## Instructions

- **Always run `npx tsc --noEmit`** after changes to verify TypeScript
- **Never kill node.exe processes** (unless explicitly told to kill a specific one you started)
- **Push to GitHub after major changes** with detailed commit messages
- **Always update AGENTS.md blueprint** as we go
- **Frontend only** for now — no backend changes unless fixing image serving or adding new features
- **Git repos**: Backend + Mobile now unified at `https://github.com/PhilippeTitan/MaurMaket.git`
- **Backend**: Express.js (ESM, `"type": "module"`) at `server.js` (~2375 lines)
- **Backend server must be restarted** to pick up new migration columns
- **Decoupled Storage Architecture**: DB stores URL pointers only, images live on CDN (Unsplash)
- **Identity model**: Business sellers can toggle between personal name + personal avatar OR store name + store logo
- **MonCash IS the wallet** — no separate balance/payouts screen needed. Sellers pay via MonCash directly.
- **Settings should follow Instagram's flat row pattern**
- **Commission model**: Tiered 10/8/5% — casual/verified/business
- **Platform commission auto-payouts** to owner's MonCash on every payment completed
- **Backend deployed on Render** at `https://maurmaket.onrender.com` (Belmo was abandoned)
- **MonCashConnect webhook URL** is set to `https://maurmaket.onrender.com/api/payments/webhook`

## Discoveries

### Deployment
- **Belmo/HostingGuru was unreliable** — returned 502/503, Nixpacks ignored custom build commands, service never started
- **Root cause on Belmo**: `isMain` check in server.js compared `process.argv[1]` (relative path) with `fileURLToPath(import.meta.url)` (absolute path) — they didn't match so the server never called `app.listen()`
- **Fixed isMain** to use `path.resolve()` on both sides for consistent comparison
- **nixpacks.toml** was created but Belmo's Nixpacks may not respect custom install phases
- **strip-mobile-deps.mjs** strips mobile deps from package.json for deployment — Dockerfile updated to use it
- **Belmo abandoned** — went back to Render which was already working fine
- **Render free tier**: spins down after 15min idle, ~30s cold start on first request
- **Frontend api.ts** now points to `https://maurmaket.onrender.com`

### MonCash Commission Testing
- Created test accounts, products, and orders via API
- **Simulated webhook** with HMAC-SHA256 signature — commission splitting works perfectly
- Casual seller (10%): Rs 1000 order → Rs 900 to seller, Rs 100 platform commission
- Platform payout attempted to `50946056792` via MonCashConnect payout API
- **`platform_revenue` table** tracks every commission
- **`platform_payouts` table** tracks every automatic payout to platform owner
- Webhook secret from .env: `whsec_de03593cda058faf5e5b3289ea4ee996c3a87da473c3643d`

### EAS Build
- User successfully built APK via `eas build --platform android --profile preview`
- App loads, connects to Render, signup works, images load
- **eas-cli** installed globally: `npm install -g eas-cli`

### Screenshot Analysis (6 screenshots)
- **Duplicate orders**: Same order appeared twice — backend buyer query JOINed `order_items` without `GROUP BY`
- **MonCashConnect 400 error**: ReturnUrl `maurmaket://payment-return` missing orderId param
- **Cart cleared on payment failure**: clearCart() ran in catch block too
- **Safe area issues**: `react-native-safe-area-context` installed but NEVER used — hardcoded paddings everywhere
- **Search bar too small**: 36px height vs Pinterest's 44-48px standard

### i18n System (COMPLETED THIS SESSION)
- **Fully functional** infrastructure: persistence via `mm_lang` SecureStore, `useTranslation()` hook, `i18n.init()` called at startup
- **i18n.ts expanded from ~90 keys to ~400 keys** across 3 languages (EN/HT/FR)
- Added `{param}` interpolation support to `i18n.t()`
- **All 22 live screens now use `t()` translations** — zero hardcoded English strings remain
- Translation keys organized by namespace: `feed.*`, `explore.*`, `checkout.*`, `cart.*`, `orders.*`, `orderDetail.*`, `productDetail.*`, `me.*`, `settings.*`, `sellerOnboarding.*`, `editListing.*`, `storefront.*`, `chat.*`, `inbox.*`, `wishlist.*`, `addresses.*`, `payments.*`, `paymentReturn.*`, `settingsEdit.*`, `addListing.*`, `common.*`

### Feed Layout (TikTok Research)
- TikTok action rail: 12px from right, 15px gap, 35px icons, 60px touch area
- TikTok bottom info: ~200-300px from bottom, aligns with share/bookmark buttons
- Current feed uses full-screen cards (100% height) — user wants to keep this
- Action rail was at `screenHeight * 0.36` — raised to `screenHeight * 0.42`

### Seller Onboarding Bug
- After casual tier selection: `setStep('done')` called but no `case 'done'` in `renderStep()` — renders black screen
- Verified/Business tiers: `handleComplete()` function exists but is NEVER wired to any button (dead code)
- **FIXED**: Both now call `nav.goBack()` + handleComplete() is wired to verify step buttons

### Image Upload
- **Multer upgraded**: 5MB → 8MB limit, fileFilter for JPEG/PNG/GIF/WebP only
- **Error handler added**: Proper multer error messages (LIMIT_FILE_SIZE, etc.)
- **Tested locally and on Render**: All scenarios pass (valid image, non-image rejection, no file, PNG)
- **Committed to git** but was on separate commit from i18n (`89830b6`)

### Back Button Audit
- All 22 screens checked for back buttons
- **SellerOnboardingScreen** was MISSING back button — **FIXED** (added arrow-left + nav.goBack())
- **PaymentReturnScreen** has no back button during polling — SKIPPED (transient screen, has exit buttons on timeout)

### Nvidia NIM / Model Comparison
- User has Nvidia API key for free models
- **Kimi K2.6** is the best model on Nvidia's free tier — beats MiMo V2.5 on intelligence (53.9 vs 49.0), reasoning (60.3 vs 53.0), coding (47.1 vs 42.1)
- **DeepSeek V4** models have a known OpenCode bug (hang without `chat_template_kwargs`) — avoid
- **Nemotron 3 Ultra** is 3x faster but slightly less smart than MiMo V2.5
- OpenCode config written to `C:\Users\drato\.config\opencode\opencode.json` with Kimi K2.6, Nemotron 3 Ultra, Nemotron 3 Super
- `NVIDIA_API_KEY` set via `setx` — user needs to restart terminal for it to take effect
- User may need to use `/connect` in OpenCode to add NVIDIA credentials if env var doesn't work

### SQLite Error
- User hit `SQLITE_MISUSE` error in OpenCode TUI — internal OpenCode bug, not related to our work
- Fix: delete session DB and relaunch

## Accomplished

### This Session (Complete):

**1. Deployment**
- Attempted Belmo deployment with nixpacks.toml and strip-mobile-deps.mjs
- Fixed isMain path comparison for container deployments
- **Abandoned Belmo** — reverted to Render which was already working
- Updated `src/api.ts` to point back to Render URLs

**2. MonCash Commission Testing**
- Full end-to-end test: signup → product → order → payment → webhook simulation
- Verified commission splitting: 10% casual tier, Rs 900 net to seller, Rs 100 platform

**3. Screenshot Bug Fixes (7 fixes)**
- Fix 1: Duplicate orders — `DISTINCT ON (o.id)` in buyer query
- Fix 2: Broken returnUrl — added `?orderId=` param
- Fix 3: Cart cleared on failure — moved `clearCart()` to success branch only
- Fix 4: Safe area — `SafeAreaProvider` + `useSafeAreaInsets()` across screens
- Fix 5: Search bar — Pinterest-style (44px height, 24px radius)
- Fix 6: API error details — included `details` field
- Fix 7: Deep link regex — matched `orderId` param

**4. Feed TikTok Layout Overhaul**
- Action rail raised to `screenHeight * 0.42`
- Gradient height: 55%, bottom overlay padding for tab bar clearance

**5. Seller Onboarding Black Screen Fix**
- `handleCompleteWithTier`: replaced `setStep('done')` with `nav.goBack()`
- Wired dead `handleComplete()` to verify step buttons

**6. Image Upload Error Fix**
- Increased multer file size limit from 5MB to 8MB
- Added fileFilter for allowed MIME types
- Added multer error handler with user-friendly messages

**7. Follow Button State Fix**
- FeedScreen: Added `getFollowing()` call on mount
- StorefrontScreen: Replaced `getFollowerCount` with `getFollowing()` for follow state

**8. Retry Payment HTTPS Fix**
- Hardcoded `https://` in retry endpoint's returnUrl

**9. Orders Back Button**
- Added TouchableOpacity with arrow-left icon

**10. Full i18n — ALL 22 screens use `t()` translations (LARGE)**
- Expanded i18n.ts from ~90 to ~400 keys (EN/HT/FR)
- All 22 live screens updated with `useTranslation()` + `t()` calls
- Added back button to SellerOnboardingScreen
- Committed as `f556114` and pushed

**11. Server.js commit**
- Multer 8MB + fileFilter + error handler + HTTPS retry URL
- Committed as `89830b6` and pushed

**12. Nvidia NIM setup**
- Created OpenCode config with Kimi K2.6, Nemotron 3 Ultra, Nemotron 3 Super
- Set NVIDIA_API_KEY env var via setx

### What's Next:

1. **User testing with real MonCash money** — webhook URL is configured on Render
2. **Build new APK** with i18n changes: `eas build --platform android --profile preview`
3. **Fix OpenCode SQLITE_MISUSE** — delete session DB, relaunch, use `/connect` for NVIDIA if needed
4. **Test Nvidia models in OpenCode** — Kimi K2.6 should be the primary model

## Critical Files

```
C:\MAURINEX\Maurinex Projects\New folder\MaurMaket\
├── AGENTS.md                        # Full blueprint
├── SESSION_CONTEXT.md               # THIS FILE — save point
├── package.json                     # Merged backend + mobile deps
├── server.js                        # Backend (~2375 lines) — deployed on Render
├── .env                             # PLATFORM_PHONE=50946056792
├── Dockerfile                       # Uses strip-mobile-deps.mjs
├── src/
│   ├── api.ts                       # Production URL: https://maurmaket.onrender.com
│   ├── i18n.ts                      # ~400 translation keys, EN/HT/FR, params support
│   ├── store.ts                     # Reactive state
│   ├── theme.ts                     # COLORS, SPACING, FONTS
│   ├── types.ts                     # TypeScript interfaces
│   └── screens/
│       ├── (all 22 screens)          # All use useTranslation() + t()
├── OpenCode config: C:\Users\drato\.config\opencode\opencode.json
```

### Local server restart:
```
cd "C:\MAURINEX\Maurinex Projects\New folder\MaurMaket"
node server.js
```

### Build APK:
```
eas build --platform android --profile preview
```

### Git commits in this session:
- `f556114` — feat: full i18n across all 22 screens (EN/HT/FR)
- `89830b6` — fix: upload multer 8MB + fileFilter + error handler + HTTPS retry URL
