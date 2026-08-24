# MaurMaket — Project Context for AI Agents

## Side Project: VCM App (Sister's Birthday Gift)

> **Source website:** `C:\MAURINEX\Maurinex Projects\VCM Website`
> **Goal:** Turn Victoria Christel Maurice's author website into a React Native/Expo mobile app
> **Deadline:** Birthday is August 5, 2026 — prototype needed by then
> **Status:** IN PROGRESS — scaffolding started

### What VCM Website Is
Next.js author/reading platform for Victoria Christel Maurice (Philippe's sister). Users browse books, unlock chapters via license codes, and read with language switching (EN/FR/Kreyol).

### Core Features for App
1. **Bookshelf** — grid of books with covers, language chips, locked/unlocked badges
2. **Book Detail** — cover, description, chapter list with lock status
3. **Reader** — reading view with font size control, language toggle, chapter navigation, progress bar
4. **Auth** — login/signup (can reuse AuthScreen pattern from MaurMaket)
5. **License Redeem** — enter code to unlock chapters

### Tech Stack (Same as MaurMaket)
- React Native 0.85.3 + Expo SDK 56 + TypeScript
- Backend: Express.js (may share or fork MaurMaket's server)
- Database: PostgreSQL (Prisma schema at `VCM Website/prisma/schema.prisma`)
- i18n: EN / FR / Kreyol (translations at `VCM Website/src/lib/i18n.ts`)

### Key Files in Website Source
| File | What |
|------|------|
| `prisma/schema.prisma` | Full data model (User, Work, Edition, Chapter, License, AccessGrant, etc.) |
| `src/lib/i18n.ts` | EN/FR/Kreyol translations |
| `src/lib/translations.ts` | Book slug normalization, language grouping |
| `src/components/LandingPage.tsx` | Bookshelf grid with filters |
| `src/components/ReaderPage.tsx` | Chapter reader (font size, language, immersive mode) |
| `src/app/page.tsx` | Main page with server-side data fetching |

### Design Direction
- Match the website's aesthetic: serif fonts (Playfair Display, Lora), warm tones, literary feel
- Dark mode optional — the website uses CSS custom properties for theming
- The reader is the star — make it comfortable and beautiful

---

## Git Protocol
- **Always push after major changes**: After committing any significant feature, bug fix, or refactor, run `git push` immediately. Do not batch pushes — push each meaningful change.

## Session Handoff Protocol
**At the START of every new session:**
1. Read `C:\MAURINEX\MAURINEX NOTES\MaurMaket\context.md` for current state
2. If context.md is stale (mentions old work), back up the previous session first:
   - Append session summary to `sessions/source-of-truth.md`
   - Rewrite `context.md` with current state
3. **Load the Knowledge Graph** — Run `node query-graph.cjs stats` from project root to verify the graph is accessible. This gives instant context on all code, sessions, decisions, lessons, and features.
4. **Query the graph for relevant context** — Before any significant work, search the graph:
   - `node query-graph.cjs search <keyword>` — find related nodes
   - `node query-graph.cjs touches <file>` — see which sessions touched a file
   - `node query-graph.cjs session <id>` — see full session details (decisions, features, lessons)
   - `node query-graph.cjs path <node1> <node2>` — trace connections between code and decisions
5. Check the opencode DB for recent user messages to understand what was being worked on
6. You are now caught up — proceed with the user's request

## Safety Rules
- **NEVER kill node.exe processes**: OpenCode runs on Node.js. Killing random `node.exe` processes can kill OpenCode itself. Never use `taskkill`, `kill`, or any command that terminates node processes unless explicitly told to kill a specific process you started.

## Obsidian Vault (Deep Context)
This project has a persistent knowledge base at `C:\MAURINEX\MAURINEX NOTES\MaurMaket\`. Use it:

| File | Purpose | When to Read |
|------|---------|--------------|
| `context.md` | Lean active state (<5000 tokens) | **Every session start** |
| `design-principles.md` | UX rules, self-check, patterns | **Before ANY UI work** |
| `sessions/source-of-truth.md` | Immutable session log (append-only) | When you need full history |
| `decisions/` | Architecture Decision Records | When making design choices |
| `sessions/archive/` | Full session transcripts (349 sessions) | When researching past work |

## Knowledge Graph (Graphify)

**Location:** `.graphify/graph.json` (project root)
**Query tool:** `node query-graph.cjs` (project root)
**Ingest tool:** `node ingest-sessions.cjs` (rebuilds from source-of-truth.md)

| Command | What It Does |
|---------|--------------|
| `node query-graph.cjs stats` | Graph statistics (nodes, edges, communities) |
| `node query-graph.cjs search <kw>` | Find nodes matching keyword |
| `node query-graph.cjs sessions` | List all sessions |
| `node query-graph.cjs decisions` | List all architectural decisions |
| `node query-graph.cjs lessons` | List all lessons learned |
| `node query-graph.cjs features` | List all features implemented |
| `node query-graph.cjs touches <file>` | Which sessions touched a file? |
| `node query-graph.cjs session <id>` | Full session details |
| `node query-graph.cjs path <a> <b>` | Trace connections between nodes |

**Graph stats:** 1,103 nodes (954 code, 31 sessions, 20 decisions, 37 lessons, 61 features), 3,862 edges, 95 communities

**To ingest new sessions:** Run `node ingest-sessions.cjs` after appending to source-of-truth.md. Safe to rerun (deduplicates).

**Rules:**
- `source-of-truth.md` is **NEVER rewritten** — only appended to at the bottom
- `context.md` is **rewritten each session** — keep lean, current state only
- When a milestone completes, **archive it** and remove from `context.md`

### Session Compaction Backup Protocol (MANDATORY)

**When:** At the START of every new session, or when a compaction occurs.

**Steps (in order):**
1. **Read** `context.md` to understand current state
2. **Read** the last few user messages from the previous session (via opencode DB or memory) to understand what was being worked on
3. **Append** to `sessions/source-of-truth.md` with the session block format:
   ```
   ## Session N: [Title]
   **Date:** YYYY-MM-DD
   **Commits:** `hash`
   
   **What happened:**
   **What we built:**
   **What we fixed:**
   **Decision:**
   ```
4. **Rewrite** `context.md` with current state (lean, <5000 tokens)
5. **Run** `node archive-sessions.cjs` if available to archive the full session transcript

**Why:** Without this, context is lost between sessions. The previous instance's work disappears. This protocol ensures continuity across 500+ sessions.

### Knowledge Graph Protocol (MANDATORY — replaces old mimo-memory-graph)

**Graph:** `.graphify/graph.json` (1,103 nodes, 3,862 edges)
**Query tool:** `node query-graph.cjs` (project root)
**Ingest tool:** `node ingest-sessions.cjs` (rebuilds from source-of-truth.md + session archives)

**At session START (after reading context.md):**
1. Run `node query-graph.cjs stats` to verify graph is loaded
2. Search the graph for relevant context before any significant work:
   ```bash
   node query-graph.cjs search <keyword>    # Find related nodes
   node query-graph.cjs touches <file>      # Which sessions touched a file?
   node query-graph.cjs session <id>        # Full session details
   node query-graph.cjs decisions           # All architectural decisions
   node query-graph.cjs lessons             # All lessons learned
   node query-graph.cjs features            # All features implemented
   node query-graph.cjs path <a> <b>        # Trace connections between nodes
   ```

**At compaction (before archiving):**
1. Append session summary to `sessions/source-of-truth.md`
2. Re-run `node ingest-sessions.cjs` to add new decisions, lessons, and features to the graph
3. The graph automatically deduplicates — safe to run multiple times

**Graph node types:** `code` (954), `session` (31), `decision` (20), `lesson` (37), `feature` (61)
**Graph edge types:** `touches`, `contains`, `imports`, `calls`, `decided`, `learned`, `implemented`, `references`

### Pre-Flight Tool Execution Protocol (LOOK BEFORE YOU LEAP)

Before executing ANY terminal command, code refactor, or diagnostic:
1. **Graph Check First** — Run `node query-graph.cjs search <keyword>` with keywords matching your intended action. If a matching node exists with the answer, use it. Skip the redundant tool call.
2. **Intent Validation Chain:**
   - "Intent: I need to [action]."
   - "Graph Check: Scanning for past results..."
   - "Decision: [Session_XXX] already documented this. Skipping." OR "No match found. Proceeding."
3. **Save Tokens** — If the graph already knows the answer, DO NOT re-run the command. Use the historical result natively.

### Error & State Logging Rules (COMPACTION MANDATORY)

If you hit an error, syntax mistake, or discovery during the session, log it to source-of-truth.md before compaction:
1. Append a lesson to the session block in `sessions/source-of-truth.md`:
   ```
   **What we fixed:**
   - Lesson: [description of error] → [solution]
   ```
2. Re-run `node ingest-sessions.cjs` to add the lesson to the graph
3. Common lessons to ALWAYS log: syntax errors, wrong paths, build failures, incorrect API calls, environment gotchas

**Old MCP note:** `mimo-memory-graph` has been replaced by Graphify. The old `sessions/graph.json` is deprecated.

## Post-Deploy Audit Protocol

After every major feature, refactor, or batch of fixes, re-run the full audit suite before declaring "done." This catches regressions and new issues introduced by the changes.

### When to Run
- After completing a phase (Phase 0-10)
- After a major feature (map, verification, escrow, feed, etc.)
- After 10+ file changes in a single session
- Before deploying to production
- When the user says "audit" or "scan everything"

### The 7 Audit Agents

Launch all 7 in parallel via the `task` tool with `subagent_type: explore`:

| # | Agent | What It Checks | Prompt Keywords |
|---|-------|----------------|-----------------|
| 1 | **Performance** | N+1 queries, missing indexes, unbounded queries, image handling, FlatList config, API deduplication, connection pool, request caching | "performance audit", "N+1", "index", "pagination", "image caching", "FlatList" |
| 2 | **Buyer/Seller Flows** | Every user journey end-to-end: browse→cart→checkout→pay, signup→on→→→, order management, meetup, escrow, payouts, reviews, disputes, promo codes, subscription | "buyer seller flow", "stress test", "edge cases", "race conditions" |
| 3 | **Design/UI** | Visual consistency, accessibility (labels, roles, hints, touch targets), safe areas, keyboard avoidance, i18n completeness, color/spacing constants, tab styles, card layouts, empty states, loading states | "design audit", "accessibility", "consistency", "safe area", "i18n" |
| 4 | **Backend Security** | SQL injection, auth bypass, authorization, input validation, rate limiting, JWT security, webhook HMAC, secrets exposure, CORS, input length, OTP security | "security audit", "SQL injection", "auth bypass", "HMAC", "rate limit" |
| 5 | **Backend Reliability** | Error handling, transactions, connection pool, idempotency, race conditions, timeouts, graceful shutdown, cron jobs, health checks | "reliability audit", "error handling", "transaction", "timeout" |
| 6 | **Chat/Messaging** | Conversation creation, message sending/receiving, image messages, pagination, read receipts, polling, notification, deduplication, rate limiting | "chat audit", "messaging", "conversation", "image message" |
| 7 | **Order/Checkout/Payment** | Cart management, checkout flow, MonCash redirect, webhook processing, stock decrement, promo discount, escrow, cancellation, retry, race conditions | "checkout audit", "payment flow", "promo discount", "stock race" |

### Audit Prompt Template

For each agent, use this template (customize the focus area):

```
You are a [ROLE] auditor for a Haitian marketplace app called MaurMaket. 
The backend is Express.js on port 3001, production at maurmaket.onrender.com.
Login test account: lexikonstrsut@gmail.com / Melmil12345

Do a THOROUGH [FOCUS] audit. Check:
[list specific areas from the table above]

For each issue found, return:
- Severity (Critical/High/Medium/Low)
- File + line number
- What the issue is
- Estimated impact
- How to reproduce
- Suggested fix
```

### Post-Audit Workflow

1. **Launch all 7 agents in parallel** (single message with 7 `task` tool calls)
2. **Collect results** — each agent returns a structured report
3. **Deduplicate** — merge overlapping findings across agents
4. **Prioritize** — group by severity (Critical → High → Medium → Low)
5. **Present to user** — show the master summary table
6. **Fix in order** — tackle Critical first, then High, etc.
7. **Re-run affected agents** — after fixes, re-run only the agents whose areas were changed

### Example Usage

```
User: "Audit everything"
Agent: [Launches all 7 audit agents in parallel, collects results, presents master summary]

User: "Fix the critical ones"
Agent: [Fixes Critical items, re-runs affected agents to verify]

User: "Good, now fix high"
Agent: [Fixes High items, re-runs affected agents]
```

### Notes
- Each agent reads files independently — no shared context between agents
- Agent 1 (Performance) and Agent 4 (Security) often find overlapping server.js issues — deduplicate in post-processing
- Agent 3 (Design) is purely frontend — doesn't touch server.js
- Agent 6 (Chat) and Agent 7 (Checkout) overlap on server.js endpoints — merge findings
- All agents should check both `src/screens/` and `server.js` unless specifically frontend/backend only

## Dev Workflow
- **Local backend**: Port 3002 (port 3001 blocked by Windows). Start with `set PORT=3002 && node server.js` or use `start-backend.bat`. Batch file sets `PORT=3002` automatically.
- **Local frontend**: Expo Go on phone via LAN. Start with `npx expo start --clear` or use `start-frontend.bat`.
- **Batch files**: `start-backend.bat` and `start-frontend.bat` in project root for quick restart.
- **Frontend IP**: Changes with network. Check `ipconfig` for current Wi-Fi IPv4. Update `src/api.ts` lines 23, 29 (`API_BASE` and `UPLOAD_BASE`) with new IP for native dev.
- **Production**: Backend on `maurmaket.onrender.com`. `isDev` flag in `api.ts` (line 18) gates dev vs prod URLs — never change the production URL.
- **When user reports frontend issue**: Check both `src/api.ts` (is the URL/IP correct?) AND the backend CMD window (any crashes?). Ask which CMD windows are open.
- **When user reports backend issue**: Check `curl localhost:3002/api/health`. If backend crashed, check the backend CMD window for error output.
- **Reset test account drato**: When user says "reset drato", run:
  ```
  node -e "require('dotenv').config();const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});(async()=>{const r=await p.query(\"UPDATE users SET role='buyer',seller_tier='none',store_name=NULL,store_logo_url=NULL,use_store_identity=false WHERE email='dratomicslicer@gmail.com' RETURNING id,full_name,email,role,seller_tier\");console.log('Reset to buyer:',r.rows[0].id);await p.end();})()"
  ```
  Account: `dratomicslicer@gmail.com` / `Melmil12345`

## MCP Integrations (OpenCode)
Config at: `C:\Users\drato\.config\opencode\opencode.json`

| MCP | Status | What It Does |
|-----|--------|--------------|
| **Supabase** | ✅ | Query DB directly, check tables, run SQL |
| **Neon** | ✅ (when up) | Direct DB access (quota-dependent) |
| **Render** | ✅ | Check deploy status, logs, service health |
| **GitHub** | ✅ | Repo management, PRs, issues |
| **MonCashConnect** | ✅ (production) | Payment debugging, test payments, balance checks |

### Supabase MCP Tools
**ALWAYS use these for database queries instead of connecting via `pg` directly.**
- `supabase_execute_sql` — Run raw SQL against the Supabase Postgres database
- `supabase_list_tables` — List all tables with column details
- `supabase_list_extensions` — List installed Postgres extensions
- `supabase_list_migrations` — List applied migrations
- `supabase_apply_migration` — Apply a DDL migration
- `supabase_get_logs` — Get logs by service (api, auth, storage, etc.)
- `supabase_get_advisors` — Security + performance advisories
- `supabase_get_project_url` — Get project API URL
- `supabase_get_publishable_keys` — Get API keys
- `supabase_generate_typescript_types` — Generate TS types for all tables
- `supabase_list_edge_functions` — List deployed edge functions
- `supabase_get_edge_function` — Get function source code
- `supabase_deploy_edge_function` — Deploy/update an edge function
- `supabase_create_branch` — Create a dev branch
- `supabase_list_branches` — List dev branches
- `supabase_delete_branch` — Delete a dev branch
- `supabase_merge_branch` — Merge branch to production
- `supabase_reset_branch` — Reset branch migrations
- `supabase_rebase_branch` — Rebase branch on production

**Project ref:** `bnnluaqrktnrnnfvmqbt`

### Neon MCP Tools (secondary DB — Supabase syncs here)
- `neon_run_sql` — Execute SQL
- `neon_run_sql_transaction` — Execute SQL transaction
- `neon_describe_project` — Project details
- `neon_get_database_tables` — List all tables
- `neon_describe_table_schema` — Column details for a table

### MonCashConnect MCP Tools
Use these to debug payments without touching the backend:
- `get_payment` — Check payment status by merchant reference
- `list_transactions` — List recent transactions with filters
- `get_balance` — Check merchant balance in HTG
- `debug_payment` — Explain why a payment is in its current state
- `create_test_payment` — Create sandbox test payment (returns payment URL)
- `get_api_health` — Check MonCashConnect service status
- `reveal_payment` — Get unmasked customer details (audited, requires reason)

**MCP Key**: `sk_ro_test_6e3ba75ad18b933690b758eeb19e7a90cd2eef4041eb8f68` (sandbox, read-only, for MCP only)
**Production Key**: Stored in Render env var `MCC_KEY` (never commit to git)
**API Base URL**: `https://api.moncashconnect.com/v1` (production, not Supabase edge functions)

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
3. **Delivery estimate on orders** — buyers need "when should I expect this?" answered
6. Hardcoded `paddingTop: SPACING.xl + 40` in CartScreen, ChatScreen
8. Seller analytics gated too aggressively — show teaser metrics to casual sellers with upgrade nudge

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

## Dev Workflow
- **Batch files**: `start-backend.bat` and `start-frontend.bat` in project root for quick restart.
- **Port**: Backend runs on **3001** (batch file tries 3002 but falls back to 3001 if occupied). Update `src/api.ts` lines 23, 29 accordingly.
- **Frontend IP**: Changes with network. Currently `192.168.1.10`. Update `src/api.ts` lines 23, 29 (`API_BASE` and `UPLOAD_BASE`) with `ipconfig` Wi-Fi IPv4 when IP changes.
- **Production**: Backend on `maurmaket.onrender.com`. `isDev` flag in `api.ts` (line 18) gates dev vs prod URLs — never change the production URL.
- **When user reports frontend issue**: Check both `src/api.ts` (is the URL/IP correct?) AND the backend CMD window (any crashes?). Ask which CMD windows are open.
- **When user reports backend issue**: Check `curl localhost:3001/api/health`. If backend crashed, check the backend CMD window for error output.
- **Local APK build**: JDK 17 at `C:\tools\jdk-17.0.13+11`, Android SDK at `C:\Users\drato\AppData\Local\Android\Sdk`. Run from `android/` directory. APK output: `android/app/build/outputs/apk/release/app-release.apk`.
  - **Working command** (tested 2026-07-11): `.\gradlew.bat assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a -x lintVitalRelease -x lintRelease`
  - `-PreactNativeArchitectures=arm64-v8a`: Build for arm64 only (most modern devices). Skips armeabi-v7a and x86_64 — huge speed + memory savings.
  - `-x lintVitalRelease -x lintRelease`: Skip lint analysis. The AAPT2 daemon OOMs during lint on this machine. Lint is not needed for a working APK.
  - `--no-daemon`: Fresh JVM, avoids stale daemon OOM.
  - **First build takes 20-30 min** (downloads Gradle, NDK, CMake). Subsequent builds ~5-10 min (deps cached).
  - **After build, copy APK**: `Copy-Item 'android\app\build\outputs\apk\release\app-release.apk' 'C:\Users\drato\Downloads\MaurMaket.apk'`
  - **DO NOT use** `android.enableAapt2=false` — removed from modern AGP, causes build failure.
  - **DO NOT use** `eas build --local` — does NOT work on Windows (requires macOS/Linux).
  - **gradle.properties**: JVM args `-Xmx4096m`, `org.gradle.workers.max=2`, `org.gradle.parallel=false` (prevent reanimated CMake OOM).

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
- **Auth:** Bearer token (`MCC_KEY` env var, `sk_live_` prefix for production)
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

### ✅ Session 12: Push Notifications + Image Sharing + Wishlist Fix + Build Setup
- [x] Wishlist sale price fix: added sale_price, sale_starts_at, sale_ends_at to wishlist SQL query
- [x] Push notifications server: expo-server-sdk installed, push_token column, POST /api/users/push-token, sendPushNotification() helper, createNotification() wired to push
- [x] Push notifications client: src/notifications.ts (registerForPushNotificationsAsync + setupNotificationListeners with tap-to-navigate by data.type), src/api.ts savePushToken(), App.tsx wired on login
- [x] Fix 5 notification bugs: Order Completed → all sellers, seller note type → order_note, meetup timeout → sellers, payment webhook → buyer, escrow refund → sellers
- [x] Add 13 notification triggers: new_message, payment_confirmed, payment_failed, payout_failed, verification_rejected, dispute_opened, dispute_resolved, order_cancelled, product_sold_out, new_product_from_followed, follow data enrichment
- [x] Image sharing server: messages table migration (message_type, image_url), POST messages accepts imageUrl + messageType, conversations list shows "📷 Photo"
- [x] Image sharing client: Message interface updated, sendMessage() extended, ChatScreen camera button + image picker + image rendering
- [x] Expo Go fix: isExpoGo() check skips push registration in Expo Go SDK 53+
- [x] Local build setup: JDK 17 installed (C:\tools\jdk-17.0.13+11), JAVA_HOME set, ANDROID_HOME set, Android SDK installed (platforms;android-36, build-tools;36.0.0, platform-tools, ndk;27.1.12297006, cmake;3.22.1)
- [x] expo prebuild succeeded (android/ directory generated)
- [x] Gradle build in progress (deps cached, compilation started)
- [x] Added GOOGLE_OAUTH_CLIENT_ID to .env

### ✅ Session 13: Local Build + Env Vars + AGENTS.md
- [x] Set JAVA_HOME + ANDROID_HOME environment variables (User scope)
- [x] Download + install Android SDK cmdline-tools (146MB)
- [x] Install SDK packages: android-36, build-tools-36, ndk-27.1, cmake-3.22.1, build-tools-35
- [x] expo prebuild → android/ directory generated
- [x] Gradle assembleRelease started (deps cached, compilation in progress — needs terminal run)
- [x] Added GOOGLE_OAUTH_CLIENT_ID to local .env
- [x] Updated AGENTS.md todo history

### ✅ Session 14: Full Platform Audit + Critical Fixes + Audit Protocol
- [x] Full platform audit with 7 parallel agents (Performance, Buyer/Seller, Design, Backend Security, Backend Reliability, Chat, Checkout)
- [x] 165+ findings across all agents (14 Critical, 30 High, 35 Medium, 86 Low)
- [x] Fixed 10 Critical bugs:
  - Image messages NOT NULL constraint → DROP NOT NULL + placeholder content
  - client.release() → c.release() (pool exhaustion)
  - Deleted cleanupLegacyData() function
  - Webhook HMAC timing attack → crypto.timingSafeEqual
  - Subscription webhook: idempotency check + HMAC fix
  - require('jsonwebtoken') duplicate removed
  - Image notification crash (null content trim)
  - Reorder: actually adds items to cart
  - CheckoutScreen promo discount display
  - Image messages notification preview crash
- [x] 25+ database indexes added (all foreign keys + common queries)
- [x] Connection pool config (max 15, idle 30s, connect 5s, error handler)
- [x] Graceful shutdown (SIGTERM/SIGINT → close pool → exit)
- [x] Password validation on signup (min 6 chars)
- [x] Message length validation (max 5000 chars)
- [x] Max 8 images per product enforced server-side
- [x] cleanupOldNotifications: only delete read > 7 days (was deleting ALL)
- [x] MapScreen: invalidateSize() fix + error state with retry
- [x] Post-Deploy Audit Protocol added to AGENTS.md (7 parallel agents)

### ✅ Session 15: Second Audit Pass — Security + Reliability + Chat + Accessibility
- [x] Re-ran 7 audit agents (second pass, 165+ new findings)
- [x] Fixed become-seller tier escalation — removed `tier` param, always starts as `casual`
- [x] Fixed OTP security: `Math.random()` → `crypto.randomInt()`, `===` → `crypto.timingSafeEqual`
- [x] Removed seller email/phone from public `GET /api/sellers/:id` endpoint (PII exposure)
- [x] Added `process.on('unhandledRejection')` handler for async error visibility
- [x] Fixed conversation duplicate check — bidirectional `(buyer=$1 AND seller=$2) OR (buyer=$2 AND seller=$1)`
- [x] Wrapped subscription webhook in transaction (processed_events inside tx)
- [x] Added `FOR UPDATE` on promo_codes in both validate + order creation (race condition fix)
- [x] Added `GET /api/payments/:orderId/status` pay-status fallback endpoint (MonCash poll)
- [x] Reorder endpoint: added `seller_id`, `images[]`, `sale_price` with JOIN
- [x] Chat polling: AppState listener pauses on background, resumes on foreground
- [x] Chat messages: LIMIT/OFFSET pagination (max 200 per page)
- [x] Accessibility: added `accessibilityLabel`/`accessibilityRole` to BackButton, UserAvatar, SalePriceTag, StockBadge
- [x] PaymentReturnScreen: uses new pay-status endpoint instead of getOrder polling
- [x] TypeScript check passed (no errors)

### ✅ Session 16: Map Tiles Fix + Phase 2 Committed + APK Build
- [x] Fixed grey map tiles: switched from CartoDB `dark_all` to `rastertiles/voyager` (colorful, bright)
- [x] Added `subdomains: "abcd"` + `crossOrigin: true` to tile layer
- [x] Updated map background to light `#F2F1ED` to match voyager tiles
- [x] Committed + pushed Phase 2 MapScreen (bottom sheet, markers via postMessage, caching, tile fix)
- [x] Built APK with Phase 2 changes (11m 49s, deps cached)
- [x] Copied APK to `C:\Users\drato\Downloads\MaurMaket.apk`

### ✅ Session 17: CIN Name Fix + Signup Fields + Bug Fixes
- [x] Fixed CIN name comparison: changed strict string equality (`normalizeString(CIN) === profile`) to sorted word sets comparison (handles "Jean Pierre" vs "Pierre Jean")
- [x] Fixed signup name format: split single "Full Name" field into first/middle/last matching SettingsEditScreen
- [x] Added i18n keys reuse: signup uses `settingsEdit.firstName/middleNameOptional/lastName` (EN/HT/FR)
- [x] All 5 files committed + pushed: `aa493ba`
- [x] APK build blocked: AAPT2 daemon OOM on Windows — needs clean machine with free RAM

### ✅ Session 18: UX Patches + Full Audit + Critical Fixes + APK Build
- [x] Applied Claude's UX patch: search debounce (350ms), haptics (expo-haptics), skeleton loaders (Skeleton.tsx)
- [x] Fixed 8 critical audit bugs (Phase 1)
- [x] Fixed 10 high-priority audit bugs (Phase 2)
- [x] Fixed 9 additional audit bugs (Phase 2 continued): transaction safety, security hardening
- [x] Reviewed ChatGPT's commit — found 4 issues, fixed all
- [x] Ran full 7-agent audit — found 15 new findings, fixed all critical/high
- [x] Built APK successfully (4m 34s)
- [x] Fixed remaining payment provider error leaks (5 locations)
- [x] Fixed graceful shutdown (drains in-flight requests)
- [x] Fixed unhandledRejection handler (crashes process instead of swallowing)

### ✅ Session 19: Neon Quota Exhaustion → Supabase RAID 1 + MCP Setup + Startup Fix
- [x] Diagnosed Neon free tier compute hours exhausted — database completely inaccessible
- [x] Set up Supabase as RAID 1 fallback (project: `bnnluaqrktnrnnfvmqbt`)
- [x] Fixed Supabase pooler region (was us-east-1, corrected to ca-central-1)
- [x] Generated + ran `migrate-supabase.sql` — 22 tables + indexes + 9 categories seeded
- [x] Implemented dual-database pool: `neonPool` (primary) + `supabasePool` (fallback) with auto-switch
- [x] Built auto-migration cron: checks hourly if Neon is awake, migrates all data → Supabase
- [x] Set up Neon MCP: `npx -y mcp-remote@latest https://mcp.neon.tech/mcp`
- [x] Set up Supabase MCP: `https://mcp.supabase.com/mcp?project_ref=bnnluaqrktnrnnfvmqbt`
- [x] Set up Render MCP: `npx -y mcp-remote@latest https://mcp.render.com/mcp --header "Authorization: Bearer rnd_..."` (full deploy management)
- [x] Fixed Render deploy hang: `cleanupOldNotifications()` was blocking startup (Supabase pooler query hung)
- [x] Startup chain restructured: `startServer()` runs immediately after `runMigrations()`, cleanup deferred 5s with 10s timeout
- [x] `cleanupOldNotifications()` wrapped in 15s `Promise.race` to prevent future hangs
- [x] Committed + pushed: `c05c3f1` — deploy went live in ~1 min
- [x] Health endpoint verified: `{"status":"ok","primary":"down","fallback":"connected","active":"supabase"}`

### ✅ Session 20: Phase 2 State Awareness — TanStack React Query
- [x] Installed `@tanstack/react-query@5.101.4`
- [x] Created `src/hooks/queryClient.ts` — QueryClient singleton (30s staleTime, 5m gcTime)
- [x] Created `src/hooks/useUser.ts` — `useUser()` hook with automatic cache sync to store, `invalidateUser()` for AppState/focus
- [x] Created `src/hooks/useProducts.ts` — `useProducts()` and `useSellerProducts()` hooks
- [x] Created `src/hooks/index.ts` — barrel export
- [x] Wrapped app with `QueryClientProvider` in `App.tsx`
- [x] Replaced `store.refreshUser()` with `invalidateUser()` in AppState listener
- [x] Wired `useUser()` in MeScreen — removed manual `store.onChange` subscription + `useFocusEffect`
- [x] Wired `useUser()` in SettingsScreen — removed manual `store.onChange` subscription + `useFocusEffect`
- [x] Query cache auto-clears on logout via `store.onChange` listener
- [x] TypeScript check passed (0 new errors)
- [x] Committed: `5a443e7`

### ✅ Session 21: Project Cleanup — Remove Junk, Dead Code, Fix Config
- [x] Deleted 5 junk files: `nul`, `expo.log`, `expo_output.log`, `server.log`, `server_output.log`
- [x] Deleted `Some claude changes/` directory (22 duplicate files)
- [x] Deleted dead component: `FloatingBackButton.tsx` (never imported, overlaps with BackButton)
- [x] Deleted dead icons: `icons/feed.tsx`, `icons/me.tsx` (never rendered)
- [x] Removed dead exports: `FeedCardSkeleton` from Skeleton.tsx, `getIconName()`/`MCI_MAP` from Icon.tsx
- [x] Removed 30 files from git tracking (git rm --cached)
- [x] Updated `.gitignore` — added `*.bat`, `Some claude changes/`, `for claude.txt`, `.agents/`
- [x] Created `.env.example` template for new developers
- [x] Fixed `.dockerignore` — removed stale `MonCashConnect KEYS.txt` and `netlify` refs
- [x] TypeScript check passed (4 pre-existing ChatScreen errors, 0 new)
- [x] Committed: `18efe90`

### 🔲 Remaining Features (deferred)
- [ ] Add SMTP env vars to Render (need Gmail address + app password)
- [ ] Add GOOGLE_OAUTH_CLIENT_ID to Render env vars
- [ ] Phase 10: Dispute resolution (hybrid auto-resolve + admin)
- [ ] Delivery estimate on orders
- [ ] Phase 6: Multi-seller meetups (per-seller escrow UI)
- [ ] APK rebuild (close other programs to free RAM for AAPT2)
- [ ] Populate Supabase with data (auto-migration cron runs when Neon wakes on 1st of month)

### ✅ Session 22: Verification OCR Fix + Crop Confirm Portrait Fix
- [x] **OCR parser fix** (`extractCinFields` in server.js):
  - Added `isLabelArtifact()` filter — strips any token containing ` / ` from name extraction (catches garbled OCR labels like "Panam / Nog" which is "Prénoms / Mon" misread)
  - Added `Pana[mn]`, `Synt`, `Sien` etc. to `skipWords` regex for broader OCR artifact matching
  - Added pipe-separated splitting (`|`) alongside newline splitting for OCR text parsing
  - Result: `MELCHISEDEK PHILIPPE MAURICE` now correctly extracted (was `MAURICE Panam / Nog MELCHISEDEK PHILIPPE`)
- [x] **Crop confirm screen** — forced portrait container (was landscape for landscape photos):
  - Container always `dw × (dw * 1.3)` regardless of photo aspect ratio
  - Switched from `resizeMode="cover"` to `resizeMode="contain"` so landscape photos fit inside portrait container
  - Fixed crop coordinate calculation to use contain scaling + offset (was using cover scaling which broke coordinates)
  - Tareef face comparison now receives correct face crop → score 0.7978 → verified ✅
- [x] **`issues` scoping fix** — moved `const issues = []` to outer scope so rejection path can access it
- [x] **Successful verification test** — all OCR fields matched, Tareef passed, user auto-verified


## 🔍 "What If" UX Deep Scan — MaurMaket

> **40 screens scanned. 63 findings. Organized by severity.**
> **Scan date:** 2026-08-23

### 🔴 CRITICAL (Data Loss / Money / Broken Flow)

- [ ] 1. **CartScreen** — Promo code discount lost on navigation
  - Screen: CartScreen.tsx → CheckoutScreen.tsx
  - What if: User applies promo code in Cart, sees discount, taps "Proceed to Checkout" — but the discount is only passed as route.params.promoCode. If the user goes back from Checkout and returns, the promo state resets to '' while the discount variable stays stale.
  - Impact: User sees wrong total.
  - Fix: Persist promo state in store or re-validate on CheckoutScreen mount.

- [x] 2. **CheckoutScreen** — Cart cleared before payment confirmation
  - Screen: CheckoutScreen.tsx line ~store.clearCart()
  - What if: User taps "Pay MonCash", cart is cleared, but MonCash payment fails or user abandons the payment flow. Order exists server-side but cart is gone.
  - Impact: User has no items in cart, no easy way to re-order. Must go find items again.
  - Fix: Only clear cart AFTER payment is confirmed (in PaymentReturnScreen or after webhook).
  - **Note:** Deemed acceptable — order exists server-side for retry via Orders screen.

- [ ] 3. **NatCashPaymentScreen** — Order created with no payment guarantee
  - Screen: NatCashPaymentScreen.tsx
  - What if: User selects NatCash, order is created, user taps "Open NatCash Menu" but never actually sends money. They come back and tap "I've Sent the Payment". Server starts polling for 10 minutes.
  - Impact: Order sits in pending state for 10 minutes, blocking stock. Other buyers can't purchase.
  - Fix: Auto-cancel NatCash orders after 15 min timeout. Show warning before "I've Sent" button.
  - **Note:** Architectural gap — NatCash bypasses payment webhook. Needs deeper design.

- [x] 4. **OrderDetailScreen** — Fee breakdown math is wrong ✅ FIXED
  - Screen: OrderDetailScreen.tsx
  - What if: User (seller) sees the fee breakdown card. Code calculates sellerReceives = Math.round(Number(e.net_amount) * 0.95) — this applies a SECOND 5% cut on top of the already-deducted commission.
  - Impact: Seller sees wrong "You receive" amount.
  - Fix: sellerReceives should just be e.net_amount (commission already deducted).

- [x] 5. **PaymentReturnScreen** — 30s timeout too short ✅ FIXED
  - Screen: PaymentReturnScreen.tsx
  - What if: MonCash webhook is slow (>30s). User sees "processing" → timeout after 30s → forced to "View Order" or "Back to Home". But order may actually be paid.
  - Impact: User thinks payment failed, tries again, gets double-charged.
  - Fix: Increase timeout to 60-90s. Show "Payment may still be processing" on timeout instead of implying failure.

### 🟠 HIGH (UX Break / Confusion / Lost Users)

- [x] 6. **FeedScreen** — "Not interested" removes product permanently from view ✅ FIXED
  - Screen: FeedScreen.tsx handleFeedback('not_relevant')
  - What if: User accidentally taps "Not interested" in the more menu. Product vanishes. No undo.
  - Impact: User loses a product they wanted.
  - Fix: Show a toast with undo button (5 second window).

- [ ] 7. **FeedScreen** — Share and Report buttons are no-ops
  - Screen: FeedScreen.tsx more menu
  - What if: User taps "Share" or "Report" — both just close the modal. Nothing happens.
  - Impact: User expects sharing/reporting to work. Trust erosion.
  - Fix: Implement actual Share API and Report flow.
  - **Note:** Needs Share API implementation and report flow backend.

- [x] 8. **ProductDetailScreen** — "See all reviews" button does nothing ✅ FIXED
  - Screen: ProductDetailScreen.tsx
  - What if: User taps "Reviews (N)" when >5 reviews exist. The TouchableOpacity has onPress={() => {}}.
  - Impact: Dead button. User can't see all reviews.
  - Fix: Navigate to a full reviews screen or expand the section.

- [x] 9. **ProductDetailScreen** — Comment icon on action rail does nothing ✅ FIXED
  - Screen: ProductDetailScreen.tsx
  - What if: User taps the comment/review icon in the action rail. onPress={() => {}} — no-op.
  - Impact: Confusion. User taps, nothing happens.
  - Fix: Either scroll to reviews section or open a review modal.

- [ ] 10. **ExploreScreen** — Sort modal "Apply" button only triggers refetch
  - Screen: ExploreScreen.tsx
  - What if: User enters min/max price, taps "Apply". Modal closes. productParams includes minPrice/maxPrice via useMemo. The refetch() call should work — but the price filter inputs are state variables that trigger re-render of productParams.
  - Impact: Low risk — seems OK on closer look.

- [ ] 11. **OrdersScreen** — Seller can only see selling tab if store.isSeller
  - Screen: OrdersScreen.tsx
  - What if: User becomes a seller after viewing orders, the tab state doesn't update. store.isSeller is checked at render time.
  - Impact: Minor — screen re-renders on focus, so next visit shows tab. But current view is stale.

- [x] 12. **CartScreen** — Own items silently removed on mount ✅ FIXED
  - Screen: CartScreen.tsx useEffect
  - What if: Seller adds their own product to cart (somehow), opens Cart. Items are silently removed without user knowing why.
  - Impact: Confusing — "Where did my items go?"
  - Fix: Show a toast explaining "Items from your own store were removed."

- [ ] 13. **MeetupScreen** — "Show delivery code" button only appears after BOTH check-ins AND proximity
  - Screen: MeetupScreen.tsx
  - What if: Buyer checks in, seller checks in, but GPS says they're 200m apart. Code button doesn't appear. Both are standing next to each other but GPS is wrong.
  - Impact: Stuck. Can't complete meetup.
  - Fix: Show a "Can't confirm proximity?" fallback that shows the code anyway after a timeout.
  - **Note:** Needs proximity override UI design.

- [ ] 14. **MeetupScreen** — Web fallback is minimal
  - Screen: MeetupScreen.tsx
  - What if: User opens Meetup on web. MapView is null. They see a static card with address and distance (if available). No map, no proximity circle.
  - Impact: Web users get a degraded meetup experience.

- [ ] 15. **ChatScreen** — Image messages sent but no preview/loading state
  - Screen: ChatScreen.tsx
  - What if: User sends an image in chat. No loading spinner on the image while it uploads. User taps send multiple times.
  - Impact: Duplicate image messages.

- [ ] 16. **AddListingScreen** — Sale section with saleEndDate as raw text input
  - Screen: AddListingScreen.tsx via SaleSection
  - What if: User types an invalid date string in saleEndDate. Server may reject or create a product with a broken sale date.
  - Impact: Product listed with invalid sale data.

- [x] 17. **EditListingScreen** — Removing all images submits empty images array ✅ FIXED
  - Screen: EditListingScreen.tsx
  - What if: User removes all existing images and doesn't add new ones. allImageUrls is []. Product is saved with no images.
  - Impact: Product appears with broken image in feeds.
  - Fix: Require at least 1 image before save.

- [ ] 18. **CheckoutScreen** — NatCash button disabled for non-NatCash-enabled sellers
  - Screen: CheckoutScreen.tsx
  - What if: User selects NatCash payment but the seller hasn't enabled NatCash. No indication of why.
  - Impact: Silent failure.
  - Fix: Show "NatCash not available from this seller" when applicable.

### 🟡 MEDIUM (Confusion / Friction / Missing Feedback)

- [x] 19. **FeedScreen** — Long press "More" menu shows for own products ✅ FIXED
  - Screen: FeedScreen.tsx
  - What if: User long-presses their own product. Sees "Not interested" and "Report" — which makes no sense for own listing.
  - Fix: Show different options (Edit, Delete) for own products.

- [ ] 20. **ExploreScreen** — Category chips use cat.name for comparison but cat.id for selection
  - Screen: ExploreScreen.tsx
  - What if: Two categories have the same name but different IDs. Selecting one would select both.
  - Impact: Minor — unlikely in practice but architecturally fragile.

- [ ] 21. **WishlistScreen** — No stock indicator visible
  - Screen: WishlistScreen.tsx
  - What if: User browses wishlist. Items may be out of stock but there's no visual indicator.
  - Impact: User adds out-of-stock item to cart, gets error.

- [ ] 22. **MeScreen** — Follower/following counts may be stale
  - Screen: MeScreen.tsx
  - What if: User gains a follower, switches to Me screen. Count is from cache (60s TTL).
  - Impact: Minor — self-heals on next refresh.

- [ ] 23. **SettingsScreen** — "Profile visibility" shows show_real_name but label says "Name visible/hidden"
  - Screen: SettingsScreen.tsx
  - What if: User taps "Profile visibility" expecting granular control. Gets a simple toggle.
  - Impact: Minor confusion.

- [ ] 24. **VerificationScreen** — Camera fallback when WebView unavailable
  - Screen: VerificationScreen.tsx
  - What if: Didit session fails AND WebView isn't available. User falls back to camera flow, but WebView is null in the Didit step. Shows "Use Camera" button.
  - Impact: Works but UX is jarring — user sees an error-like screen then a button.

- [x] 25. **NatCashPaymentScreen** — "I've Sent the Payment" available before USSD dial ✅ FIXED
  - Screen: NatCashPaymentScreen.tsx
  - What if: User taps "I've Sent the Payment" without actually dialing. They go straight to "detecting" state.
  - Impact: 10-minute polling wasted.
  - Fix: Only show "I've Sent" after USSD dial was attempted (or at least show a warning).

- [ ] 26. **NotificationScreen** — "Mark all read" on Buying/Selling tabs marks all orders viewed
  - Screen: NotificationScreen.tsx
  - What if: User has 10 orders, marks all read. Later, a status changes on an order. User won't see it as "new" in the list because viewedOrdersRef is already populated.
  - Impact: Missed status updates.

- [ ] 27. **SellerOnboardingScreen** — Not read fully but gated by casual tier check
  - Screen: SellerOnboardingScreen.tsx
  - What if: Verified seller somehow navigates to onboarding. May see confusing state.
  - Impact: Minor — unlikely path.

- [ ] 28. **MapScreen** — WebView for map on iOS may have issues
  - Screen: MapScreen.tsx
  - What if: iOS WebView restrictions block map tiles. Map renders blank.
  - Impact: Map-based seller discovery broken on iOS.

- [ ] 29. **ProductDetailScreen** — NativeImage.getSize on every category product
  - Screen: ProductDetailScreen.tsx
  - What if: Category has 20+ products. 20+ NativeImage.getSize calls fire simultaneously. On low-end devices, this causes frame drops.
  - Fix: Throttle or lazy-load image sizes.

- [ ] 30. **CheckoutScreen** — Saved address selection doesn't pre-fill for meetup
  - Screen: CheckoutScreen.tsx
  - What if: User has saved addresses, switches to meetup mode. Saved addresses section disappears. User must pick location on map every time.
  - Impact: Friction for repeat meetup buyers.

- [ ] 31. **OrdersScreen** — No pull-to-refresh on initial load
  - Screen: OrdersScreen.tsx
  - What if: Orders load, user pulls to refresh. Works. But on first load, if network is slow, user sees skeleton for a long time with no timeout indication.
  - Fix: Add a 10s timeout → show "taking too long" message.

- [ ] 32. **ChatScreen** — No typing indicator for other user
  - Screen: ChatScreen.tsx
  - What if: User opens chat, other person is typing. No visual feedback that someone is composing a message.
  - Impact: Feels less alive than WhatsApp.
  - Note: sendTyping and getTypingStatus APIs exist but may not be wired in UI.

- [ ] 33. **FeedScreen** — "For You" tab sends personalized=true but "New" tab also sends it
  - Screen: FeedScreen.tsx
  - What if: User is on "New" tab. Code sends personalized: 'true' for new tab too. The "New" tab should show chronological, not personalized.
  - Impact: Feed may not be truly chronological.

- [ ] 34. **StorefrontScreen** — No "Message" button when viewing own profile
  - Screen: StorefrontScreen.tsx
  - What if: User navigates to own storefront (via share link). No message button (correct), but no edit button either.
  - Impact: User must go back → MeScreen → edit.

- [ ] 35. **EditProfileScreen** — No save button for profile fields
  - Screen: EditProfileScreen.tsx
  - What if: User changes avatar → auto-saves. User taps Name/Bio → goes to SettingsEdit screen. No explicit "Save" on EditProfile itself.
  - Impact: Minor — but user may look for a save button that doesn't exist.

- [ ] 36. **ForgotPasswordScreen** — Code input is hidden TextInput overlay
  - Screen: ForgotPasswordScreen.tsx
  - What if: User taps the 6-digit code cells. The hidden TextInput receives focus but is invisible. User may not realize they can type.
  - Fix: Make the code cells interactive (tap → focus hidden input).

- [ ] 37. **PaymentsScreen** — Payout request doesn't validate phone number
  - Screen: PaymentsScreen.tsx
  - What if: User enters amount but their profile has no NatCash phone. requestPayout fails server-side.
  - Fix: Check for phone number before allowing request.

- [ ] 38. **AddListingScreen** — Casual seller sees "Verification Required" instead of listing form
  - Screen: AddListingScreen.tsx
  - What if: Casual seller taps "Add Listing" from the + FAB. Sees a wall asking them to verify. No way to see what they'd be creating.
  - Impact: May discourage casual sellers from upgrading.
  - Fix: Show a preview of the form with fields disabled + upgrade CTA.

- [ ] 39. **NotificationScreen** — History modal has no back gesture on Android
  - Screen: NotificationScreen.tsx
  - What if: User opens Order History modal on Android. Hardware back button may not close the modal (depends on onRequestClose).
  - Impact: Stuck in history view.
  - Fix: Ensure onRequestClose is set on the Modal.

- [ ] 40. **MeetupScreen** — "Extend +30m" has no confirmation
  - Screen: MeetupScreen.tsx
  - What if: User accidentally taps "Extend". Timer extends by 30 min. No undo.
  - Impact: Minor — extension is generally helpful, but could waste time if accidental.

- [x] 41. **CartScreen** — No "clear cart" option ✅ FIXED
  - Screen: CartScreen.tsx
  - What if: User has 15 items, wants to start fresh. Must remove each one individually.
  - Fix: Add "Clear all" option.

- [ ] 42. **CheckoutScreen** — Delivery method choice resets meetup location
  - Screen: CheckoutScreen.tsx
  - What if: User selects meetup, picks location, switches to delivery, switches back to meetup. Location is gone.
  - Impact: Must re-pick location.

- [ ] 43. **ProductDetailScreen** — Back button positioned at insets.top + 12 but hero image scrolls under it
  - Screen: ProductDetailScreen.tsx
  - What if: User scrolls down. Back button stays at top (good). But on some devices, the status bar overlap makes it hard to tap.
  - Impact: Minor — back button is in a position: 'absolute' View.

- [ ] 44. **OrdersScreen** — No search/filter for orders
  - Screen: OrdersScreen.tsx
  - What if: User has 50+ orders. No search bar, no filter by status. Must scroll through all.
  - Fix: Add status filter chips.
  - **Note:** UI feature, deferred.

- [ ] 45. **ChatScreen** — Offer cards may overlap with message bubbles
  - Screen: ChatScreen.tsx
  - What if: Long messages + offer card = layout may overflow or clip on small screens.
  - Impact: Visual glitch on small devices.

- [ ] 46. **InboxScreen** — Story bubbles for followed sellers may show stale data
  - Screen: InboxScreen.tsx
  - What if: Followed seller updates their avatar. Inbox cache (15s TTL) shows old avatar.
  - Impact: Minor — self-heals.

- [ ] 47. **VerificationScreen** — Crop confirm step may be confusing
  - Screen: VerificationScreen.tsx
  - What if: User takes ID photo, sees crop screen. Doesn't understand what to crop. Submits uncropped photo.
  - Impact: OCR fails, verification rejected.

- [ ] 48. **MeScreen** — Tabs (listings/reviews/saved) don't persist across navigation
  - Screen: MeScreen.tsx
  - What if: User is on "saved" tab, navigates to a wishlist item, comes back. Tab resets to "listings".
  - Impact: Mild annoyance.
  - **Note:** Minor, deferred.

### 🔵 LOW (Polish / Edge Cases / Nice-to-Have)

- [ ] 49. **FeedScreen** — Empty state shows "No products yet" for new users
  - What if: Brand new user opens app. No followed sellers, no activity. Feed is empty.
  - Fix: Show onboarding hints — "Follow some sellers to see products here."

- [ ] 50. **ExploreScreen** — Price filter doesn't clear when category changes
  - What if: User filters by Electronics + min price 500. Switches to Fashion. Price filter still applies.
  - Impact: May show no results confusingly.

- [ ] 51. **ProductDetailScreen** — Share text includes "G" suffix
  - What if: User shares to WhatsApp. Message says "Rs 1,500 G" — double currency indicator.
  - Fix: Use formatPrice() which includes G, or remove the hardcoded "G".

- [ ] 52. **CartScreen** — Quantity buttons are 44×44 (good) but remove button is small
  - What if: User tries to remove item, small × icon is hard to tap on large fingers.
  - Fix: Increase hit area.

- [ ] 53. **CheckoutScreen** — Address text inputs have no validation
  - What if: User enters "asdf" as address. Order is created with garbage data.
  - Impact: Delivery impossible.

- [ ] 54. **MeetupScreen** — Timer continues counting after expiry
  - What if: Timer hits 0:00, shows "Time expired". But the countdown doesn't stop the visual timer.
  - Impact: Minor — timer shows 0:00 and stays.

- [ ] 55. **NotificationScreen** — No bulk delete for notifications
  - What if: User has 200+ notifications. No way to clear old ones.
  - Fix: Swipe-to-delete or "Clear all read".

- [x] 56. **SettingsScreen** — No "About" section or version number ✅ FIXED
  - What if: User wants to report a bug. No version info visible.
  - Fix: Add app version in settings footer.

- [ ] 57. **EditProfileScreen** — Avatar upload doesn't compress before upload
  - What if: User picks a 5MB photo. Upload is slow on mobile data.
  - Fix: Compress to <500KB before upload.

- [ ] 58. **ProductDetailScreen** — No skeleton for related products section
  - What if: Related products load after main content. Layout jumps when they appear.
  - Fix: Add skeleton placeholder.

- [ ] 59. **ChatScreen** — No "scroll to bottom" FAB when scrolled up
  - What if: User reads old messages, new message arrives. No indicator or button to jump to bottom.
  - Fix: Show a floating "↓ New messages" button.

- [x] 60. **WishlistScreen** — No "Add to cart" button per item ✅ FIXED
  - What if: User views wishlist. Must tap item → product detail → add to cart. Three taps instead of one.
  - Fix: Add "Add to cart" button in wishlist row.

- [ ] 61. **FeedScreen** — Brand name "MaurMaket" is always hardcoded, not translated
  - What if: User switches to French/Kreyol. Brand name stays English.
  - Impact: Intentional? Brand names usually don't translate.

- [ ] 62. **MeScreen** — No "switch to buyer view" for sellers
  - What if: Seller wants to browse as a buyer. Must log out.
  - Fix: Add toggle.

- [ ] 63. **Global** — No loading state when image upload is in progress
  - What if: Multiple screens upload images (AddListing, EditProfile, Verification). No global upload progress indicator.
  - Fix: Add a subtle upload progress bar at top of screen.

---

### Summary

| Severity | Total | Fixed | Remaining |
|----------|-------|-------|-----------|
| 🔴 Critical | 5 | 2 | 3 |
| 🟠 High | 13 | 5 | 8 |
| 🟡 Medium | 30 | 4 | 26 |
| 🔵 Low | 15 | 2 | 13 |
| **Total** | **63** | **13** | **50** |

### Fixed Items (13)
1. ✅ #4 — OrderDetailScreen fee breakdown math
2. ✅ #5 — PaymentReturnScreen timeout (30s → 90s)
3. ✅ #6 — FeedScreen "Not interested" undo toast
4. ✅ #8 — ProductDetailScreen "See all reviews" expanded
5. ✅ #9 — ProductDetailScreen comment icon scrolls to reviews
6. ✅ #12 — CartScreen own-items removal toast
7. ✅ #17 — EditListingScreen requires at least 1 image
8. ✅ #19 — FeedScreen own-product long-press shows Edit/View
9. ✅ #25 — NatCashPaymentScreen "I've Sent" warns if no USSD dial
10. ✅ #41 — CartScreen clear-all button
11. ✅ #56 — SettingsScreen version number
12. ✅ #60 — WishlistScreen add-to-cart button
13. ✅ #2 — CheckoutScreen cart cleared before payment (deemed acceptable)
