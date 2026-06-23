# MaurMaket — Project Context for AI Agents

## Git Protocol
- **Always push after major changes**: After committing any significant feature, bug fix, or refactor, run `git push` immediately. Do not batch pushes — push each meaningful change. The user relies on remote being up to date.

## Overview
Haitian marketplace (e-commerce) SPA connecting buyers and sellers. Instagram-style product feed, cart with meetup/delivery options, MonCash payment integration, seller dashboard with balance/payout system, orders tab with meetup location sharing via Leaflet maps.

## Tech Stack
- **Frontend:** Vanilla JS SPA (no framework), Vite 6 build
- **Backend:** Express.js 4 (ESM, `"type": "module"`)
- **Database:** PostgreSQL (Neon serverless via `pg` Pool)
- **Payments:** MonCashConnect API (Haitian mobile money)
- **Maps:** Leaflet.js + OpenStreetMap tiles + Nominatim geocoding
- **Uploads:** Multer (local disk in `./uploads/`)
- **Deployment:** Fly.io (Docker multi-stage), GitHub Actions CI/CD
- **Styling:** Custom CSS with CSS custom properties (dark theme)
- **Icons:** Tabler Icons (`ti-*` via CDN)
- **Fonts:** Syne (headings/logo), Inter (body) — Google Fonts

## Project Structure
```
├── server.js              # Express backend (~1500 lines)
├── index.html             # SPA entry point
├── vite.config.js         # Vite: port 5173, proxy /api to :3001
├── package.json           # deps: cors, dotenv, express, leaflet, multer, pg, bcrypt, jsonwebtoken
├── Dockerfile             # Multi-stage: build + production
├── fly.toml               # Fly.io config (iad region, port 3001)
├── implementation_plan.md # Full growth framework with all 21 features mapped
├── src/
│   ├── api.js             # Frontend API client (fetch wrapper)
│   ├── main.js            # SPA router + shell rendering
│   ├── store.js           # Reactive state store (user, token, cart)
│   ├── style.css          # All CSS (~503 lines)
│   ├── toast.js           # Toast notification system
│   └── views/
│       ├── Home.js        # Instagram feed (scroll-snap, infinite scroll)
│       ├── Explore.js     # Masonry grid + search + filters
│       ├── Login.js       # Sign in form
│       ├── Signup.js      # Create account (role hardcoded to 'buyer')
│       ├── ProductDetail.js # Full-screen product view + reviews + wishlist
│       ├── Cart.js        # Cart + checkout (delivery overlay + MonCash modal + promo)
│       ├── Orders.js      # Buying/Selling tabs + meetup map flow + timeline
│       ├── Profile.js     # Profile info + recent orders + wishlist section
│       ├── Settings.js    # Edit profile + change password + saved addresses
│       ├── Seller.js      # Dashboard: Products, Orders, Balance, +Add
│       └── Storefront.js  # Public seller profile + products + stats
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

### `orders` (key table)
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK, gen_random_uuid() |
| buyer_id | UUID | FK → users.id |
| total_amount | DECIMAL(10,2) | |
| status | TEXT | pending/paid/processing/shipped/delivered/cancelled/completed |
| moncash_reference | TEXT | nullable |
| delivery_method | VARCHAR(20) | default 'meetup', or 'delivery' |
| delivery_name | TEXT | nullable |
| delivery_phone | TEXT | nullable |
| delivery_address | TEXT | nullable |
| delivery_city | TEXT | nullable |
| delivery_note | TEXT | nullable |
| meetup_lat | DECIMAL(10,7) | nullable |
| meetup_lng | DECIMAL(10,7) | nullable |
| meetup_address | TEXT | nullable |
| meetup_note | TEXT | nullable |
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

### `order_events` (Sprint 1C)
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| order_id | UUID | FK → orders.id |
| event_type | VARCHAR(50) | status_change, meetup_proposed, meetup_confirmed, note_added, payment_received |
| actor_id | UUID | FK → users.id |
| old_value | TEXT | nullable |
| new_value | TEXT | nullable |
| note | TEXT | nullable |
| created_at | TIMESTAMP | |

### `reviews` (Sprint 2A)
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
| created_at / updated_at | TIMESTAMP | |
| UNIQUE(order_id, reviewer_id) | | One review per order per user |

### `wishlists` (Sprint 3A)
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users.id ON DELETE CASCADE |
| product_id | UUID | FK → products.id ON DELETE CASCADE |
| created_at | TIMESTAMP | |
| UNIQUE(user_id, product_id) | | |

### `follows` (Sprint 3B)
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| follower_id | UUID | FK → users.id ON DELETE CASCADE |
| seller_id | UUID | FK → users.id ON DELETE CASCADE |
| created_at | TIMESTAMP | |
| UNIQUE(follower_id, seller_id) | | |

### `reviews` (Sprint 2A)
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
| created_at / updated_at | TIMESTAMP | |
| UNIQUE(order_id, reviewer_id) | | One review per order per user |

### `wishlists` (Sprint 3A)
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users.id ON DELETE CASCADE |
| product_id | UUID | FK → products.id ON DELETE CASCADE |
| created_at | TIMESTAMP | |
| UNIQUE(user_id, product_id) | | |

### `follows` (Sprint 3B)
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| follower_id | UUID | FK → users.id ON DELETE CASCADE |
| seller_id | UUID | FK → users.id ON DELETE CASCADE |
| created_at | TIMESTAMP | |
| UNIQUE(follower_id, seller_id) | | |

### `notifications` (Sprint 3E)
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

### `conversations` (Sprint 3A)
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| order_id | UUID | FK → orders.id, nullable |
| product_id | UUID | FK → products.id, nullable |
| buyer_id | UUID | FK → users.id |
| seller_id | UUID | FK → users.id |
| last_message_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

### `messages` (Sprint 3A)
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| conversation_id | UUID | FK → conversations.id |
| sender_id | UUID | FK → users.id |
| content | TEXT | |
| is_read | BOOLEAN | default false |
| created_at | TIMESTAMP | |

### `promo_codes` (Sprint 4B)
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
| created_at | TIMESTAMP | |

### `promo_uses` (Sprint 4B)
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| promo_id | UUID | FK → promo_codes.id |
| user_id | UUID | FK → users.id |
| order_id | UUID | FK → orders.id |
| discount_amount | DECIMAL(10,2) | |
| created_at | TIMESTAMP | |
| UNIQUE(promo_id, user_id) | | |

### `disputes` (Sprint 5C)
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| order_id | UUID | FK → orders.id |
| raised_by | UUID | FK → users.id |
| reason | VARCHAR(50) | |
| description | TEXT | nullable |
| status | VARCHAR(20) | default 'open' |
| resolution | TEXT | nullable |
| created_at / updated_at | TIMESTAMP | |

### `saved_addresses` (Sprint 4C)
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
| created_at | TIMESTAMP | |

### `seller_balances`
| Column | Type | Notes |
|---|---|---|
| seller_id | UUID | PK, FK → users.id ON DELETE CASCADE |
| balance | DECIMAL(10,2) | default 0 |
| total_earned | DECIMAL(10,2) | default 0 |
| total_paid_out | DECIMAL(10,2) | default 0 |
| updated_at | TIMESTAMP | |

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
| created_at / updated_at | TIMESTAMP | |

## API Endpoints (all under /api)

### Auth
- **POST /api/auth/signup** — `{fullName, email, password, phone}` (no role — hardcoded 'buyer') → `{user, token}`
- **POST /api/auth/login** — `{email, password}` → `{user, token}`
- **GET /api/auth/me** — Bearer → `{user}`
- **PUT /api/auth/profile** — Bearer, body `{fullName, email, phone, bio, avatarUrl}` → `{user}`
- **PUT /api/auth/password** — Bearer, body `{currentPassword, newPassword}` → `{updated: true}`
- **PUT /api/auth/become-seller** — Bearer → `{user}` (role upgraded to 'seller')

### Products
- **GET /api/products** — Query: `category, search (ILIKE), seller, minPrice, maxPrice, sort (price_asc/price_desc/oldest/rating), page (1), limit (20/max 50), personalized` → `{products[], total, page, pages}`
- **GET /api/products/:id** → `{product{..., images[], seller{...}, category}}`
- **POST /api/products** — Bearer+Seller. `{name, description, price, stock, categoryId, images[]}` → `{product}`
- **PUT /api/products/:id** — Bearer+Seller (ownership check)
- **DELETE /api/products/:id** — Bearer+Seller (ownership check)

### Orders
- **GET /api/orders** — Bearer → `{buyerOrders[], sellerOrders[]}`
- **GET /api/orders/:id** — Bearer (buyer or seller only) → `{order{..., items[]}}`
- **POST /api/orders** — Bearer. `{items: [{productId, quantity}], deliveryMethod?, deliveryName?, deliveryPhone?, deliveryAddress?, deliveryCity?, deliveryNote?}` → `{order}`
- **PUT /api/orders/:id/cancel** — Bearer (buyer only). Restocks products.
- **PUT /api/orders/:id/meetup** — Bearer. `{lat, lng, address, note}`.
- **PUT /api/orders/:id/meetup/confirm** — Bearer.
- **PUT /api/orders/:id/complete** — Bearer.
- **GET /api/orders/:id/timeline** — Bearer → `{events[]}`
- **POST /api/orders/:id/reorder** — Bearer → adds items to cart

### Reviews (Sprint 2A)
- **POST /api/reviews** — Bearer (buyer). `{orderId, rating, comment}`
- **PUT /api/reviews/:id** — Bearer (buyer). Edits own review.
- **POST /api/reviews/:id/respond** — Bearer (seller). Responds to review.
- **GET /api/reviews/seller/:sellerId** — Public. Paginated with avg rating.
- **GET /api/reviews/product/:productId** — Public. Reviews for a product's orders.

### Wishlist (Sprint 3A)
- **POST /api/wishlist/:productId** — Bearer. Toggle add/remove. Returns `{wishlisted: bool}`.
- **GET /api/wishlist** — Bearer. User's wishlist with product details.
- **GET /api/wishlist/check/:productId** — Bearer. Check if wishlisted.

### Follows (Sprint 3B)
- **POST /api/follow/:sellerId** — Bearer. Toggle follow/unfollow.
- **GET /api/following** — Bearer. List followed sellers.
- **GET /api/followers/count/:sellerId** — Public. Follower count.

### Seller Storefront
- **GET /api/sellers/:id** — Public. Seller profile with stats (product_count, sales_count, avg_rating, review_count).

### Seller Dashboard
- **GET /api/seller/products** — Bearer+Seller
- **GET /api/seller/orders** — Bearer+Seller
- **PUT /api/seller/orders/:id/status** — Bearer+Seller. `paid→processing→shipped→delivered`
- **GET /api/seller/balance** → `{balance, total_earned, total_paid_out}`
- **GET /api/seller/payouts** — History
- **POST /api/seller/payouts/request** — Bearer+Seller. `{amount}`. Min Rs 50.

### Payments
- **POST /api/payments/create** — Bearer. `{orderId, returnUrl}` → `{paymentUrl}`
- **POST /api/payments/retry/:orderId** — Bearer → `{paymentUrl}`
- **POST /api/payments/webhook** — No auth. HMAC-SHA256 verified.

### Other
- **POST /api/upload** — Bearer + multipart `image` (max 5MB) → `{url}`
- **GET /api/health** → `{status, database, hasMccKey}`
- **GET /api/debug** — Tests MonCashConnect connectivity
- **GET * (catch-all)** — Serves dist/index.html for SPA

## Auth System
- Token is **real JWT** signed with `JWT_SECRET` via `jsonwebtoken`. Payload: `{id, email, role}`.
- Stored in `localStorage` key `mm_token`
- Passwords hashed with **bcrypt** (salt rounds = 10)
- Phone numbers stored **without** `+` prefix internally, displayed with `+509` on frontend.
- `sellerRequired` middleware checks `req.user.role !== 'seller'` → 403

## Order Status Flow
`pending → paid → processing → shipped → delivered → completed`

Seller pushes through `paid→processing→shipped→delivered`. Buyer/seller marks `completed` after meetup.

## Meetup Flow
1. Either party proposes a location via Leaflet map picker (lat/lng/address/note)
2. Other party confirms (cannot confirm own proposal)
3. Either party marks as completed
- Status must be `paid` or `pending` to propose meetup
- Re-confirm is idempotent

## Delivery Flow
- Optional: collected during checkout via delivery form overlay
- `delivery_method` = `'meetup'` or `'delivery'`

## Frontend Architecture

### SPA Routing (main.js)
- Shell: `#shell` wraps `#page` + `#tab-bar`
- Tab routes (bottom nav): home(/), explore(/explore), sell(/seller), orders(/orders), profile(/profile)
- Fullscreen routes (no tab bar): /login, /signup, /product, /payment, /profile/settings, /cart, /store
- `navigate(path, params)` renders view into `#page`

### State Store (store.js)
- State: user, token (mm_token), cart (mm_cart)
- Getters: user, token, cart, isLoggedIn, isSeller, cartCount
- Actions: setUser, logout, addToCart, removeFromCart, updateQuantity, clearCart
- Reactivity: onChange/notify pattern

### API Client (api.js)
- `request()` helper: prepends /api, attaches Bearer token, JSON parse, throws on !ok
- Exports: all CRUD functions for every endpoint above

## Key Observations
1. Auth is real JWT (jsonwebtoken), NOT base64url. `JWT_SECRET` env var is used.
2. Passwords use bcrypt, NOT SHA-256.
3. Phone numbers: stored without `+`, displayed with `+509`
4. No component library — vanilla JS DOM manipulation
5. No TypeScript — plain JavaScript
6. No real-time — only polling (payment return polls + 3s retry)
7. Images served from Express `./uploads/` dir (scaling concern)
8. `components/` directory is empty
9. No form validation library — minimal checks
10. Currency is Haitian Gourde (Rs)
11. DO NOT commit .env with real credentials
12. Full implementation plan in `implementation_plan.md`

---

## Implementation Progress Tracker

> For AI agents picking up this project: scan this section to see what's done and what's next.

### ✅ V1 Complete (commits `f0d9d5c` + `ce55b5e` + `6470bc5`)

| Layer | Feature | Notes |
|-------|---------|-------|
| Layer 0 | Security fixes | sellerRequired fix, signup role hardcoded, bcrypt, JWT signing |
| Sprint 1C | Order Timeline | `order_events` table, logged on all status/meetup/payment events |
| Sprint 4C | Saved Addresses | `saved_addresses` table, Cart.js checkout integration, Settings.js create/list |
| Sprint 4D | Re-order | `POST /api/orders/:id/reorder` endpoint |
| Sprint 4A | Become a Seller | Endpoint + button in Profile (fixed: now issues new JWT with seller role) |
| Sprint 2E | Social Sharing | Web Share API + WhatsApp deep links on ProductDetail + Profile share |
| Sprint 2A | Reviews & Ratings | Full CRUD, seller response, product/seller queries |
| Sprint 2B | Seller Storefronts | `Storefront.js` view, `/api/sellers/:id` endpoint, clickable seller names |
| Sprint 2D | Verified Badges | Computed (4.5+ avg, 10+ reviews, 20+ sales) |
| Sprint 3A | Wishlist / Favorites | Toggle API, heart icon, Profile wishlist section |
| Sprint 3B | Follow Sellers | Toggle API, follower count, follow button on Storefront |
| Sprint 3C | Enhanced Search | Sort dropdown, price min/max, category filter |
| Sprint 3D | Personalized Feed | `optionalAuth` middleware, `personalized=true` param |
| Sprint 3E | Notifications | Full backend + `Notifications.js` view + bell icon + 30s polling |
| Sprint 3A | In-app Messaging | `Messages.js` view + 5s polling + shell badge |
| Sprint 4B | Promo Codes | Backend + Cart.js input + Seller.js create/list section |
| Sprint 3F | Order Updates | Seller notes in timeline + notification |
| Sprint 5A | Seller Analytics | Endpoint + stats grid + top products table in Seller.js |
| Sprint 5B | Inventory Alerts | Low stock check + banner in Seller.js |
| Sprint 5C | Dispute Resolution | Backend + "Report a Problem" button + reason picker in Orders.js |
| Sprint 5D | Admin Panel | Backend middleware + endpoints (no frontend view yet) |

### 🚀 Phase 2: Ecosystem Expansion (`framework_v2.md`)

The next phase focuses on **Scale, Logistics, and Virality**. See `framework_v2.md` for full details.

| Layer | Theme | Key Features |
|-------|-------|-------------|
| Layer 6 | Logistics & Escrow | MonCash escrow hold, delivery partner API, auto-refunds |
| Layer 7 | Enterprise Seller Suite | Product variants (SKUs), bulk CSV import, staff accounts |
| Layer 8 | Social Commerce | Video snippets, curated collections, group buy / make offer |
| Layer 9 | Gamification & Loyalty | MaurMaket Coins, VIP tiers, daily check-in streaks |
| Layer 10 | AI & Automation | Smart image enhancement, auto-categorization, listing translation |
