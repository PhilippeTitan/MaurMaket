# MaurMaket — Project Context for AI Agents

## Git Protocol
- **Always push after major changes**: After committing any significant feature, bug fix, or refactor, run `git push` immediately. Do not batch pushes — push each meaningful change.

## Safety Rules
- **NEVER kill node.exe processes**: OpenCode runs on Node.js. Killing random `node.exe` processes can kill OpenCode itself. Never use `taskkill`, `kill`, or any command that terminates node processes unless explicitly told to kill a specific process you started.

## Overview
Haitian marketplace (e-commerce) app connecting buyers and sellers. React Native/Expo mobile app (TikTok-style vertical swipe feed) + Express.js backend. MonCash payments, seller dashboard, commission system.

## Tech Stack
- **Mobile:** React Native 0.85.3 + Expo SDK 56 + TypeScript 6
- **Backend:** Express.js 4 (ESM, `"type": "module"`)
- **Database:** PostgreSQL (Neon serverless via `pg` Pool)
- **Payments:** MonCashConnect API (Haitian mobile money) with tiered commission
- **Navigation:** React Navigation 7 (bottom tabs + native stack)
- **State:** Custom reactive store (`src/store.ts`)
- **Storage:** `expo-secure-store` (native) / `localStorage` (web)
- **Styling:** StyleSheet, dark theme (#0D1117 bg, #FF4D6A coral)
- **Deployment:** Fly.io (Docker), GitHub Actions CI/CD

## Project Structure
```
├── server.js              # Express backend (~2300 lines)
├── package.json           # Unified deps: Express + Expo + React Native
├── App.tsx                # React Native root component (auth gate + navigation)
├── index.ts               # Expo entry point
├── app.json               # Expo config (scheme: maurmaket://)
├── eas.json               # EAS Build config (APK preview, AAB production)
├── tsconfig.json          # extends expo/tsconfig.base, strict mode
├── Dockerfile             # Backend-only production image
├── fly.toml               # Fly.io config (iad region, port 3001)
├── src/
│   ├── api.ts             # API client (auto env detection, 40+ endpoints)
│   ├── store.ts           # Reactive state (user, token, cart)
│   ├── theme.ts           # COLORS, SPACING, FONTS, helpers
│   ├── types.ts           # All TypeScript interfaces
│   ├── navigation.ts      # Navigation type definitions
│   ├── i18n.ts            # EN/HT/FR translations
│   └── screens/
│       ├── FeedScreen.tsx      # TikTok vertical swipe feed
│       ├── ExploreScreen.tsx   # 2-col grid + search + filters
│       ├── MeScreen.tsx        # Profile + seller dashboard
│       ├── ProductDetailScreen.tsx # Image carousel + reviews
│       ├── CartScreen.tsx      # Cart + promo codes
│       ├── CheckoutScreen.tsx  # Delivery/Meetup + MonCash
│       ├── OrdersScreen.tsx    # Buying/selling order management
│       ├── OrderDetailScreen.tsx # Timeline + review + dispute
│       ├── SettingsScreen.tsx  # Instagram-style settings
│       ├── SettingsEditScreen.tsx # Generic field editor
│       ├── ChatScreen.tsx      # 1:1 messaging
│       ├── InboxScreen.tsx     # Notifications + conversations
│       ├── StorefrontScreen.tsx # Public seller profile
│       ├── SellerOnboardingScreen.tsx # 3-tier wizard
│       ├── AddListingScreen.tsx # Post new product
│       ├── EditListingScreen.tsx # Edit/delete product
│       ├── WishlistScreen.tsx  # Wishlist items
│       ├── AddressesScreen.tsx # Saved addresses
│       ├── PaymentsScreen.tsx  # Seller balance + payouts
│       ├── PaymentReturnScreen.tsx # MonCash return polling
│       ├── LoginScreen.tsx     # Sign in
│       └── SignupScreen.tsx    # Create account
├── assets/                # App icons + splash
└── uploads/               # Uploaded images (served at /uploads/)
```

## Database Schema (PostgreSQL — auto-migrated at startup)

### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK, gen_random_uuid() |
| full_name | TEXT | NOT NULL |
| email | TEXT | NOT NULL, UNIQUE |
| password_hash | TEXT | bcrypt hash |
| phone | TEXT | Stripped of `+` prefix |
| role | TEXT | default 'buyer' |
| avatar_url | TEXT | nullable |
| bio | TEXT | nullable |
| seller_tier | VARCHAR(20) | none/casual/verified/business |
| store_name | TEXT | nullable |
| store_logo_url | TEXT | nullable |
| use_store_identity | BOOLEAN | default false |
| id_document_url | TEXT | nullable |
| id_verified | BOOLEAN | default false |
| id_submitted_at / id_verified_at | TIMESTAMP | nullable |
| created_at / updated_at | TIMESTAMP | |

### `products`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| seller_id | UUID | FK → users.id |
| category_id | UUID | FK → categories.id, nullable |
| name, description | TEXT | |
| price | DECIMAL(10,2) | |
| stock | INTEGER | |
| is_available | BOOLEAN | default true |
| created_at / updated_at | TIMESTAMP | |

### `product_images`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| product_id | UUID | FK → products.id |
| image_url | TEXT | |
| is_primary | BOOLEAN | |
| display_order | INTEGER | |

### `categories`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | TEXT | |
| display_order | INTEGER | |

### `orders`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK, gen_random_uuid() |
| buyer_id | UUID | FK → users.id |
| total_amount | DECIMAL(10,2) | |
| status | TEXT | pending/paid/processing/shipped/delivered/cancelled/completed |
| moncash_reference | TEXT | nullable |
| delivery_method | VARCHAR(20) | default 'meetup', or 'delivery' |
| delivery_name/phone/address/city/note | TEXT | nullable |
| meetup_lat/lng | DECIMAL(10,7) | nullable |
| meetup_address/note | TEXT | nullable |
| meetup_confirmed | BOOLEAN | default false |
| meetup_proposed_by | UUID | FK → users.id, nullable |
| created_at / updated_at | TIMESTAMP | |

### `order_items`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| order_id | UUID | FK → orders.id |
| product_id | UUID | FK → products.id |
| seller_id | UUID | FK → users.id |
| quantity | INTEGER | |
| price | DECIMAL(10,2) | |

### `order_events`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| order_id | UUID | FK → orders.id |
| event_type | VARCHAR(50) | status_change, meetup_proposed, meetup_confirmed, note_added, payment_received |
| actor_id | UUID | FK → users.id |
| old_value/new_value/note | TEXT | nullable |
| created_at | TIMESTAMP | |

### `reviews`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| order_id | UUID | FK → orders.id |
| reviewer_id | UUID | FK → users.id |
| seller_id | UUID | FK → users.id |
| rating | INTEGER | 1-5 |
| comment | TEXT | nullable |
| seller_response | TEXT | nullable |
| seller_responded_at | TIMESTAMP | nullable |
| is_edited | BOOLEAN | default false |
| UNIQUE(order_id, reviewer_id) | | One review per order per user |

### `wishlists`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users.id ON DELETE CASCADE |
| product_id | UUID | FK → products.id ON DELETE CASCADE |
| UNIQUE(user_id, product_id) | | |

### `follows`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| follower_id | UUID | FK → users.id ON DELETE CASCADE |
| seller_id | UUID | FK → users.id ON DELETE CASCADE |
| UNIQUE(follower_id, seller_id) | | |

### `notifications`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users.id ON DELETE CASCADE |
| type | VARCHAR(50) | order_status, new_message, review_received, etc. |
| title | TEXT | |
| body | TEXT | nullable |
| data | JSONB | navigation context |
| is_read | BOOLEAN | default false |
| created_at | TIMESTAMP | |

### `conversations`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| order_id | UUID | FK → orders.id, nullable |
| product_id | UUID | FK → products.id, nullable |
| buyer_id | UUID | FK → users.id |
| seller_id | UUID | FK → users.id |
| last_message_at | TIMESTAMP | |

### `messages`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| conversation_id | UUID | FK → conversations.id |
| sender_id | UUID | FK → users.id |
| content | TEXT | |
| is_read | BOOLEAN | default false |
| created_at | TIMESTAMP | |

### `promo_codes`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| code | VARCHAR(50) | UNIQUE |
| seller_id | UUID | FK → users.id, nullable |
| discount_type | VARCHAR(20) | percentage or fixed |
| discount_value | DECIMAL(10,2) | |
| min_order_amount | DECIMAL(10,2) | default 0 |
| max_uses | INTEGER | nullable |
| uses_count | INTEGER | default 0 |
| valid_until | TIMESTAMP | nullable |
| is_active | BOOLEAN | default true |

### `promo_uses`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| promo_id | UUID | FK → promo_codes.id |
| user_id | UUID | FK → users.id |
| order_id | UUID | FK → orders.id |
| discount_amount | DECIMAL(10,2) | |
| UNIQUE(promo_id, user_id) | | |

### `disputes`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| order_id | UUID | FK → orders.id |
| raised_by | UUID | FK → users.id |
| reason | VARCHAR(50) | |
| description | TEXT | nullable |
| status | VARCHAR(20) | default 'open' |
| resolution | TEXT | nullable |

### `saved_addresses`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users.id ON DELETE CASCADE |
| label | VARCHAR(50) | 'Home', 'Work', etc. |
| name | TEXT | |
| phone | VARCHAR(20) | |
| address | TEXT | |
| city | TEXT | |
| is_default | BOOLEAN | |

### `seller_balances`
| Column | Type | Notes |
|---|---|---|
| seller_id | UUID | PK, FK → users.id ON DELETE CASCADE |
| balance | DECIMAL(10,2) | default 0 (net after commission) |
| total_earned | DECIMAL(10,2) | default 0 (net after commission) |
| total_paid_out | DECIMAL(10,2) | default 0 |

### `payouts`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| seller_id | UUID | FK → users.id |
| amount | DECIMAL(10,2) | CHECK > 0 |
| status | VARCHAR(20) | pending/processing/completed/failed |
| receiver_phone | VARCHAR(20) | |
| moncash_reference | VARCHAR(150) | nullable |
| error_message | TEXT | nullable |

### `platform_revenue`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| order_id | UUID | FK → orders.id |
| seller_id | UUID | FK → users.id |
| seller_tier | VARCHAR(20) | casual/verified/business |
| gross_amount | DECIMAL(10,2) | |
| commission_rate | DECIMAL(5,4) | 0.10/0.08/0.05 |
| commission_amount | DECIMAL(10,2) | |
| platform_fee | DECIMAL(10,2) | same as commission |
| net_to_seller | DECIMAL(10,2) | |
| created_at | TIMESTAMP | |

## Commission Model
| Seller Tier | Commission Rate | Example (Rs 1000 order) |
|---|---|---|
| Casual | 10% | Platform keeps Rs 100, seller gets Rs 900 |
| Verified | 8% | Platform keeps Rs 80, seller gets Rs 920 |
| Business | 5% | Platform keeps Rs 50, seller gets Rs 950 |

Commission is deducted at payment time in the webhook handler. `seller_balances` stores NET amounts (after commission).

## API Endpoints (all under /api)

### Auth
- **POST /api/auth/signup** — `{fullName, email, password, phone}` → `{user, token}`
- **POST /api/auth/login** — `{email, password}` → `{user, token}`
- **GET /api/auth/me** — Bearer → `{user}`
- **PUT /api/auth/profile** — Bearer, body `{fullName, email, phone, bio, avatarUrl}` → `{user}`
- **PUT /api/auth/password** — Bearer, body `{currentPassword, newPassword}` → `{updated: true}`
- **PUT /api/auth/become-seller** — Bearer → `{user}` (role upgraded to 'seller')
- **PUT /api/auth/upgrade-tier** — Bearer, body `{tier, storeName?, storeLogoUrl?, idDocumentUrl?}` → `{user}`
- **PUT /api/auth/seller-profile** — Bearer, body `{storeName?, storeLogoUrl?, useStoreIdentity?}` → `{user}`
- **GET /api/seller/verification-status** — Bearer → verification status

### Products
- **GET /api/products** — Query: `category, search, seller, minPrice, maxPrice, sort, page, limit, personalized` → `{products[], total, page, pages}`
- **GET /api/products/:id** → `{product{..., images[], seller{...}, category}}`
- **POST /api/products** — Bearer+Seller. `{name, description, price, stock, categoryId, images[]}` → `{product}`
- **PUT /api/products/:id** — Bearer+Seller (ownership check)
- **DELETE /api/products/:id** — Bearer+Seller (ownership check)

### Orders
- **GET /api/orders** — Bearer → `{buyerOrders[], sellerOrders[]}`
- **GET /api/orders/:id** — Bearer (buyer or seller only) → `{order{..., items[]}}`
- **POST /api/orders** — Bearer. `{items, deliveryMethod?, ...}` → `{order}`
- **PUT /api/orders/:id/cancel** — Bearer (buyer only)
- **PUT /api/orders/:id/meetup** — Bearer. `{lat, lng, address, note}`
- **PUT /api/orders/:id/meetup/confirm** — Bearer
- **PUT /api/orders/:id/complete** — Bearer
- **GET /api/orders/:id/timeline** — Bearer → `{events[]}`
- **POST /api/orders/:id/reorder** — Bearer → adds items to cart

### Reviews
- **POST /api/reviews** — Bearer (buyer). `{orderId, rating, comment}`
- **PUT /api/reviews/:id** — Bearer (buyer). Edits own review.
- **POST /api/reviews/:id/respond** — Bearer (seller). Responds to review.
- **GET /api/reviews/seller/:sellerId** — Public. Paginated with avg rating.
- **GET /api/reviews/product/:productId** — Public. Reviews for a product's orders.

### Wishlist
- **POST /api/wishlist/:productId** — Bearer. Toggle add/remove.
- **GET /api/wishlist** — Bearer. User's wishlist with product details.
- **GET /api/wishlist/check/:productId** — Bearer. Check if wishlisted.

### Follows
- **POST /api/follow/:sellerId** — Bearer. Toggle follow/unfollow.
- **GET /api/following** — Bearer. List followed sellers.
- **GET /api/followers/count/:sellerId** — Public. Follower count.

### Seller Storefront
- **GET /api/sellers/:id** — Public. Seller profile with stats.

### Seller Dashboard
- **GET /api/seller/products** — Bearer+Seller
- **GET /api/seller/orders** — Bearer+Seller
- **PUT /api/seller/orders/:id/status** — Bearer+Seller
- **GET /api/seller/balance** → `{balance, total_earned, total_paid_out}`
- **GET /api/seller/payouts** — History
- **POST /api/seller/payouts/request** — Bearer+Seller. `{amount}`. Min Rs 50.
- **GET /api/seller/analytics** — Revenue, orders, rating, top products
- **GET /api/seller/products/low-stock** — Products with stock ≤ 3

### Payments
- **POST /api/payments/create** — Bearer. `{orderId, returnUrl}` → `{paymentUrl}`
- **POST /api/payments/retry/:orderId** — Bearer → `{paymentUrl}`
- **POST /api/payments/webhook** — No auth. HMAC-SHA256 verified. Handles: payment.completed (with commission), payment.failed, payout.completed, payout.failed

### Messaging
- **GET /api/conversations** — Bearer
- **POST /api/conversations** — Bearer. `{userId, productId?}`
- **GET /api/conversations/:id/messages** — Bearer
- **POST /api/conversations/:id/messages** — Bearer. `{content}`
- **GET /api/conversations/unread-count** — Bearer

### Notifications
- **GET /api/notifications** — Bearer
- **GET /api/notifications/unread-count** — Bearer
- **PUT /api/notifications/:id/read** — Bearer
- **PUT /api/notifications/read-all** — Bearer

### Other
- **POST /api/upload** — Bearer + multipart `image` (max 5MB) → `{url}`
- **POST /api/promos** — Bearer+Seller. Create promo code.
- **GET /api/promos/mine** — Bearer+Seller. List own promos.
- **POST /api/promos/validate** — Bearer. Validate promo code.
- **POST /api/addresses** — Bearer. Create address.
- **GET /api/addresses** — Bearer. List addresses.
- **PUT /api/addresses/:id** — Bearer. Update address.
- **DELETE /api/addresses/:id** — Bearer. Delete address.
- **POST /api/disputes** — Bearer. Create dispute.
- **GET /api/health** → `{status, database, hasMccKey, totalCommission}`

## Auth System
- Token is **real JWT** signed with `JWT_SECRET` via `jsonwebtoken`. Payload: `{id, email, role}`.
- Stored in `expo-secure-store` (native) / `localStorage` (web) under key `mm_token`
- Passwords hashed with **bcrypt** (salt rounds = 10)
- Phone numbers stored **without** `+` prefix internally, displayed with `+509` on frontend
- `sellerRequired` middleware checks `req.user.role !== 'seller'` → 403

## Order Status Flow
`pending → paid → processing → shipped → delivered → completed`

## Commission Flow
1. Buyer pays via MonCash
2. Webhook fires `payment.completed`
3. For each seller in the order:
   - Look up seller's `seller_tier`
   - Calculate commission: Casual 10%, Verified 8%, Business 5%
   - Credit `seller_balances` with NET amount (gross - commission)
   - Log to `platform_revenue` table
4. Notification sent to seller with net amount credited

## MonCash Integration
- **Payment creation:** `POST /api/payments/create` → calls MonCashConnect → returns `paymentUrl`
- **Webhook:** `POST /api/payments/webhook` → HMAC-SHA256 verified → processes payment.completed/failed
- **Env vars:** `MCC_KEY`, `MCC_WEBHOOK_SECRET`, `MONCASH_PAY_CREATE_URL`, `MONCASH_PAYOUT_CREATE_URL`
- **Payout:** `POST /api/seller/payouts/request` → deducts from balance → calls MonCashConnect payout API → rolls back on failure

## Frontend Architecture

### Navigation (App.tsx)
- **Tab Navigator:** Feed, Explore, Sell (FAB), Inbox, Me
- **Stack Navigator:** All screens as modals/pushes
- **Auth Gate:** isLoggedIn → Main stack, else → Auth stack

### State Store (store.ts)
- State: user, token (mm_token), cart (mm_cart)
- Getters: user, token, cart, isLoggedIn, isSeller, cartCount
- Actions: setUser, logout, addToCart, removeFromCart, updateQuantity, clearCart
- Reactivity: onChange/notify pattern

### API Client (api.ts)
- `request()` helper: auto env detection (localhost/tunnel/production), Bearer token, JSON parse
- `getImageUrl()`: resolves relative URLs via UPLOAD_BASE
- `normalizeProduct()`: flattens seller data for consistent rendering

## Strategic Context
- **Real competition:** WhatsApp + Facebook Marketplace, NOT Vinted/Depop
- **Primary churn risk:** Any friction (no multi-image, no order summary, no chat images) pushes users back to WhatsApp group commerce
- **Key differentiators:** Negotiation dock (formalizes Haiti's haggling culture), MonCash integration, Haitian Creole support, feed-first browsing
- **Trust gap:** Haiti's informal economy is ~48% of GDP — trust between strangers is built through visible reviews, verification signals, and professional-feeling UX
- **Negotiation dock:** The sharpest weapon — formalizes something the market already does culturally. Image sharing in chat would seal the loop.

## Design Principles
- **Masonry grids:** Use `resizeMode="cover"` NOT `contain`. Container height must match image's native aspect ratio (via `Image.getSize`). Fallback to `DEFAULT_IMG_H = CARD_W * 1.25` (portrait placeholder) to prevent layout jump when async sizes resolve.
- **Price overlays:** Use pill badges (coral on white bg) NOT text-shadow — shadow breaks on light product photos.
- **Image zoom:** `contain` leaves letterbox bars and looks broken. `cover` + correct container ratio = perfect fill.
- **Safe areas:** Always use `useSafeAreaInsets().top + SPACING.md` for top padding. Never hardcode `SPACING.xl + 40`.
- **Consistent back buttons:** Use `<MaterialCommunityIcons name="arrow-left" />` NOT plain `←` text.

## Known Gaps / Roadmap
### Critical (Phase 1)
1. **Multi-image listings** — API/types support `images[]` but AddListing + EditListing only upload one. #1 trust signal in C2C.
2. **Order summary at checkout** — no item list visible before "Pay with MonCash". High abandonment risk for first-time buyers.
3. **Masonry fix across all grids** — ExploreScreen (Claude file ready), MeScreen, StorefrontScreen need `cover` + `DEFAULT_IMG_H`.

### High Priority (Phase 2)
4. **Image sharing in chat** — prevents off-app WhatsApp exfiltration. Needs backend upload endpoint for chat attachments.
5. **Wishlist thumbnails** — text-only list. Add 40x40 thumbnails and stock indicator.
6. **Delivery estimate on orders** — buyers need "when should I expect this?" answered.
7. **Duplicate conversation bug** — StorefrontScreen always creates new conversation instead of checking existing.

### Low Priority (Phase 3)
8. Hardcoded `paddingTop: SPACING.xl + 40` in CartScreen, ChatScreen
9. `←` text back buttons in NotificationsScreen
10. Seller analytics gated too aggressively — show teaser metrics to casual sellers with upgrade nudge

## Session Compact — 2026-06-28 (UI Polish + Upload Fix)

### Changes Applied
1. **MeScreen grid cards** — Pinterest-style overlay (price badge top-left, name bottom dark gradient, `resizeMode="cover"`, dynamic `DEFAULT_IMG_H = CARD_W * 1.25`)
2. **Image upload fix** — Native uses `expo-file-system/legacy` `uploadAsync()` with `MULTIPART` type (bypasses broken RN FormData). Web unchanged (FormData + File blob).
3. **AddListingScreen** — Added `useSafeAreaInsets`, topBar gets `paddingTop: insets.top + SPACING.sm` (back button no longer behind bezel)
4. **ChatScreen** — Input row `paddingBottom` changed from hardcoded `SPACING.xxl + 16` to `Math.max(insets.bottom, SPACING.md)`

### Session 2 — 2026-06-28 (Upload Hardening + Delete Fix + Chat Order)
1. **Upload pipeline hardened** — `api.ts` uploadImage: data URI support, abort timeout (30s), blob validation, res.ok check, meaningful error messages. Server: relaxed multer fileFilter (mime-only, no extension gate). Both screens: sequential uploads with per-image error feedback.
2. **Product delete fix** — FK constraint blocked deletion (product_images had no CASCADE). Now deletes images first, blocks if product has orders.
3. **Chat message order** — FlatList had `inverted` but server returned ASC → wrong visual order. Switched to ASC server + removed `inverted`, uses scrollToEnd instead.
4. **MeScreen top bar** — Instagram-style: centered name, gear right, tier badges in bio block.
5. **Alert callbacks on web** — Replaced `Alert.alert(onPress)` with direct navigation (callbacks don't fire on React Native Web).
6. **Thumbnail X button** — `overflow: 'hidden'` was clipping the remove button. Changed to `overflow: 'visible'`.

### Session 3 — 2026-06-28 (Feed Snap + EditListing Safe Area + Explore Image Fallback)
1. **FeedScreen snap** — Changed `decelerationRate="fast"` to `decelerationRate={0}` + `disableIntervalMomentum={true}` + `getItemLayout` for TikTok-style one-item-per-swipe.
2. **EditListingScreen safe area** — Added `useSafeAreaInsets`, topBar gets `paddingTop: insets.top + SPACING.sm`. Removed broken delete icon from top bar (duplicate — bottom button exists).
3. **ExploreScreen image fallback** — Added `failedImages` state + `onError` on Image component. Images that fail to load (e.g. local uploads not on Render) show placeholder.
4. **DB cleanup** — Removed 4 test products with no images.

### Commits
- `1a6b5c1` — MeScreen grid cards (Pinterest-style overlay)
- `73aa188` — upload fix with `expo-file-system` uploadAsync
- `b994651` — safe area insets + `expo-file-system/legacy` deprecation migration
- `90a2065` — MeScreen Instagram-style top bar
- `5464646` — fix delete product images FK constraint
- `7b62ada` — hardened upload pipeline edge cases
- `234a4fe` — FileSystemUploadType.MULTIPART enum fix
- `5b27247` — alert callbacks unreliable on web, thumbnail X overflow fix
- `946db0d` — delete uses window.confirm on web, inbox sort
- `12be840` — chat messages ORDER BY DESC (reverted to ASC next commit)
- `cd0458e` — removed inverted FlatList, ASC + scrollToEnd
- `54fcf60` — EditListing safe area, Explore image onError, remove editBadge

### Session 4 — 2026-06-28 (Dead File Cleanup)
1. **Deleted 16 unused files** — `nul`, `expo.log`, `server.log`, `server_check.log`, `server_test.log`, `SESSION_CONTEXT.md`, `MonCashConnect KEYS.txt`, `render.yaml`, `nixpacks.toml`, `public/` dir, `ProfileScreen.tsx`, `HomeScreen.tsx`, `MessagesScreen.tsx`, 3× `android-icon-*.png` assets.
2. **Untracked server.log** — `git rm --cached server.log` (was committed by mistake).
3. **Updated AGENTS.md** — Removed stale references to deleted files (ProfileScreen dead-code note, MaurMaketMobile note, HomeScreen/MessagesScreen in known gaps).

### In-flight / Next Steps
- **StorefrontScreen** needs same `cover` + `DEFAULT_IMG_H` pattern as MeScreen/ExploreScreen
- **ExploreScreen** full replacement from Claude at `C:\Users\drato\Downloads\ExploreScreen.tsx` (not yet applied)
- **proxy.js:1 Uncaught Error: Attempting to use a disconnected port object** — Expo dev server only, not production. Fix: `npx expo start --clear`
- **Multi-image listings** — API/types support `images[]` but AddListing + EditListing only upload one image. #1 missing trust signal in C2C.
- **Image sharing in chat** — prevents off-app WhatsApp exfiltration
- **Duplicate conversation bug** — StorefrontScreen always creates new conversation instead of checking existing
- **WishlistScreen** — text-only list, needs 40x40 thumbnails + stock indicator

## Key Observations
1. Unified project: backend (server.js) + mobile app (Expo/React Native) in one repo
2. Auth is real JWT, NOT base64url. `JWT_SECRET` env var is used.
3. Passwords use bcrypt, NOT SHA-256.
4. Phone numbers: stored without `+`, displayed with `+509`
5. No component library — vanilla StyleSheet
6. No TypeScript on backend — plain JavaScript ESM
7. Currency is Haitian Gourde (Rs)
8. DO NOT commit .env with real credentials
9. `resizeMode="contain"` causes letterbox gaps — use `cover` + dynamic heights
10. The app's real competition is WhatsApp + Facebook Marketplace, not Vinted/Depop
11. Multi-image listings are the #1 missing trust signal in C2C commerce
