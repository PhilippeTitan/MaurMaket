# MaurMaket — Project Context for AI Agents

## Git Protocol
- **Always push after major changes**: After committing any significant feature, bug fix, or refactor, run `git push` immediately. Do not batch pushes — push each meaningful change.

## Safety Rules
- **NEVER kill node.exe processes**: OpenCode runs on Node.js. Killing random `node.exe` processes can kill OpenCode itself. Never use `taskkill`, `kill`, or any command that terminates node processes unless explicitly told to kill a specific process you started.

## Dev Workflow
- **Local backend**: Port 3002 (port 3001 blocked by Windows). Start with `set PORT=3002 && node server.js` or use `start-backend.bat`. Batch file sets `PORT=3002` automatically.
- **Local frontend**: Expo Go on phone via LAN. Start with `npx expo start --clear` or use `start-frontend.bat`.
- **Batch files**: `start-backend.bat` and `start-frontend.bat` in project root for quick restart.
- **Frontend IP**: Changes with network. Check `ipconfig` for current Wi-Fi IPv4. Update `src/api.ts` lines 23, 29 (`API_BASE` and `UPLOAD_BASE`) with new IP for native dev.
- **Production**: Backend on `maurmaket.onrender.com`. `isDev` flag in `api.ts` (line 18) gates dev vs prod URLs — never change the production URL.
- **When user reports frontend issue**: Check both `src/api.ts` (is the URL/IP correct?) AND the backend CMD window (any crashes?). Ask which CMD windows are open.
- **When user reports backend issue**: Check `curl localhost:3002/api/health`. If backend crashed, check the backend CMD window for error output.

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
│       ├── VerificationScreen.tsx  # ID verification (CIN front/back + selfie)
│       ├── BusinessSubscriptionScreen.tsx # Business tier payment
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

### `order_escrow`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| order_id | UUID | FK → orders.id ON DELETE CASCADE |
| seller_id | UUID | FK → users.id |
| gross_amount | DECIMAL(10,2) | |
| commission_amount | DECIMAL(10,2) | |
| net_amount | DECIMAL(10,2) | |
| status | VARCHAR(20) | held/released/refunded |
| created_at | TIMESTAMP | |
| released_at | TIMESTAMP | nullable |
| UNIQUE(order_id, seller_id) | | One escrow per seller per order |

### `meetup_checkins`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| order_id | UUID | FK → orders.id ON DELETE CASCADE |
| user_id | UUID | FK → users.id |
| role | VARCHAR(10) | 'buyer' or 'seller' |
| lat | DECIMAL(10,7) | |
| lng | DECIMAL(10,7) | |
| checked_in_at | TIMESTAMP | |
| qr_token | VARCHAR(255) | signed JWT |
| qr_scanned | BOOLEAN | default false |
| UNIQUE(order_id, user_id) | | One check-in per user per order |

## Commission Model
| Seller Tier | Commission Rate | Example (Rs 1000 order) |
|---|---|---|
| Casual | 10% | Platform keeps Rs 100, seller gets Rs 900 |
| Verified | 8% | Platform keeps Rs 80, seller gets Rs 920 |
| Business | 5% | Platform keeps Rs 50, seller gets Rs 950 |

Commission is deducted at payment time in the webhook handler. `seller_balances` stores NET amounts (after commission).

## Tier System, Verification & Subscription

### Tier Progression (one-way, enforced server-side)
```
Buyer → Casual Seller (free, instant) → Verified Seller (free, ID verification) → Business Seller (Rs 2,500/mo)
```

| Tier | Cost | Commission | Listings | Payouts | Analytics | Store Name | Promo Codes | Trust Badge |
|------|------|-----------|----------|---------|-----------|------------|-------------|-------------|
| Casual | Free | 10% | Max 10 | No | No | No | No | No |
| Verified | Free | 8% | Unlimited | Yes | Overview only | No | No | Yes (shield) |
| Business | Rs 2,500/mo | 5% | Unlimited | Yes | Full + top products | Yes | Yes | Yes (shield) |

### ID Verification System
- **Haitian CIN**: front + back capture via `expo-camera`
- **OCR**: `@react-native-ml-kit/text-recognition` (on-device, free)
- **Face match**: `@react-native-ml-kit/face-detection` (on-device, free)
- **Validation**: CIN front (name, DOB, place of birth, CIN number) + CIN back (sex) + selfie vs CIN face comparison
- **Auto-verify**: if all OCR fields present + name matches profile + face score > 0.65 → instantly `verified`
- **Auto-reject**: if any check fails → `rejected` with clear error messages (no manual review)
- **Privacy**: imgbb uploads with 24h expiration. After auto-verify, DB URLs NULLed via existing DELETE endpoint.
- **DB table**: `verification_attempts` stores results, `users.id_verification_result` tracks status
- **Status values**: `null` (never submitted) | `'verified'` | `'rejected'` (no more `'pending'`)

### Business Subscription
- **Price**: Rs 2,500/month via MonCash
- **Grace period**: 7 days after expiry with daily reminders
- **Auto-demotion**: if not renewed within grace → tier demoted to Verified
- **DB table**: `seller_subscriptions` tracks active subscriptions
- **Demotion check**: on login, product create, payout request, seller dashboard

### Verification + Subscription New Tables
```sql
verification_attempts (id, user_id, status, id_front_url, id_back_url, selfie_url, ocr_result, face_match_score, rejection_reason, created_at, verified_at)
seller_subscriptions (id, seller_id, status, started_at, expires_at, last_payment_at, grace_period_days, created_at, updated_at)
users.id_verification_result: 'pending' | 'verified' | 'rejected'
```

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

### Escrow
- **POST /api/orders/:id/escrow/release** — Bearer (buyer only). Releases held funds to seller after confirmed exchange. Credits seller_balances + pays platform commission.
- **POST /api/orders/:id/escrow/refund** — Bearer (buyer or admin). Refunds held funds to buyer via MonCash payout. Restores stock.
- **GET /api/orders/:id/escrow** — Bearer. Returns escrow status for each seller in the order.

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

### Verification
- **POST /api/verification/submit** — Bearer, body `{idFrontUrl, idBackUrl, selfieUrl, ocrResult, faceMatchScore}` → `{attempt}`
- **GET /api/verification/status** — Bearer → `{status, attempt}`
- **DELETE /api/verification/images/:id** — Bearer. Deletes stored images after verification.

### Subscriptions
- **POST /api/subscriptions/create** — Bearer → `{paymentUrl}`
- **GET /api/subscriptions/current** — Bearer → `{subscription}`
- **POST /api/subscriptions/renew** — Bearer → `{paymentUrl}`
- **POST /api/subscriptions/webhook** — No auth. Handles MonCash webhook for subscription payments.
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
### ✅ Completed (as of 2026-06-29)
1. ~~**Multi-image listings**~~ — AddListing + EditListing support up to 8 images with imgbb upload.
2. ~~**Order summary at checkout**~~ — Full item list with thumbnails, names, seller, qty, price shown before Pay button.
3. ~~**Masonry fix across all grids**~~ — ExploreScreen, MeScreen, StorefrontScreen all use `cover` + `DEFAULT_IMG_H`.
7. ~~**Duplicate conversation bug**~~ — StorefrontScreen checks existing conversations before creating new.

### 🔴 Phase 0: Emergency Fixes — ALL DONE ✅
1. ~~`cleanupLegacyData()` wipes ALL products, orders, reviews on every server restart~~ — REMOVED (commented out)
2. ~~Webhook `processed_events` INSERT outside transaction~~ — Moved inside transaction (server.js:2896)
3. ~~Meetup proposal notification goes to wrong party~~ — Fixed: notifies the OTHER party (server.js:1694)
4. ~~Promo discount recorded but buyer charged full amount~~ — Fixed: discount applied to `finalTotal` (server.js:1560)
5. ~~Stock decremented before payment — ghost inventory on failed payments~~ — Fixed: stock now decremented in payment.completed webhook with FOR UPDATE locking (server.js:2904-2921)
6. ~~`complete` endpoint requires `status === 'delivered'`~~ — Fixed: accepts `paid` for meetup orders
7. ~~Feed snap fix reverted~~ — Fixed: `decelerationRate="fast"` + `disableIntervalMomentum={true}` + `getItemLayout`. Removed programmatic `scrollToOffset` in `onScrollEndDrag` that was fighting native snap.

### ✅ Phase 1-6: Meetup Escrow + QR System — DONE
- Phase 1: Escrow system (order_escrow table, modified webhook, pay-status polling)
- Phase 2: State machine (meetup states, FOR UPDATE locking, node-cron timeouts)
- Phase 3: MeetupScreen (map, GPS proximity, "I'm here" check-in, expo-location + react-native-maps)
- Phase 4: QR code (separate QR_SECRET, generation, scanning, 8-digit fallback)
- Phase 5: Emergency exits (extend +30m, cancel, emergency exit)
- Phase 6: Multi-seller meetups — Deferred (per-seller escrow tracking in place, but UI not built)

### ✅ Phase 7: Feed Algorithm — DONE
- `feed_events` table, personalized scoring (CTE-based), like/relevant/not_relevant buttons wired
- Tabs: "New" first, "For You" second

### ✅ Phase 8: Verification Improvements — DONE
- Auto-reject (no pending state), human-readable error messages, imgbb image deletion + DB NULL

### 🟢 Phase 9-10: Push Notifications + Dispute Resolution — DEFERRED
- Phase 10 hybrid dispute: auto-resolve simple cases (timeout → refund, QR scanned → release), admin panel later

### Still Open (Medium Priority)
4. **Image sharing in chat** — prevents off-app WhatsApp exfiltration
5. **Wishlist thumbnails** — text-only list, needs 40x40 thumbnails + stock indicator
6. **Delivery estimate on orders** — buyers need "when should I expect this?" answered
8. Hardcoded `paddingTop: SPACING.xl + 40` in CartScreen, ChatScreen
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

## Session 6 — 2026-06-28 (ID Verification + Subscription + Inbox Redesign)

### Packages Installed
- `expo-camera` — live camera for CIN capture + selfie
- `@react-native-ml-kit/text-recognition` — on-device OCR (Haitian CIN)
- `@react-native-ml-kit/face-detection` — on-device face detection for selfie↔CIN comparison

### DB Schema Added
- `verification_attempts` table — stores CIN front/back, selfie, OCR results, face match score
- `seller_subscriptions` table — tracks monthly business subscriptions with status + expiry
- `users.id_verification_result` column — 'pending' | 'verified' | 'rejected'

### New Screens (in progress)
- `VerificationScreen.tsx` — CIN front+back capture, selfie, OCR validation, face match
- `BusinessSubscriptionScreen.tsx` — Rs 2,500/mo MonCash payment, renewal flow

### Inbox Redesign (in progress)
- `InboxScreen.tsx` refactored with Messages + Notifications tabs (Instagram-style)
- `NotificationsScreen.tsx` deleted — merged into InboxScreen notifications tab
- Tab badge shows unread notification count

---

## Session 7 — 2026-06-29 (Architecture Overhaul: Escrow, Feed, Verification, CI/CD)

### Context
User tested the Lexi Tester account on physical device (EAS build). Identified 5 major work items. Deep analysis with multiple research agents. Logic audit of entire system found 35 P0 findings. Full architecture designed with MonCashConnect deep dive.

### Completed This Session
1. **GitHub Actions CI/CD** — `.github/workflows/build-android.yml` — builds APK on Ubuntu runners (no EAS queue). Triggered on push to main + manual dispatch.
2. **MonCashConnect deep dive** — Documented all API capabilities, limitations, gaps.
3. **Full system architecture designed** — Escrow + Meetup + QR + Emergency exits + Feed algorithm + Verification improvements.

### MonCashConnect Deep Dive
- **Base URL:** `https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1` (or `https://api.moncashconnect.ht/v1`)
- **Auth:** Bearer token (`MCC_KEY` env var, `sk_proj_` prefix)
- **Endpoints used:** `pay-create`, `external-payout-create`, `pay-balance`
- **Endpoints available but unused:** `pay-status` (GET), `payout-create` (newer name)
- **Webhook:** HMAC-SHA256 via `x-mcc-signature` + `x-mcc-timestamp` headers, 300s anti-replay window
- **Pricing:** 0% MonCashConnect commission, 2.9% deposit fee (Digicel), 5% cashout fee

#### What MonCashConnect Supports
| Feature | Supported |
|---------|-----------|
| Create payment (pay-create) | ✅ |
| Check payment status (pay-status) | ✅ (not used in code) |
| Create payout (payout-create) | ✅ |
| Balance check (pay-balance) | ✅ |
| Refunds | ❌ No refund API |
| Pre-authorization / Hold | ❌ Money moves immediately |
| Cancel | ❌ |
| Partial capture | ❌ |

#### Key Insight: Escrow via Bookkeeping
MonCashConnect has no escrow support. But the platform already holds all money in its merchant balance. `seller_balances` is a **ledger entry** — real money doesn't move until seller requests payout. Escrow = simply NOT crediting `seller_balances` until meetup confirmation. Refund = send a NEW payout from platform to buyer.

#### Code Gaps Found
- `external-payout-create` is deprecated → migrate to `payout-create` (field: `receiver` → `moncashNumber`)
- `pay-status` never called as webhook fallback
- Subscription webhook has raw body bug (may skip HMAC verification)
- Subscription webhook has no idempotency check (no `processed_events` insert)
- Commission payout fires synchronously in webhook handler — can delay response

### 35 P0 Findings (Logic Audit)

#### Critical Bugs (Existing Code)
| # | Issue | Location | Fix |
|---|-------|----------|-----|
| P0-22 | `cleanupLegacyData()` wipes ALL products, orders, reviews on EVERY server restart | server.js:374-401 | Remove or gate behind admin flag |
| P0-3 | `processed_events` INSERT outside DB transaction — failed tx = permanent data loss | server.js:2178-2179 | Move inside transaction |
| P0-32 | Meetup proposal notification goes to wrong party (seller never notified) | server.js:1555 | Fix notification logic |
| P0-6 | Promo discount recorded but buyer charged full amount | server.js:1428-1447 | Apply discount to total before order INSERT |
| P0-33 | Stock decremented before payment — ghost inventory if webhook missed | server.js:1438 | Add stock restore on timeout |
| P0-29 | `complete` endpoint requires `status === 'delivered'` — meetup orders stuck | server.js:1595 | Add meetup completion path |

#### Design Flaws
| # | Issue | Fix |
|---|-------|-----|
| P0-10 | State machine `pending→processing→shipped→delivered` incompatible with meetup | Add meetup-specific states |
| P0-13 | Buyer can't cancel after payment (only on `pending`) | Add cancel window for meetup |
| P0-14 | Multi-seller order has ONE status — can't track per-seller meetup | Per-seller escrow table |
| P0-16 | Multi-seller = N separate MonCash payments = terrible UX | Keep single payment, split internally |

#### Missing Features
| # | Issue | Fix |
|---|-------|-----|
| P0-7 | No FOR UPDATE locking — race conditions on state transitions | Add row locking |
| P0-8 | No timeout/scheduler in codebase | Add node-cron |
| P0-17/18 | Feed buttons not wired, personalized endpoint doesn't exist | Build feed_events + scoring |
| P0-21 | No QR code system exists | Build from scratch |
| P0-24 | No GPS proximity validation on server | Build proximity endpoint |
| P0-26 | Dispute system is write-only — no resolution flow | Build dispute resolution |
| P0-30 | No push notification infra (FCM/APNs) | Add expo-notifications push |
| P0-34 | No meetup cancellation/reschedule mechanism | Build emergency exits |

#### Security Issues
| # | Issue | Fix |
|---|-------|-----|
| P0-19 | No rate limiting on engagement actions | Add rate limits |
| P0-23 | Shared JWT secret for auth + QR tokens | Use separate QR signing secret |

#### Technical Debt
| # | Issue | Fix |
|---|-------|-----|
| P0-2 | Commission auto-payout fires immediately — must also be delayed | Delay until meetup completes |
| P0-4 | Commission payout has no retry queue | Add retry with backoff |
| P0-5 | Subscription webhook races with main webhook | Check reference prefix |
| P0-12 | Orders stuck in `processing` forever (no timeout) | Add auto-cancel |
| P0-35 | Feed snap fix reverted | Re-apply fix |

### Emergency Scenario Analysis
| Scenario | Solution |
|----------|----------|
| Phone dies mid-QR | Pre-generated QR token works offline 60 min. Manual 8-digit fallback. |
| Medical emergency | Emergency Exit button (red, always visible) → freeze + 48h resolution, no penalty |
| Hostile meetup | Panic button (swipe down 3x) → auto-block + emergency services, no penalty |
| No-show (either party) | 90-min timeout → auto-refund. Reliability strike for no-show party. |
| Both phones die / power outage | Server-side 90-min timeout → full refund |
| QR timer pressure | Timer INVISIBLE during exchange. Only shows at 10-min warning. Extension available. |
| GPS spoofing | QR token includes GPS hash. Cell tower as secondary. GPS not sole gate. |
| Can't scan QR (cracked screen, sunlight) | Manual 8-digit code entry as fallback |

### Planned Architecture: Escrow + Meetup + QR System

#### New DB Tables
```sql
CREATE TABLE order_escrow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  seller_id UUID REFERENCES users(id),
  gross_amount DECIMAL(10,2),
  commission_amount DECIMAL(10,2),
  net_amount DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'held', -- held | released | refunded
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMP,
  UNIQUE(order_id, seller_id)
);

CREATE TABLE meetup_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  user_id UUID REFERENCES users(id),
  role VARCHAR(10), -- 'buyer' or 'seller'
  lat DECIMAL(10,7),
  lng DECIMAL(10,7),
  checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  qr_token VARCHAR(255),
  qr_scanned BOOLEAN DEFAULT false,
  UNIQUE(order_id, user_id)
);
```

#### New Order States for Meetup
```
pending → paid → meetup_scheduled → meetup_in_progress → exchange_confirmed → completed
                                          ↓                    ↓
                                    meetup_expired      meetup_disputed
                                          ↓                    ↓
                                    full_refund          admin_review
                                          ↓
                                    emergency_exit → 48h_resolution
```

#### Modified Payment Webhook Flow
```
payment.completed:
  1. Mark order as 'paid'
  2. For each seller in order_items:
     - INSERT INTO order_escrow (gross, commission, net, status='held')
     - Do NOT credit seller_balances yet
     - Do NOT auto-payout commission yet
  3. Log to platform_revenue (for accounting only)

exchange_confirmed (QR scanned):
  1. UPDATE order_escrow SET status='released', released_at=now()
  2. Credit seller_balances with net amount
  3. Auto-payout commission to PLATFORM_PHONE
  4. Notify seller

dispute/timeout:
  1. order_escrow stays 'held'
  2. Admin reviews
  3. Buyer wins → order_escrow → 'refunded' → send payout to buyer
  4. Seller wins → order_escrow → 'released' → credit seller
```

#### Meetup Flow (Step by Step)
1. Buyer places order → pays MonCash → money in merchant balance (NOT credited to seller)
2. Buyer and seller arrange meetup via chat
3. Both tap "I'm heading there" → QR code pre-generated (signed JWT, works offline)
4. At location: both tap "I'm here" → GPS proximity check (< 150m)
5. If proximity confirmed → QR code activates (30 min scan window)
6. Seller scans buyer's QR → server validates → order marked "exchange confirmed"
7. Buyer sees: "Did you receive your item?" → "Yes" → money released to seller
8. If "No" → dispute → money held → admin resolution
9. If nobody confirms within 90 min → auto-refund to buyer

#### Emergency Exit Hierarchy
| Button | When | Effect | Penalty |
|--------|------|--------|---------|
| Extend (blue) | Any time | +30 min | None |
| Leave Meetup (yellow) | Any time | Reschedule | Strike after 3 uses |
| Partner Unresponsive | 15 min no activity | Auto-expire | Strike for unresponsive party |
| Emergency Exit (red) | Always visible | Freeze + 48h resolution | Never any penalty |
| Panic (hidden, swipe 3x) | Always | Emergency + auto-block | Never, admin review |

#### QR Code Design
- Signed JWT: `{orderId, buyerId, sellerId, issuedAt, expiresAt, nonce, gpsHash}`
- Separate signing secret from JWT_SECRET (use QR_SECRET env var)
- Single-use, 30 min expiry
- Manual 8-digit code fallback
- Works offline (pre-generated when both confirm "heading there")

#### Multi-Seller Meetup
- Single MonCash payment (no split — UX preservation)
- `order_escrow` tracks per-seller-per-order escrow status
- Each seller's portion released independently when their meetup completes
- Buyer meets sellers separately if multi-seller order

### Planned Architecture: Feed Algorithm

#### New DB Table
```sql
CREATE TABLE feed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  event_type VARCHAR(20) NOT NULL, -- 'view', 'like', 'unlike', 'relevant', 'not_relevant', 'save'
  duration_ms INTEGER, -- dwell time in ms (for 'view' events)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, product_id, event_type)
);
```

#### Scoring Formula
```
score = 
  (+3.0) if seller is followed
  (+2.0) if product is wishlisted by user
  (+2.0) if user liked this product
  (+1.5) if user purchased from this seller before
  (+1.5) if user marked relevant
  (+1.0) if same category as past purchases
  (+1.0) if posted in last 24h
  (+0.5) if seller has avg rating > 4.0
  (-3.0) if user marked NOT relevant
  (-0.5 × dwell_seconds) if dwell < 3s (skimmed past = negative signal)
```

#### Wire Up Existing Buttons
- Heart button (FeedScreen.tsx:317-319) → `POST /api/feed/like` (toggle)
- Relevant (FeedScreen.tsx:616-618) → `POST /api/feed/feedback { type: 'relevant' }`
- Not relevant (FeedScreen.tsx:620-622) → `POST /api/feed/feedback { type: 'not_relevant' }`
- Track dwell time via `onViewableItemsChanged` on FlatList

#### Cold Start
- New users with no history → default to chronological (newest first)
- Gradually personalize as engagement data accumulates

#### Anti-Gaming
- Rate limit: max 50 feed_events per user per hour
- One like per product per user (toggle)
- Weight decreases with repeated actions from same account

### Planned Architecture: Verification Improvements

#### Auto-Reject (No Manual Review)
- All 4 checks pass → `verified` instantly, badge granted
- Any check fails → `rejected` with clear error messages:
  - "Name doesn't match your profile — update your name in Settings"
  - "CIN number not recognized"
  - "Date of birth not found on card"
  - "No face detected in selfie"
- No `pending` state — fully automatic
- Show rejection reasons on VerificationScreen

#### Image Cleanup
- imgbb uploads with `expiration` parameter set to 86400 (24 hours)
- After auto-verify: call existing `DELETE /api/verification/images/:id` to NULL DB references
- imgbb images self-delete after 24h

#### Face Detection Improvement
- Current: only checks IF a face exists (score > 0.65 = pass)
- Planned: extract face landmarks from both CIN photo and selfie, compare geometry
- Uses existing `@react-native-ml-kit/face-detection` contour detection
- Score threshold: 0.65 for face similarity (not just presence)

### Planned Architecture: Push Notifications
- Add `expo-notifications` push token registration
- Store push tokens in `users` table
- Send push via Expo push notification service for:
  - Meetup reminders (30 min before window opens)
  - QR scan confirmation
  - Payment released
  - Dispute updates
  - New messages

### Implementation Plan (10 Phases)
| Phase | What | Est. Time |
|-------|------|-----------|
| Phase 0 | Emergency fixes (cleanupLegacyData, webhook tx bug, notification bug, promo bug, stock restore, complete endpoint, feed snap) | 1-2 days |
| Phase 1 | Escrow system (order_escrow table, modified webhook, pay-status polling) | 2-3 days |
| Phase 2 | State machine (meetup states, FOR UPDATE locking, node-cron timeouts) | 2-3 days |
| Phase 3 | Meetup screen (map, GPS proximity, "I'm here" check-in, expo-location + react-native-maps) | 3-4 days |
| Phase 4 | QR code (separate signing secret, generation, scanning, 8-digit fallback) | 3-4 days |
| Phase 5 | Emergency exits (extend, leave, unresponsive, emergency, panic button) | 2-3 days |
| Phase 6 | Multi-seller meetups (per-seller escrow, separate tracking) | 2-3 days |
| Phase 7 | Feed algorithm (feed_events table, scoring, wire buttons, rate limiting) | 3-4 days |
| Phase 8 | Verification improvements (auto-reject, image cleanup, error messages, face comparison) | 1-2 days |
| Phase 9 | Push notifications (FCM/APNs via expo-notifications) | 2-3 days |
| Phase 10 | Dispute resolution (admin flow, refund via payout, escrow freeze) | 2-3 days |

### New Dependencies Needed
- `expo-location` — GPS coordinates for proximity checks (installed)
- `react-native-maps` — native map rendering (Apple Maps / Google Maps) (installed)
- `node-cron` — scheduled tasks (timeout auto-refund) (installed)
- `@expo/image-manipulator` — already installed (imgbb upload resize)
- `@expo/ngrok` — dev tunneling (installed)

### Implementation Plan (10 Phases)
| Phase | What | Status |
|-------|------|--------|
| Phase 0 | Emergency fixes (cleanupLegacyData, webhook tx bug, notification bug, promo bug, stock fix, complete endpoint, feed snap) | ✅ DONE |
| Phase 1 | Escrow system (order_escrow table, modified webhook, pay-status polling) | ✅ DONE |
| Phase 2 | State machine (meetup states, FOR UPDATE locking, node-cron timeouts) | ✅ DONE |
| Phase 3 | Meetup screen (map, GPS proximity, "I'm here" check-in, expo-location + react-native-maps) | ✅ DONE |
| Phase 4 | QR code (separate signing secret, generation, scanning, 8-digit fallback) | ✅ DONE |
| Phase 5 | Emergency exits (extend, leave, unresponsive, emergency, panic button) | ✅ DONE |
| Phase 6 | Multi-seller meetups (per-seller escrow, separate tracking) | 🔲 Deferred (per-seller escrow in place, UI not built) |
| Phase 7 | Feed algorithm (feed_events table, scoring, wire buttons, rate limiting) | ✅ DONE |
| Phase 8 | Verification improvements (auto-reject, image cleanup, error messages) | ✅ DONE |
| Phase 9 | Push notifications (FCM/APNs via expo-notifications) | 🔲 Deferred |
| Phase 10 | Dispute resolution (admin flow, refund via payout, escrow freeze) | 🔲 Deferred |

---

## Session 8 — 2026-06-29 (Implementation: Phases 2-8 + Web Compat + Dev Setup)

### Context
Implemented all planned features from Session 7's architecture. Also fixed web compatibility for Expo Go and set up local dev environment.

### Commits (this session)
- `429e30b` — web compatibility: conditional react-native-maps import, expo-clipboard, SQL comment fix
- `66792a3` — conditional native imports for web compat: expo-location, expo-camera, ML kit
- `dcbd1ac` — lazy-load MeetupScreen to prevent react-native-maps from crashing web bundle
- `a19c4f3` — retry payment unique referenceId + graceful non-JSON response handling
- `d7485c4` — dev mode points native app to local server instead of production
- `2d5c874` — move stock decrement from order creation to payment webhook (P0-33 ghost inventory fix)

### What Was Built
1. **Phase 2: State Machine** — `node-cron` for timeout auto-refund (90-min window, every 5 min), `SELECT ... FOR UPDATE` on complete/seller/escrow endpoints, meetup check-in + QR generation, QR scan, `haversineDistance()` helper, blocked seller from advancing meetup orders via status endpoint.

2. **Phase 3+4: MeetupScreen** — Real map with `react-native-maps` (native) / static fallback (web), GPS tracking via `expo-location` (conditional import for web), "I'm here" check-in, QR code generation for buyer (modal), QR scan/paste for seller, confirm receipt → release escrow. Full API: `meetupCheckin`, `meetupScan`, `getMeetupStatus`, `releaseEscrow`, `refundEscrow`, `getEscrowStatus`.

3. **Phase 5: Emergency Exits** — `PUT /api/orders/:id/meetup/extend` (+30 min), 3-button emergency row: Extend +30m (blue), Cancel (coral), Emergency Exit (red).

4. **Phase 7: Feed Algorithm** — `feed_events` table, `POST /api/feed/event` rate-limited (50/hour), personalized scoring with CTE-based query (followed: +3, wishlisted: +2, liked: +2, past purchase: +1.5, relevant: +1.5, category: +1, recency: +1, rating: +0.5, not_relevant: -3), heart button wired, relevant/not_relevant in more menu, dwell time tracking via `onViewableItemsChanged`.

5. **Phase 8: Verification** — Auto-reject (no `pending` state), human-readable error messages, placeOfBirth + sex checks, imgbb image deletion + DB NULL after verify, rejection screen with error list + retry button.

6. **Web Compatibility** — `react-native-maps` conditionally imported with `require()` + web fallback UI, `expo-location` conditionally imported, `expo-camera`/ML kit conditionally imported, `expo-clipboard` installed, `MeetupScreen` wrapped in `React.lazy()`, SQL `//` → `--` comment fix, `Suspense` wrapper around app.

7. **Feed Tab Swap** — Default tab changed from `'forYou'` to `'new'`, tab buttons reordered: "New" leftmost, "For You" rightmost.

8. **Retry Payment Fix** — Unique `referenceId` per retry attempt (`${orderId}_retry_${timestamp}`), graceful non-JSON response handling in `request()`.

9. **Dev Environment** — Expo Go 56.0.0 APK installed on phone, LAN mode working (phone IS the WiFi hotspot, laptop IP: `10.130.195.105`), `api.ts` updated with `__DEV__` detection to point native app to local server.

10. **P0-33 Stock Fix** — Stock now decremented only in payment.completed webhook (not at order creation) with `SELECT ... FOR UPDATE` locking. Removed stock restore from buyer cancel and payment.failed webhook. Escrow refund and meetup timeout still restore stock (correctly, since payment DID succeed for those).

### Known Issues
- **Expo Go retry payment 400**: Phone may not reach local server (backend logs showed no incoming requests). Root cause likely: phone still hitting production or Android cleartext HTTP blocking. `__DEV__` detection was added but untested.
- **Production Render cold start**: Returns HTML on first request, causes JSON parse errors. Fixed with try/catch in `request()`.

### Phase 0 Status (ALL DONE)
| # | Fix | Location |
|---|-----|----------|
| 1 | `cleanupLegacyData()` removed | server.js:3631 |
| 2 | `processed_events` INSERT inside transaction | server.js:2896 |
| 3 | Meetup notification → other party | server.js:1694 |
| 4 | Promo discount applied to `finalTotal` | server.js:1560 |
| 5 | Stock decremented in webhook, not order creation | server.js:2904-2921 |
| 6 | `complete` accepts `paid` for meetup | server.js:2000 |
| 7 | `decelerationRate={0}` + `disableIntervalMomentum` | FeedScreen.tsx:516 |

### Next Steps
1. **Phase 9: Push Notifications** — expo-notifications + FCM/APNs
2. **Phase 10: Dispute Resolution** — Hybrid auto-resolve + admin panel
3. **Phase 6: Multi-seller meetups** — Per-seller escrow tracking UI
4. **Image sharing in chat** — Prevents WhatsApp exfiltration
5. **Deploy to production** — Push fixes, verify Render auto-deploy

---

## Session 9 — 2026-06-30 (Nearby Market + Dev Fixes)

### Context
User tested app on physical device. Multiple issues found: retry payment 400, MonCash returnUrl HTTPS, ExploreScreen key warning, Nearby Market not working.

### Completed This Session
1. **P0-33 Stock Fix** — Moved stock decrement from order creation to payment.completed webhook with `SELECT ... FOR UPDATE` locking. Removed stock restore from buyer cancel and payment.failed webhook.
2. **Retry Payment 400 Fix** — `request()` helper unconditionally set `Content-Type: application/json` even for POST requests with no body. Express.json() tried to parse empty body → 400. Fixed by only setting header when `options.body` exists.
3. **MonCash returnUrl HTTPS Fix** — `req.get('host')` returned `localhost:3001` locally, making invalid `https://localhost:3001` URLs. Now uses `PRODUCTION_URL` env var (defaults to `https://maurmaket.onrender.com`).
4. **ExploreScreen Key Fix** — VirtualizedList key warning from masonry grid. Moved `key` from inside `renderCard` to `React.Fragment` wrapper in `.map()`.
5. **Nearby Market Build** — Full Snapchat-style map screen with:
   - `seller_locations` table + haversine spatial query
   - `GET /api/sellers/nearby` + `PUT /api/seller/location`
   - Full-screen dark-themed react-native-maps with avatar markers
   - Tier-colored marker rings (green=verified, gold=business)
   - Tap marker → preview card with Visit button
   - Bottom sheet with filter chips + horizontal seller cards
   - My Location + Set My Location floating buttons
   - Web fallback with seller list
6. **Nearby Market Bug Fixes** — Route order (`/nearby` before `/:id`), haversine `LEAST/GREATEST` NaN guard, parameter count mismatch, lazy-load MapScreen, preview card touch-blocking overlay → non-capturing Pressable
7. **Nearby Market Polish** — LinearGradient top bar, preview card fade/scale animation, image error handling (failedImages), pan gesture on sheet handle, empty state CTA for sellers, smooth first-load map animation, z-index layering

### Commits
- `2d5c874` — move stock decrement from order creation to payment webhook
- `a19c4f3` — retry payment unique referenceId (earlier session)
- `2a904c7` — Content-Type only when body exists
- `6bf9073` — MonCash returnUrl uses production HTTPS
- `b079a68` — ExploreScreen key fix
- `1f38e10` — Nearby Market initial build
- `0674fb1` — Route order, haversine guard, lazy-load, preview card fix
- `cb78772` — Design polish: gradient, animation, error handling, pan gesture

### Known Issues
- Production Render still running old code (referenceId 409 on retry) — will auto-deploy on next push
- No sellers have set location yet — need to test with real seller accounts

---

## Todo History

> **Rule:** When a todo list is completed, add it here with a ✅ checkmark so future sessions don't redo completed work.

### ✅ Phase 0: Emergency Fixes
- [x] Remove `cleanupLegacyData()` — was wiping all data on restart
- [x] Move `processed_events` INSERT inside transaction
- [x] Fix meetup proposal notification → notify OTHER party
- [x] Apply promo discount to order total (not just record it)
- [x] Move stock decrement to payment webhook (P0-33)
- [x] `complete` endpoint accepts `paid` for meetup orders
- [x] Feed snap fix (`decelerationRate={0}`)

### ✅ Phase 1-5: Escrow + Meetup + QR + Emergency
- [x] Escrow system (order_escrow table, modified webhook)
- [x] State machine (FOR UPDATE locking, node-cron timeouts)
- [x] MeetupScreen (react-native-maps, GPS proximity, check-in)
- [x] QR code (generation, scanning, 8-digit fallback)
- [x] Emergency exits (extend +30m, cancel, emergency exit)

### ✅ Phase 7: Feed Algorithm
- [x] `feed_events` table + personalized scoring (CTE-based)
- [x] Heart button wired (like/unlike toggle)
- [x] Relevant/not_relevant in more menu
- [x] Dwell time tracking via `onViewableItemsChanged`
- [x] Tab swap ("New" first, "For You" second)

### ✅ Phase 8: Verification Improvements
- [x] Auto-reject (no pending state)
- [x] Human-readable error messages
- [x] imgbb image deletion + DB NULL after verify
- [x] placeOfBirth + sex checks

### ✅ Dev/Bug Fixes — Session 9
- [x] Fix retry payment 400 (Content-Type on empty body)
- [x] Fix MonCash returnUrl HTTPS (use production URL)
- [x] Fix ExploreScreen VirtualizedList key warning
- [x] Nearby Market: Build full Snapchat-style map screen
- [x] Nearby Market: Fix route order (`/nearby` before `/:id`)
- [x] Nearby Market: Haversine NaN guard (`LEAST/GREATEST`)
- [x] Nearby Market: Lazy-load MapScreen for web compat
- [x] Nearby Market: Fix preview card touch-blocking overlay
- [x] Nearby Market: Design polish (gradient, animations, error handling)

### ✅ Session 10: Map Fix + Production Deploy
- [x] Fix MapScreen: static imports (commits 8c65d40, 6a896c5) — tiles still blank, needs UrlTile
- [x] Fix MapScreen: UrlTile + CartoDB dark tiles (commit bef7213) — still blank, Google SDK surface broken in Expo Go
- [x] Fix MapScreen: WebView + Leaflet approach (commit 5ab021b) — bypass Google Maps SDK entirely
- [x] Snap Map-style markers v1 (commit cbbd121) — CSS border rings
- [x] Mockup-matched markers (commit d3461b1) — gradient padding rings, tier-varying sizes
- [x] Deployed to production (commit 8b59f97) — all session 9+ fixes live

### Session 11: Sale Price + Promo Code Management (in progress)
- [x] DB migration: sale_price, sale_starts_at, sale_ends_at columns
- [x] Backend: sale price computed fields + validation + /sale endpoint
- [x] Frontend: Product type + SalePriceTag component
- [x] Seller UI: AddListing/EditListing sale toggle
- [x] Buyer UI: 10 price display locations updated
- [x] Backend: promo toggle endpoint + API function
- [x] PromoManagementScreen + navigation + SettingsScreen entry
- [x] i18n strings (sale + promo)
- [ ] Commit, push, deploy

### 🔲 Remaining Features (deferred)
- [ ] Phase 9: Push notifications (expo-notifications + FCM/APNs)
- [ ] Phase 10: Dispute resolution (hybrid auto-resolve + admin)
- [ ] Image sharing in chat
- [ ] Wishlist thumbnails (40x40 + stock indicator)
- [ ] Delivery estimate on orders
- [ ] Phase 6: Multi-seller meetups (per-seller escrow UI)
