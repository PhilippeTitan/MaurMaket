# MaurMaket — Project Context for AI Agents

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
├── server.js              # Express backend (~1040 lines)
├── index.html             # SPA entry point
├── vite.config.js         # Vite: port 5173, proxy /api to :3001
├── package.json           # deps: cors, dotenv, express, leaflet, multer, pg
├── Dockerfile             # Multi-stage: build + production
├── fly.toml               # Fly.io config (iad region, port 3001)
├── src/
│   ├── api.js             # Frontend API client (fetch wrapper)
│   ├── main.js            # SPA router + shell rendering
│   ├── store.js           # Reactive state store (user, token, cart)
│   ├── style.css          # All CSS (~483 lines)
│   ├── toast.js           # Toast notification system
│   └── views/
│       ├── Home.js        # Instagram feed (scroll-snap, infinite scroll)
│       ├── Explore.js     # Masonry grid + search + filters
│       ├── Login.js       # Sign in form
│       ├── Signup.js      # Create account (role hardcoded to 'buyer')
│       ├── ProductDetail.js # Full-screen product view
│       ├── Cart.js        # Cart + checkout (delivery overlay + MonCash modal)
│       ├── Orders.js      # Buying/Selling tabs + meetup map flow
│       ├── Profile.js     # Profile info + recent orders + retry/cancel
│       ├── Settings.js    # Edit profile + change password
│       └── Seller.js      # Dashboard: Products, Orders, Balance, +Add
└── uploads/               # Uploaded images (served at /uploads/)
```

## Database Schema (PostgreSQL — auto-migrated at startup)

### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK, gen_random_uuid() |
| full_name | TEXT | NOT NULL |
| email | TEXT | NOT NULL, UNIQUE |
| password_hash | TEXT | SHA-256 hex |
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
| status | TEXT | pending/paid/processing/shipped/delivered/cancelled/completed (CHECK constraint dropped) |
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

### Known Fixes (applied during final stress test)
1. **Delivery fields not stored** — stale server instance; restart fixed it
2. **Cancel returns 404 for non-buyer** — changed to return 403 "Only the buyer can cancel"
3. **Order detail missing `other_party`/`my_role`** — added JOIN query for seller_id, party info, and role
4. **`canAccessOrder` lacked DISTINCT** — added DISTINCT to prevent duplicate rows from LEFT JOIN
5. **Status transitions blocked `pending→processing`** — added `pending: 'processing'` to transition map
6. **`api()`/`raw()` `...opts` override bug in test + app** — `...opts` spread overwrote `headers` losing Content-Type. Fixed by spreading `method`, `headers`, `body` individually.

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
| receiver_phone | VARCHAR(20) | NOT NULL |
| moncash_reference | VARCHAR(150) | nullable |
| error_message | TEXT | nullable |
| created_at / updated_at | TIMESTAMP | |

## API Endpoints (all under /api)

### Auth
- **POST /api/auth/signup** — `{fullName, email, password, phone, role}` → `{user, token}`
- **POST /api/auth/login** — `{email, password}` → `{user, token}`
- **GET /api/auth/me** — Bearer → `{user}`
- **PUT /api/auth/profile** — Bearer, body `{fullName, email, phone, bio, avatarUrl}` → `{user}`
- **PUT /api/auth/password** — Bearer, body `{currentPassword, newPassword}` (min 6 chars) → `{updated: true}`

### Products
- **GET /api/products** — No auth. Query: `category, search (ILIKE), seller, minPrice, maxPrice, sort (price_asc/price_desc/oldest), page (1), limit (20/max 50)` → `{products[], total, page, pages}`
- **GET /api/products/:id** → `{product{..., images[], seller{...}, category}}`
- **POST /api/products** — Bearer+Seller. `{name, description, price, stock, categoryId, images[]}` → `{product}`
- **PUT /api/products/:id** — Bearer+Seller (ownership check)
- **DELETE /api/products/:id** — Bearer+Seller (ownership check)

### Orders
- **GET /api/orders** — Bearer → `{buyerOrders[], sellerOrders[]}` (each with other_party name/phone, my_role)
- **GET /api/orders/:id** — Bearer (buyer or seller only) → `{order{..., items[{product_name, product_price}]}}`
- **POST /api/orders** — Bearer. `{items: [{productId, quantity}], deliveryMethod?, deliveryName?, deliveryPhone?, deliveryAddress?, deliveryCity?, deliveryNote?}` → `{order}`
- **PUT /api/orders/:id/cancel** — Bearer (buyer only). Restocks products.
- **PUT /api/orders/:id/meetup** — Bearer. `{lat, lng, address, note}`. Status must be paid or pending.
- **PUT /api/orders/:id/meetup/confirm** — Bearer. Cannot confirm own proposal. Requires existing meetup_lat/lng.
- **PUT /api/orders/:id/complete** — Bearer. Cannot complete already completed/cancelled.

### Seller Dashboard
- **GET /api/seller/products** — Bearer+Seller
- **GET /api/seller/orders** — Bearer+Seller
- **PUT /api/seller/orders/:id/status** — Bearer+Seller. Strict: `paid→processing→shipped→delivered`
- **GET /api/seller/balance** → `{balance, total_earned, total_paid_out}`
- **GET /api/seller/payouts** — History
- **POST /api/seller/payouts/request** — Bearer+Seller. `{amount}`. Min Rs 50.

### Payments
- **POST /api/payments/create** — Bearer. `{orderId, returnUrl}` → `{paymentUrl}`
- **POST /api/payments/retry/:orderId** — Bearer → `{paymentUrl}`
- **POST /api/payments/webhook** — No auth. HMAC-SHA256 verified. Events: `payment.completed`, `payment.failed`, `payout.completed`, `payout.failed`

### Other
- **POST /api/upload** — Bearer + multipart `image` field (max 5MB) → `{url}`
- **GET /api/health** → `{status, database, hasMccKey}`
- **GET /api/debug** — Tests MonCashConnect connectivity
- **GET * (catch-all)** — Serves dist/index.html for SPA

## Auth System
- Token is **base64url-encoded JSON** `{id, email, role}` — NOT a real JWT. `JWT_SECRET` env var is unused.
- Stored in `localStorage` key `mm_token`
- Phone numbers stored **without** `+` prefix internally, displayed with `+509` on frontend.

## Order Status Flow
`pending → paid → processing → shipped → delivered → completed`

Seller pushes through `paid→processing→shipped→delivered`. Buyer/seller marks `completed` after meetup.

## Meetup Flow
1. Either party proposes a location via Leaflet map picker (lat/lng/address/note)
2. Other party confirms (cannot confirm own proposal)
3. Either party marks as completed
- Status must be `paid` or `pending` to propose meetup
- Re-confirm is idempotent (doesn't error)
- Meetup data overwrites on new proposal

## Delivery Flow
- Optional: collected during checkout via delivery form overlay
- `delivery_method` = `'meetup'` or `'delivery'`
- When delivery: collects `delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note`
- These fields are stored on the order and visible to the seller

## Frontend Architecture

### SPA Routing (main.js)
- Shell: `#shell` wraps `#page` + `#tab-bar`
- Tab routes (bottom nav): home(/), explore(/explore), sell(/seller), orders(/orders), profile(/profile)
- Fullscreen routes (no tab bar): /login, /signup, /product, /payment, /profile/settings, /cart
- `navigate(path, params)` renders view into `#page`
- Payment return: `/payment/return?order=ID` polls order status (immediate + 3s retry)

### State Store (store.js)
- State: user, token (mm_token), cart (mm_cart)
- Getters: user, token, cart, isLoggedIn, isSeller, cartCount
- Actions: setUser, logout, addToCart, removeFromCart, updateQuantity, clearCart
- Reactivity: onChange/notify pattern
- Events: `store:logout` custom event

### API Client (api.js)
- `request()` helper: prepends /api, attaches Bearer token, JSON parse, throws on !ok
- All exported functions listed above

### Cart.js Checkout Flow
1. User clicks "Checkout"
2. Delivery options overlay: "Meetup" or "Delivery"
3. If Delivery: name, phone (+509), address, city, notes form
4. "Proceed to Payment" → creates order with delivery data → MonCash modal
5. MonCash modal: 3-step instructions → redirects to MonCash URL
6. Cart cleared after redirect

### Orders.js
- **Buying / Selling tabs** — orders listed as cards with status badges
- **Order detail overlay**: items, other party, call link
- **Meetup section** (context-aware):
  - No location + paid → "Arrange Meetup" (opens map picker)
  - Proposed by other → "Confirm" button
  - Proposed by self → "Waiting for confirmation"
  - Confirmed → static map + "Mark as Completed"
  - Completed → checkmark + meetup address
- **Map picker**: Leaflet map, draggable marker, Nominatim search/geocode, note field

## Styling
- Dark theme (CSS custom properties)
- `--bg: #0B0F1A`, `--surface: #141824`, `--coral: #FF4D6A`, `--blue: #00C2FF`, `--green: #00E5A0`
- Primary accent: coral (#FF4D6A) — buttons, prices, badges
- Secondary accent: blue (#00C2FF) — links, outlines
- Success: green (#00E5A0) — confirmed, completed
- Currency: Haitian Gourde (Rs prefix)
- Key files: `src/style.css` (483 lines)

## Environment Variables (.env)
```
PORT=3001
DATABASE_URL=postgresql://...
MCC_KEY=sk_proj_...
MCC_WEBHOOK_SECRET=whsec_...
JWT_SECRET=maurmaket_dev_secret_change_in_production
```

## Dev Workflow
```bash
npm run dev     # concurrently: node server.js + vite
npm run build   # vite build → dist/
npm run server  # standalone Express
```

## Deployment (Fly.io)
- Docker multi-stage build
- GitHub Actions: push to main → auto-deploy to Fly.io
- Region: iad (Ashburn, VA), 1 shared CPU + 1024MB RAM

## Key Observations
1. Auth is simple base64url encoding, not real JWT
2. Phone numbers: stored without `+`, displayed with `+509`
3. No component library — vanilla JS DOM manipulation
4. No TypeScript — plain JavaScript
5. No real-time — only polling (payment return polls + 3s retry)
6. Images served from Express `./uploads/` dir (scaling concern)
7. `components/` directory is empty
8. No form validation library — minimal checks
9. Currency is Haitian Gourde (Rs)
10. DO NOT commit .env with real credentials
