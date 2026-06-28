# MaurMaket — Session Context (Compaction Save)
## Date: June 27, 2026
## Resume command: `opencode -s ses_105795b44ffe01P0vMPwpibCJP`

---

## Goal

Build and polish the **MaurMaketMobile** React Native/Expo mobile app — a Haitian marketplace (e-commerce) app connecting buyers and sellers in Haiti. TikTok-style vertical swipe feed, MonCash payments, seller dashboard, commission system, full i18n (EN/HT/FR).

## Instructions

- **Always run `npx tsc --noEmit`** after changes to verify TypeScript
- **Never kill node.exe processes** (unless explicitly told to kill a specific one you started)
- **Push to GitHub after major changes** with detailed commit messages
- **Always update AGENTS.md blueprint** as we go
- **Frontend only** for now — no backend changes unless fixing image serving or adding new features
- **Git repos**: Backend + Mobile unified at `https://github.com/PhilippeTitan/MaurMaket.git`
- **Backend**: Express.js (ESM, `"type": "module"`) at `server.js` (~2375 lines)
- **Decoupled Storage Architecture**: DB stores URL pointers only, images live on CDN (Unsplash)
- **Identity model**: Business sellers can toggle between personal name + personal avatar OR store name + store logo
- **MonCash IS the wallet** — no separate balance/payouts screen needed
- **Commission model**: Tiered 10/8/5% — casual/verified/business
- **Backend deployed on Render** at `https://maurmaket.onrender.com` (Belmo was abandoned)
- **resizeMode="cover"** for masonry grids, **"contain"** for feed/product detail hero images
- **The app's real competition is WhatsApp + Facebook Marketplace, NOT Vinted/Depop**
- **Multi-image listings are the #1 missing trust signal in C2C commerce**

## Key Design Decisions

- **Masonry grids** use `resizeMode="cover"` + dynamic heights via `Image.getSize()` + `DEFAULT_IMG_H = CARD_W * 1.25` fallback
- **Feed/ProductDetail** use `resizeMode="contain"` to show full images without cropping
- **Price overlays** use pill badges (coral on white bg) NOT text-shadow — breaks on light product photos
- **Safe areas** use `useSafeAreaInsets()` — never hardcode `paddingTop: SPACING.xl + 40`
- **Back buttons** always use `<MaterialCommunityIcons name="arrow-left" />` — never `←` text

## Git History (Latest First)

```
611d95c feat: wishlist thumbnails — 48x48 product image + stock indicator per row
dcdc612 feat: multi-image listings + order summary at checkout
3d976cd fix: masonry cover + strategic context + safe area + icons
ed31f87 fix: remove height clamps — card height purely follows image aspect ratio
0a3e93f fix: Pinterest-style masonry — dynamic card heights hug image aspect ratio
3abfe96 fix: action rail buttons now match TikTok/Reels/Shorts dimensions
2a45833 fix: all images now use resizeMode contain instead of cover
5c46e1b fix: images no longer zoomed/cropped — use contain in feed + product detail
b66b60f fix: critical backend security + stress test audit fixes
8e34d04 docs: save session ID for resume
fa841f2 docs: save session context as compaction backup
f556114 feat: full i18n across all 22 screens (EN/HT/FR)
89830b6 fix: upload multer 8MB + fileFilter + error handler + HTTPS retry URL
```

## What Was Accomplished (Complete)

### Phase 1 — Masonry Fix (3 screens) ✅
- ExploreScreen: `cover` + `DEFAULT_IMG_H` + `MIN_H`/`MAX_H` + price pill badge
- MeScreen: `cover` + `DEFAULT_IMG_H` + dynamic heights via `Image.getSize()`
- StorefrontScreen: same pattern as MeScreen

### Phase 2 — Safe Area (3 screens) ✅
- HomeScreen, CartScreen, ChatScreen: replaced `paddingTop: SPACING.xl + 40` with `useSafeAreaInsets().top + SPACING.md`

### Phase 3 — Back Button Icons (2 screens) ✅
- NotificationsScreen, MessagesScreen: replaced `←` text with `MaterialCommunityIcons "arrow-left"`

### Phase 4 — Wishlist Thumbnails ✅
- 48×48 thumbnail per product + stock indicator ("Available" / "Sold out")
- Committed as `611d95c`

### Multi-Image Listings ✅
- AddListingScreen: up to 8 images, multi-select gallery picker, Promise.all upload, horizontal thumbnail row with X remove + add button
- EditListingScreen: same multi-image support
- Committed as `dcdc612`

### Order Summary at Checkout ✅
- CheckoutScreen: each cart item with 44×44 thumbnail, product name, seller name, quantity, coral price before "Pay with MonCash"
- Committed as `dcdc612`

### Feed Polish ✅
- Coral follow button, larger avatar (36dp), action rail raised for thumb reach

### i18n — All 22 Screens ✅
- Expanded i18n.ts from ~90 to ~400 keys across EN/HT/FR
- All 22 live screens use `useTranslation()` + `t()` calls
- Added `addListing.photos` and `checkout.orderSummary` keys

### Other Fixes (Earlier Sessions)
- Screenshot bug fixes: duplicate orders, returnUrl, cart cleared on failure, safe area, search bar, API errors, deep link regex
- SellerOnboardingScreen: black screen fix + back button added
- Image upload: multer 8MB + fileFilter + error handler
- Follow button state: getFollowing() on mount
- Retry payment: hardcoded https://
- Orders: back button added

## Discoveries

### Deployment
- Belmo/HostingGuru was unreliable — abandoned, back on Render
- Render free tier spins down after 15min idle, ~30s cold start

### MonCash Commission
- Webhook simulation works: 10% casual tier, Rs 900/100 split
- `platform_revenue` + `platform_payouts` tables track everything
- Platform owner phone: `50946056792`
- Webhook secret: `whsec_de03593cda058faf5e5b3289ea4ee996c3a87da473c3643d`

### Stress Test Findings (from Claude)
- **Multi-image listings**: #1 trust signal in C2C, now done
- **Order summary at checkout**: reduces abandonment, now done
- **Image sharing in chat**: prevents off-app WhatsApp exfiltration — NOT YET DONE
- **Negotiation dock**: formalizes Haiti's haggling culture — the sharpest weapon
- **ProfileScreen**: legacy dead code in nav tree, should be removed or redirected

### AI Model Comparison (Nvidia NIM)
- **Kimi K2.6** best on free tier: intelligence 53.9, reasoning 60.3, coding 47.1
- MiMo V2.5 (current model): intelligence 49.0, reasoning 53.0, coding 42.1
- DeepSeek V4 models hang in OpenCode (chat_template_kwargs bug) — avoid
- Nemotron 3 Ultra: 3x faster but slightly less smart

## Remaining Work

### High Priority
1. **Image sharing in chat** — prevents WhatsApp exfiltration. Needs backend upload endpoint for chat attachments.
2. **ProfileScreen cleanup** — remove dead code from nav tree
3. **Build new APK**: `eas build --platform android --profile preview`

### Low Priority
4. Hardcoded `paddingTop: SPACING.xl + 40` in HomeScreen, CartScreen, ChatScreen — partially fixed but verify
5. Seller analytics gated too aggressively — show teaser metrics to casual sellers

### Testing
6. **User testing with real MonCash money** — webhook URL configured on Render
7. **Test Nvidia models in OpenCode** — Kimi K2.6 via `/connect`

## Critical Files

```
C:\MAURINEX\Maurinex Projects\New folder\MaurMaket\
├── AGENTS.md                        # Full blueprint (updated in 3d976cd)
├── SESSION_CONTEXT.md               # THIS FILE — save point
├── package.json                     # Merged backend + mobile deps
├── server.js                        # Backend (~2375 lines) — deployed on Render
├── .env                             # PLATFORM_PHONE=50946056792
├── Dockerfile                       # Uses strip-mobile-deps.mjs
├── src/
│   ├── api.ts                       # Production URL: https://maurmaket.onrender.com
│   ├── i18n.ts                      # ~400 translation keys, EN/HT/FR
│   ├── store.ts                     # Reactive state (user, token, cart)
│   ├── theme.ts                     # COLORS, SPACING, FONTS
│   ├── types.ts                     # TypeScript interfaces
│   ├── navigation.ts                # Navigation types
│   └── screens/
│       ├── FeedScreen.tsx           # TikTok feed, contain, coral follow btn
│       ├── ExploreScreen.tsx        # Pinterest masonry, cover + DEFAULT_IMG_H
│       ├── ProductDetailScreen.tsx  # Hero image contain, seller reviews
│       ├── MeScreen.tsx             # Profile + seller dashboard, cover masonry
│       ├── CartScreen.tsx           # Cart + promo, safe area fixed
│       ├── CheckoutScreen.tsx       # Delivery/Meetup + MonCash + order summary
│       ├── OrdersScreen.tsx         # Buying/selling order management
│       ├── OrderDetailScreen.tsx    # Timeline + review + dispute
│       ├── ChatScreen.tsx           # 1:1 messaging, safe area fixed
│       ├── InboxScreen.tsx          # Notifications + conversations
│       ├── SettingsScreen.tsx       # Instagram-style settings
│       ├── SettingsEditScreen.tsx   # Generic field editor
│       ├── AddListingScreen.tsx     # Post new product — multi-image (up to 8)
│       ├── EditListingScreen.tsx    # Edit/delete product — multi-image
│       ├── SellerOnboardingScreen.tsx # 3-tier wizard with back button
│       ├── StorefrontScreen.tsx     # Public seller profile, cover masonry
│       ├── WishlistScreen.tsx       # Wishlist with 48x48 thumbnails + stock
│       ├── AddressesScreen.tsx      # Saved addresses
│       ├── PaymentsScreen.tsx       # Seller balance + payouts
│       ├── PaymentReturnScreen.tsx  # MonCash return polling
│       ├── LoginScreen.tsx          # Sign in
│       └── SignupScreen.tsx         # Create account
├── uploads/                         # Uploaded images (served at /uploads/)
└── OpenCode config: C:\Users\drato\.config\opencode\opencode.json
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

### Resume session:
```
opencode -s ses_105795b44ffe01P0vMPwpibCJP
```
