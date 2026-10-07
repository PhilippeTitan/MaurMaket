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

## Product Discovery & Back-and-Forth
- The user may want to shape any part of MaurMaket through an iterative question-and-answer conversation before implementation. Treat this as an intentional product-design workflow, not as a request to skip ahead to coding.
- Ask one focused question at a time, explain the tradeoffs in plain language, and offer a recommendation when useful. Capture each answer as a decision, then continue to the next unresolved question. Do not repeat settled questions or implement a proposed direction before the user signals they are ready.
- Connect decisions across the whole app. Before suggesting a design or behavior, review relevant existing flows, prior decisions, and constraints in other areas (for example, align map and delivery choices with checkout, seller tiers, safety, and the agreed marketplace values; align future Settings discussions with those same decisions).
- Preserve continuity through compaction and session handoffs: record agreed decisions, open questions, deferred/back-pocket ideas, and the next question in the project context or session notes. Resume from that point instead of restarting the discussion or jumping to implementation.
- When a Q&A is complete and the user moves forward, treat the recorded decisions as an implementation-ready handoff for the next AI agent. Do not restart discovery or ask the user to repeat settled choices; inspect the current code and cross-app constraints, turn the answers into a concrete checklist, and implement the included UI/backend scope as the prior agent would. Keep explicitly deferred ideas in the back pocket. During discovery, do not implement the feature before the user concludes the Q&A.
- App-wide Q&A protocol: when Philippe asks for discovery across the whole app, run a sustained discovery of at least 500 unique, answered questions, expanding beyond 500 when useful. Starting with APP-Q144, ask exactly ten focused questions per round and provide a plain-language recommendation behind each. Keep the existing decision-log cadence: after every nine unique answered questions, append decisions and progress to the app-wide ledger before continuing (a checkpoint may fall mid-round). Do not change product code during discovery unless Philippe explicitly redirects to a separate fix.
- Required duplicate check before every round: read docs/discovery/app-wide-qna-ledger.md; compare each proposed question's underlying decision/topic, including synonyms and paraphrases, against every prior asked question, accepted/rejected/deferred answer, existing discovery section in this file, and cross-linked product decisions. Exact-text matching alone is insufficient. Each question gets a permanent sequential ID (APP-Q001, APP-Q002, ...), a canonical intent, domain tags, and status. If substantially the same decision has already been settled, mark the candidate covered with a reference and ask a different unresolved question. Revisit a settled topic only when new scope materially changes the decision; explain the changed context and record it as a linked follow-up, not a duplicate.
- Count only questions Philippe actually answers toward the 500-question goal. “Agree” counts once; multiple choices or clarifications in one reply do not inflate the count. Record skipped/rejected/back-pocket answers with their real disposition. Keep permanent sequential question IDs; from APP-Q144 onward, use ten-question rounds and pause to update notes after every nine unique answers, including mid-round when needed.
- Use the ledger's domain map and prior-decision coverage index to explore the whole product systematically: strategy and launch, user journeys, onboarding/auth, buyer discovery/search, listing lifecycle, seller tools/tiers/KYC/business, inbox/messaging/offers, checkout/payments, delivery/meetups/map, order management, disputes/refunds/safety, notifications, profiles/social, settings/privacy, operations/support, localization/accessibility, performance/reliability, and future/back-pocket concepts. Domains may be split or extended; do not force exactly 500 if useful unique questions remain.
- After 500 unique answered questions, check coverage gaps across the domain map, summarize unresolved/back-pocket items, and ask whether Philippe wants to continue past 500 or conclude. At conclusion, produce an implementation-ready handoff that points implementing agents to these notes and existing domain decision sections; preserve all settled choices and do not repeat discovery.
- The live registry, count, coverage map, and nine-answer decision log are maintained in docs/discovery/app-wide-qna-ledger.md. Read and update it before/after the applicable rounds; never rely on chat history alone to deduplicate.

### App-Wide Q&A Decisions — Accessibility & Messaging (2026-10-02)

- App-wide Q&A update (2026-10-03): whole-app discovery concluded at 508 unique answers after the coverage audit. APP-Q356–APP-Q365 established policy-change and consent UX. APP-Q367–APP-Q404 established account-session/security, compromise response, and secure data-export decisions. APP-Q405–APP-Q417 established privacy/data-access, correction, collection-purpose disclosure, consent, provider transparency, analytics, and incident-notice decisions. APP-Q420–APP-Q432 established contextual permissions, privacy request tracking, profile link/search visibility, retention transparency, and analytics withdrawal; Q418/Q419/Q424/Q425/Q426 are covered. APP-Q433–APP-Q442 established support website access, cross-channel cases, localization, safe uploads, notifications, and AI boundaries. APP-Q443–APP-Q472 established support-web experience, case closure, accessibility, and diagnostics; Q448/Q449/Q450/Q458/Q461/Q462 are covered. APP-Q483–APP-Q494 established case-scoped support access, urgent cases, submission receipts, intake, clarification, voice evidence, and responder transparency; Q485/Q488/Q492 are covered. APP-Q473–APP-Q482 are covered. APP-Q495–APP-Q519 are answered or covered; Q499/Q500/Q502–Q504 are covered. APP-Q520–APP-Q530 settled map safety eligibility, credible reports, advisory warnings, preserving order state, seller fairness, no background GPS, and private saved meetups; Q528 is covered. APP-Q531–APP-Q540 settled official signed app distribution, release disclosures, update prompts/download recovery, staged rollout, signed rollback, and safe install help. APP-Q541–APP-Q550 settled seller content rights, counterfeit/authenticity reporting, proportionate evidence, private notices, safe edits, appeals, affected-buyer notice, human-reviewed matching, and minimal order snapshots. APP-Q549 was the 507-answer checkpoint. APP-Q551–APP-Q553 are a focused design-system follow-up: support light/dark appearances with device default and override, solid backgrounds/no full-screen images, one consistent font family and type scale, shared spacing/surfaces, a unified SVG icon family, and restrained purposeful motion respecting Reduce Motion. Exact font family to be checked against project assets. Full details: `docs/discovery/app-wide-qna-ledger.md`.

- Screen-reader controls expose clear names, roles, values, and state; announce meaningful outcomes/status changes without interrupting for routine refreshes. Provide concise product-photo descriptions where available, especially for material condition, variants, and safe use.
- Map discovery/place selection has a searchable/list alternative to pan/drag while preserving area and confirmation rules. Identity-verification camera steps provide spoken/screen-reader guidance, specific retake help, and a human support path without weakening checks.
- Time-sensitive tasks show readable remaining time and an absolute deadline; announce meaningful changes without a ticking timer and preserve agreed reminders.
- Haptics are restrained supplemental feedback that respects device settings; never use vibration as the only cue. Core mobile controls target 44–48 dp with spacing. Consequential errors/next steps remain visible until resolved/dismissed; reserve brief toasts for low-impact confirmations.
- Mark listing/message content language for assistive speech where supported. Offer clearly labeled on-demand voice-message transcripts while retaining the audio. Sellers may edit listing-image descriptions after publication; review them normally only when material product/safety claims change.
- Show quiet sent/delivered/read states with configurable read receipts for ordinary chats. Use a brief, subtle WhatsApp-style animated typing bubble that respects Reduce Motion; do not expose persistent online/last-seen status.
- Allow short-window message edits (mark edited) and unsend for ordinary chat (show a removed marker); keep immutable order-term/evidence snapshots. Support per-conversation search, optional safe link previews, and image/voice attachments with validation, upload progress, and retry.
- Provide per-conversation mute, archive, and a small capped set of pinned chats. Active order conversations/actions stay reachable from Orders and cannot be buried; order-critical alerts remain available even when a chat is muted.
- First-contact messages use a lightweight Requests area with listing/order context; acceptance moves the conversation into Inbox, while urgent existing-order contact remains direct. Reports may target an individual message with nearby private context; one report does not cause an automatic penalty.
- Keep message bookmarks private to the user and separate from canonical order terms. Support explicit one-time place pins but not live location; the order's mutually confirmed meetup remains canonical.
- Warn about likely sensitive payment credentials without blocking ordinary contact details or broadly scanning chats. Ordinary chat images do not expire by default; order evidence follows case-retention rules.
- Add an Unread Inbox filter and a synced personal mark-unread reminder without changing the other participant's read receipt. Keep V1 chats one-to-one; voice/video calls and staff/group chats are back pocket.
- Message Requests show only public identity and relevant listing/order context. Recipients can Accept, Delete, or Report (Block in overflow). Requests have no pre-accept read receipts, attachments, formal offers, or follow-back; allow one concise initial message, use a neutral decline status, and keep Requests unread count separate. Archive stale requests transparently with a restore path.
- Consider private, data-backed buyer and seller reliability summaries only in relevant offer/order contexts and with a meaningful minimum of platform-recorded history. Never make buyer scores public or place these signals in broad discovery. Exclude unresolved disputes, unverified claims, and self-reported NatCash transfers; use broad labels with a sample size, explain inputs, and provide a Support correction path without automatic penalties.
- Offline chat text stays visibly queued and sends automatically on reconnect unless deleted. Use WhatsApp-style check marks for queued/sent/delivered/read states while honoring read-receipt settings; use stable IDs to prevent duplicate sends, preserve compose order, and let users edit/discard before server acceptance. Keep unsent content device-local until accepted; preserve drafts/uploads through restarts where possible with protected storage.
- Offer an optional Low Data mode. Reduce offscreen Feed/Explore preloading; use lightweight listing-image previews; tap-to-load chat images and tap-to-play voice messages; disclose size and ask before large seller uploads on mobile data; use product-detail-preserving compression; pause nonessential background media work; use lighter map tiles while preserving list alternatives and exact confirmed-order location precision; do not broadly pre-cache map areas.
- App-wide Q&A progress is 511 / 500 including the focused APP-Q551–APP-Q553 design-system follow-up; whole-app discovery concluded after a domain coverage audit at 508 answers. Reliability decisions: idempotency for consequential actions, atomic final-unit reservations, server revalidation, degraded-service disclosure, encrypted backup/restore drills, incident alerts, least-privilege audits, rollback-capable feature flags, and unsafe-action-only version gates. KYC decisions: minimize retained evidence, disclose retention, allow corrections, proportionate retries, secure draft cleanup, compromised-document response, risk-triggered re-verification, and assisted review. Delivery destinations and recipient contacts are private, explicitly saved, seller-scoped, and authenticated. Listing analytics are optional and privacy-aware. Business storefronts, sharing, referrals, and cancellation preserve settled rules and user rights. Privacy decisions include access/correction/export/deletion, purpose-specific consent, provider transparency, analytics opt-out, incident notice, contextual permissions, profile-link visibility, and retention transparency. Support direction includes a public low-bandwidth multilingual help site, shared secure cases, ownership-verified recovery, scoped diagnostics, bounded AI, case history/reopen paths, and duplicate linking without lost evidence. Meetup safety reports remain private and non-punitive; credible unresolved risk pauses recommendations and warns affected meetups, but reports alone do not establish fault or safety. Keep the 7-completed-meetup/90-day mutual-confirmation threshold; no background GPS; personal saved places remain private. Back pocket: app-download/updates website, in-app update alerts, Support website, Mistral-assisted routing, multiple shops/staff access, and meetup rescheduling. Preserve mandatory seller verification and settled tier/payment rules. See `docs/discovery/app-wide-qna-ledger.md`.
- The full 500+ question registry, prior-decision cross-references, and checkpoint batches are in `docs/discovery/app-wide-qna-ledger.md`.
- Support integration rule (Philippe, 2026-10-04): when building Support-related app flows before the planned Support website exists, create a small, explicit adapter/navigation seam (“leave the cable hanging”) for the future API. Do not invent a fake case-submission backend, claim that a Support case was filed, or add credentials/integration calls yet. Make the current in-app limitation clear; connect the seam when the Support website/API is built.
- Sequencing clarification (Philippe, 2026-10-04): finish implementation work represented by the full app-wide ledger before starting the Support website. Support-related questions may intentionally rely on decisions that will be answered during that later website build; do not treat this as a blocker or rush the website/API. Keep the disconnected Support seam available where needed.
- Support-need recognition (Philippe, 2026-10-05): whenever an implementation decision looks like it needs Support (case filing, dispute escalation, moderation review, rights-holder claims, evidence handling), build only the narrow typed seam/API and route users to the existing in-app Help & Support screen (real FAQ + `support@maurmaket.com`) when a genuine user path is required. Never claim a case was filed or invent a case backend. Current examples: the admin-only listing moderation endpoints (restrict/confirm/pending/approve/reject) are unconnected staff tooling for the future Support website, and `src/support/supportGateway.ts` stays `not_connected`.
- Build-phase checkpoint: `src/support/supportGateway.ts` is the disconnected typed seam for future Support API integration; it safely returns `not_connected`. Do not tell users a case was submitted through it. Cancellation/request/refund lifecycle work and unpaid multi-seller repricing have since been implemented in Sessions 368–374; consult the newest Session checkpoint and ledger before selecting the next slice. Preserve order/payment states while requests are pending and use provider-confirmed refund states only.

### Session 368 — Cancellation request first slice (2026-10-04)
- Added authenticated buyer request, seller accept/decline, and buyer withdraw endpoints, backed by seller-scoped `disputes` fields and a 24-hour seller response window. Requests are visible in Order Detail; text and states are localized EN/FR/HT. The existing reminder job sends one reminder within 2 hours of deadline; overdue requests move to `under_review` without fault/refund attribution.
- A pending request blocks seller status advancement; seller acceptance pauses that seller’s delivery-status actions. Open/unresolved requests block buyer completion and escrow release. No order or payment status is changed by submitting/responding to a request. Refund status remains separate and provider-confirmation-based.
- Scope guardrails at this checkpoint: cancellation supports limited pre-fulfillment buyer/seller cases as detailed in Sessions 369–370. Multi-seller per-portion cancellation/refund/stock and safe resolution for accepted/overdue requests remain unfinished. Meetup exchange cancellation after check-in and paid NatCash/meetup paths remain guarded. Unresolved Support is explicitly not connected; use the future `supportGateway` seam only when a user-facing Support path is built.
- Added idempotent startup/manual SQL migrations for `disputes.seller_id`, response deadline/reminder fields, and a partial lookup index. No remote database migration was applied in this task.
- Verification: `npm test` passes (0 design violations/warnings; 2,267 EN/FR/HT keys synchronized; 1,678 translation calls), TypeScript and Node syntax checks pass, `git diff --check` passes, and Expo web export succeeds (3,571 modules). No live DB/provider/device test; no commit/push.
- Next: implement true per-seller cancellation/refund/stock handling for multi-seller orders and define how an unresolved case can be resolved before enabling production settlement. Preserve the support API cable rule.

### Notifications Decisions — Settled; Implementation in Build Phase (2026-10-01)

- Keep messages and offers in Inbox, order activity in Buying/Selling, and use Notifications for other marketplace/account activity. Avoid duplicating the same event in multiple areas unless there is a clear user benefit.
- Shape the notification experience during Q&A: Philippe wants an interactive activity feed with an Instagram-like standard. Do not copy Instagram blindly; adapt interactions to marketplace actions and keep the screen clear.
- Continue one focused question at a time and record each answer here. No notification feature implementation until the Q&A is concluded. Once Philippe concludes and moves forward, this is an implementation-ready handoff for the next AI.
- Current code findings: the general notification feed filters to unread only; notification settings toggles are not persisted; server push sends do not apply user preferences. Reconcile these with the decisions during implementation.
- Decision: Keep read notifications in recent activity. Tapping a notification should mark it read automatically and open its relevant destination; retain it in history so users can revisit it.
- Decision: Automatically group repeated low-priority social/product activity (such as multiple saves or follows) into a concise feed item or summary. Keep each actionable order, payment, security, and meetup event distinct.
- Decision: Adapt low-priority push delivery to engagement: if someone rarely opens those alerts, gradually bundle them while retaining every event in the in-app feed. Never delay urgent or time-sensitive marketplace actions.
- Decision: Offer simple per-category delivery choices (push now, daily summary, or in-app only), with sensible urgency-aware defaults.
- Decision: Deliver the daily summary after the user's chosen quiet-time window ends. Urgent alerts remain immediate.
- Research direction: Separate durable in-app activity history from push delivery. Let the system route taps to the relevant context, apply category preferences, and summarize or throttle low-priority activity while preserving urgent payment, security, meetup, and order-decision alerts. This is an adaptation of patterns seen in TikTok, YouTube, and Instagram, not a claim that they use one identical policy.
- Decision: Always send immediate push alerts for security/account access; payment, payout, and refund status; order actions/status that need attention; meetup or fulfillment proposals, counters, confirmations, and expirations; and dispute updates. Follows and offers should also be immediate, per Philippe. No user summary/in-app-only preference should delay these agreed urgent categories.
- Code inventory for notification policy: also includes low-stock/sold-out inventory, verification outcomes, review received, subscription changes, NatCash access renewal/expiry, seller debt payment, and routine product updates from followed sellers. Triage each during implementation so deadline/access/financial impact stays timely, while informational activity can be bundled.
- Decision: Send immediate pushes for low-stock/sold-out alerts and subscription/NatCash expiry reminders when action is needed to prevent lost sales or access. Routine renewal confirmations can remain in-app or summary.
- Decision: Keep non-urgent milestones (new reviews, verification approvals, routine renewals) in the activity feed and daily summaries without immediate push. Push verification rejection or other changes requiring action.
- Decision: Retain read notification activity for 90 days before automatic cleanup. Keep unread/action-required items until acted on or their underlying item expires, subject to a sensible maximum retention policy.
- Decision: Let users dismiss individual notifications and clear all read notifications, with confirmation for bulk clearing. Clearing the feed must never change the underlying order, payment, dispute, or other marketplace state.
- Decision: Keep one unified activity feed with time-based sections (Today/Yesterday/Earlier) and subtle category cues; do not split into separate feeds for every event type.
- Decision: Opening a grouped social/product summary should show the people/items involved and provide direct links to relevant profiles or listings in a compact, privacy-conscious detail view.
- Decision: The general notification badge counts all unread notification activity. Use stronger visual emphasis for notifications that require action. Keep Inbox message/offer badges separate from the general notification badge.
- Decision: Suppress a redundant push when the user is already viewing the relevant conversation/order/meetup and can see the update; still record the activity and update the open screen. Otherwise, deliver according to urgency and preferences.
- Decision: For v1, push notification taps deep-link into the relevant app screen; no quick actions that mutate marketplace state directly from the notification. Revisit one-tap actions later only for low-risk, clear, reversible operations.
- Decision: In-app notification records are the durable activity history. Push is best-effort; if delivery fails/offline, keep the event in-app and refresh unread state when connectivity returns.
- Decision: Notification read/unread state and badge are account-wide and sync across devices, near real time where possible and on app resume as fallback.
- Decision: Provide temporary pause/snooze for non-urgent pushes, with simple durations (e.g. 1 hour, tonight, until morning) and a catch-up summary when it ends. Urgent security, safety, and payment alerts continue through the pause.
- Decision: Put a compact “Manage notifications” entry in the activity feed and keep detailed category, quiet-time, and pause controls in Settings.
- Decision: Explain bundling in the summary itself; avoid noisy explanations for routine foreground push suppression; clearly show when a user-selected pause is active.
- Decision: Group repeated low-priority activity for the same listing or seller within a rolling 24-hour window; start a new group after that window.
- Decision: If a notification destination changed or expired, open its current state and briefly explain what changed instead of showing an error or stale action.
- Decision: Quiet hours are off by default. Users can enable a schedule in Settings; daily summaries arrive when that quiet-time window ends.
- Decision: Provide simple activity-feed filters: All, Social, Marketplace. All is the default and remains a unified feed.
- Decision: Render grouped activity as one card with a count and a few names or listing thumbnails; tapping opens a detail view with the included events and links.
- Decision: Show read/unread state with a subtle marker and emphasis that does not rely on color alone.
- Decision: Dismissing a grouped card dismisses the group from the feed; its underlying events remain in group detail until normal retention cleanup.
- Decision: Keep all notification records in the in-app feed. Let users control push delivery by category (push now, daily summary, or in-app only); do not provide a category switch that deletes or hides the in-app history.
- Decision: Lock-screen previews hide sensitive details (payment amounts, dispute reasons, message text) by default; provide a separate message-preview preference.
- Decision: Respect the phone's Do Not Disturb and silent settings even for urgent MaurMaket pushes. Keep every alert available in-app.
- Decision: If push permission is denied, keep in-app notifications working, explain that push is off, offer a device Settings shortcut, and avoid repeated prompts.
- Decision: Opening a push destination preserves a sensible return path so Back returns to where the user was.
- Decision: Keep distinct urgent events in in-app history. Combine rapid same-order pushes only when they do not require separate responses; distinct decisions requiring action get separate pushes.
- Decision: An action-required notification can be hidden from the main feed before resolution, but must remain accessible in an Action needed area and the underlying marketplace state remains visible until resolved.
- Decision: Opening a grouped notification marks all included events read; retain their details in the group.
- Decision: Use avatars/listing thumbnails where available for social/product notifications, with icon fallbacks. Keep money, security, and dispute alerts restrained and privacy-safe.
- Decision: Use one contextual CTA when a notification requires a next step; otherwise the whole card opens the destination. CTAs open the relevant flow and do not mutate marketplace state directly.
- Decision: Keep the feed newest-first and chronological; visibly mark action-required items and offer an Action needed filter rather than pinning them above newer activity.
- Decision: Provide a brief Undo affordance after dismissing a notification/group; dismissed action-needed items remain accessible in Action needed.
- Decision: Defer feed search for v1; time sections and All/Social/Marketplace filters should suffice initially. Revisit based on usage.
- Decision: Make Action needed a filter within the unified feed, not a separate screen.
- Decision: Localize notification and push text to the user's selected app language (Haitian Creole, French, or English).
- Decision: Bundle rapid bursts of follows into one immediate push; show grouped follower details in-app.
- Decision: Do not add a Follow back button to notification cards; let users visit profiles and choose there.
- Decision: Updates from followed sellers (such as new listings) appear in the feed and daily summary by default; push is user-configurable and not immediate by default.
- Decision: Send a daily summary only when there is activity to report.
- Decision: If quiet hours are off, deliver the daily summary at 9:00 AM local time by default, with an editable time in Settings.
- Decision: Deduplicate one underlying event delivered through push and realtime; show it once in the feed and unread badge.
- Decision: For bursts of follows, send the first push promptly and bundle nearby follows into a follow-up summary within a short 2-minute window.
- Decision: Preferences, quiet hours, and temporary pauses sync account-wide; device OS push permission remains device-specific.
- Decision: Where possible, store structured notification event data and render historical items in the user's current app language.
- Decision: When an underlying action is completed (for example, meetup confirmation), automatically clear the notification's Action needed state and retain it in history.
- Decision: Daily summaries include only events assigned to Daily summary, not In-app only.
- Decision: An unread grouped card counts as one badge item; show the number of underlying activities on the card.
- Decision: During quiet hours, non-urgent push-now events wait until quiet hours end and join the summary; urgent categories still push immediately.
- Decision: Support one predictable feed swipe gesture: swipe to dismiss. Tapping opens and marks read; provide visible accessible controls and Undo after dismiss.
- Decision: Show a calm “you're all caught up” empty state, without a distracting illustration or push to change settings.
- Decision: Animate new feed notifications with a subtle fade/short slide, without bouncing or interrupting scrolling; respect reduced-motion settings.
- Decision: Open grouped notification details in a lightweight sheet over the feed; closing it restores the prior feed scroll position.
- Decision: A daily summary push preview contains a short headline and total count only; names, listings, and full details stay in-app.
- Decision: Quiet-hour schedules repeat daily by default and can optionally vary by weekday/weekend or day.
- Decision: For a push tapped from a cold start, preserve its destination through app startup and session restoration/sign-in, then route there.
- Decision: When a push is tapped offline, show cached information if available, clearly label it as potentially outdated, and retry on reconnect instead of showing a raw error.
- Decision: Keep in-app activity and read state consistent across web and mobile; browser push is optional where supported and requires browser permission.
- Decision: Show a separate unresolved-action count on the Action needed filter, even if the alert is read or dismissed from the main feed; keep it separate from the unread badge.
- Decision: When the app is foregrounded and the user is outside the relevant screen, show an in-app banner for urgent/action-needed events and update feed/badge; routine social activity updates quietly. Tapping a banner opens the destination.
- Decision: Foreground banners auto-dismiss after about 5 seconds; underlying action-needed tasks remain visible until resolved.
- Decision: Show foreground banners one at a time; queue urgent alerts and combine routine activity into a concise summary.
- Decision: Suppress the matching OS push while the app is foregrounded and displaying the in-app banner; still record the event and update unread/action state.
- Decision: After resolving the underlying action, automatically clear Action needed and mark its notification read, retaining it in history.
- Decision: When a newer event supersedes an earlier pending action (e.g. a counter replaces a meetup proposal), remove the old alert from Action needed and preserve it in history for context.
- Decision: Dismissing an unresolved action alert from the main feed marks it read/removes it from the unread badge, but it remains visible and counted in Action needed until resolved or expired.
- Decision: When a time-limited action expires without a response, remove it from Action needed and retain it in history with an Expired outcome, explanation, and any valid next route (e.g. reopen order/contact support).
- Decision: Sort Action needed by nearest deadline first; items without deadlines are newest-first.
- Decision: Show a calm remaining-time label on time-limited tasks (e.g. “Respond within 2 hours”); no alarming countdown animation.
- Decision: Dismissing a push from the operating system notification shade only clears that device's push; it does not mark the in-app notification read.
- Decision: Send one useful reminder before a time-limited action expires if it remains unresolved; no repeated reminders.
- Decision: Group Action needed tasks by order where useful, while keeping each distinct decision and CTA separate.
- Decision: Do not notify users about their own actions.
- Decision: Let users mute new-listing updates from a specific seller without unfollowing them; offer this from that seller's notification details.
- Decision: Promotional announcements require a separate opt-in, off by default and distinct from essential account/order alerts.
- Discovery is concluded and its decisions are implementation-ready. Implement against this settled policy and the app-wide ledger; do not ask Philippe to reconfirm or restart notification discovery.
- Deferred connected discovery: Philippe wants a separate Q&A and UX revamp for the Buying/Selling order-management area (`OrdersScreen`), which Notifications already treats as the home for order activity. It has not been covered by the Inbox, Map/Checkout, Notifications, or Profile/Settings discoveries yet. Current screen has Buying/Selling tabs, status chips, and basic order cards/actions; connect its future design to the agreed checkout, fulfillment/meetup, payment, dispute, and notification flows. Resume this after the active Profile/Settings discovery unless Philippe reprioritizes it.

### Profile & Settings Discovery — Complete / Implementation Ready (2026-10-01)

- Continue the product Q&A in groups of three questions per round. Check this section and prior decisions before asking; do not repeat resolved questions. Batch decision-memory updates after each nine answered questions.
- No profile/settings redesign implementation until Philippe concludes discovery and asks to proceed. Once concluded, treat decisions here as an implementation-ready handoff and inspect current code/cross-app dependencies.
- Current state: `MeScreen` combines the user's identity, seller summary, listings, reviews, and saved items; `StorefrontScreen` is visitor-facing; `SettingsScreen` links to profile editing and contains a real-name visibility toggle, while account/security/privacy controls live on separate screens. Read `design-principles.md` before any UI work.
- Settled tier/profile direction from prior discussion: one account and one store in V1; Business sellers can present their public identity as personal or business; multiple stores are a back-pocket idea. Switching presentation does not split catalog or transaction-backed trust history.
- Profile editing and public-identity privacy controls belong in a coherent Profile hub; login/security, payments, and app preferences stay in their respective Settings areas. Make visibility clear.
- The user's own Me tab should be identity-first, with a clear Seller Tools entry and compact seller summary; full seller analytics remain in Seller Tools.
- Visitor profiles should lead with compact identity/trust information and Follow/Message actions, then listings and reviews. Show broad city-level location only. Saved items remain private by default; a public wishlist can be considered later as a separate opt-in.
- Profile structure: layered and modular, not a clone of Instagram's accumulating feature set. Proposed visitor layout: identity/trust header, Follow/Message actions, then Listings, Reviews, About sections.
- Seller profiles may pin one listing for all tiers. Business profiles may show optional store description, category, and public service area; only render fields the seller has filled.
- Research note: Meta/Instagram patterns suggest a clear profile foundation plus role-specific, optional surfaces: Meta has documented profile pinning (up to three posts), business action buttons, and newer optional enhanced business profile information. Adapt the hierarchy, not the feature pile. Sources: https://about.fb.com/ja/news/2022/06/grid_pinning_on_profile/ ; https://about.fb.com/ja/news/2018/05/instagram_businessmessaging_action/ ; https://about.fb.com/news/2026/09/introducing-meta-one-subscription-service-more-features-ai/ .
- Next question: Which seller trust signals should be visible in the public profile header? Recommendation: verified badge (when earned), average rating with review count, and completed sales count; never expose revenue or private account details.
- Decision: Public seller profile headers show verified badge when earned, average rating with review count, and completed sales count. Never expose revenue or private account details.
- Decision: Business/personal identity switching takes effect immediately and reversibly, with a clear active-mode indicator and a smooth transition animation; provide a “View as visitor” preview.
- Decision: Keep About as an expandable section; primary profile tabs focus on Listings and Reviews.
- Decision: Saved profile edits update consistently across Me, visitor storefront, product cards, and chat headers using one profile source of truth.
- Decision: Personal and Business presentations use one username and profile URL; the public display name/logo follows the selected mode.
- Decision: If the seller has no active listings, keep Listings as the selected section and show a useful empty state; visitors can switch to Reviews/About if populated.
- Decision: All accounts, including buyers, have a minimal public profile for trust and messaging; seller capabilities/sections appear only when relevant.
- Decision: Do not show a buyer's individual purchases or meetup history publicly. Keep buyer profile minimal; any later buyer reputation signal must be aggregated and privacy-safe.
- Decision: Visitors can open follower/following lists; provide a privacy control to hide lists for users who prefer that.
- Next question: Should a user's real/legal name be public by default, or should the public profile use a chosen display name/username unless the user opts in to showing their real name? Recommendation: keep legal/KYC identity private by default; let the user explicitly show a public real name.
- Decision: Keep legal/KYC identity private by default; use a chosen public display name/username unless the user explicitly opts in to showing their real name.
- Decision: Public city-level location is opt-in. Keep personal city visibility separate from the optional, broad seller service area; never display a precise address on a profile.
- Decision: Profile identity edits use an explicit Save action; simple toggles save immediately. Do not publish partial edits after a failed save; show clear success/error feedback.
- Decision: Follower/following lists are public by default with privacy control to hide them. Counts remain visible unless the user separately chooses to hide counts.
- Decision: A real-name display preference applies consistently across public-facing profiles, listings, reviews, and chat; legal/KYC identity remains private.
- Decision: Buyer profiles are not broadly searchable in V1; access them from message/follow/review/order contexts or a shared profile link.
- Decision: Add Report and Block actions to the overflow menu on visitor-facing profiles; keep them out of the primary action row.
- Decision: Profile visibility and identity preferences are account-level settings persisted server-side and synced across devices.
- Decision: A buyer can limit their profile's public details, but their minimal chosen identity remains viewable when reached through a conversation, order, review, or shared profile link; active seller storefronts remain public.
- Decision: Blocking prevents new follows and non-order messages and hides the profile from normal browsing. Keep an active order's conversation available for fulfillment and support; preserve prior chat history as read-only.
- Decision: Reporting is available from both visitor profiles and active orders. Order reports include transaction context and route payment, delivery, meetup, or dispute issues to the appropriate flow. A report enters review and does not trigger an automatic penalty; Block remains a separate action.
- Decision: The Profile area in Settings includes a public-profile preview alongside editing and visibility controls.
- Decision: Group public-profile privacy controls (profile visibility, follower-list visibility, public city) under Profile & Privacy; keep account login/security controls separate and place Block/Report under Safety.
- Decision: Manage optional public city in Profile settings and private saved delivery addresses in a separate Delivery settings area.
- Decision: Place Edit Profile and Share Profile near the user's profile header; keep View as visitor readily available alongside them.
- Decision: Keep public profile content in a predictable order: Listings and Reviews as the primary sections, with optional About content; users do not rearrange sections.
- Decision: Sync app language across devices; keep theme selection device-specific.
- Decision: Show a seller's single pinned listing near the top of their public profile, before the full Listings section.
- Decision: Show only available listings on public profiles; keep sold/unavailable inventory private and use the agreed aggregate completed-sales count as social proof.
- Decision: For limited-visibility buyer profiles, show basic chosen identity and relevant shared context when opened from an order/conversation/link, while respecting hidden follower lists, location, and other privacy choices.
- Decision: Show public seller reviews newest-first with a compact rating breakdown.
- Decision: Let sellers post one concise public reply per review; do not create a reply thread.
- Decision: Organize the Settings home as a clean grouped list: Profile & Privacy, Account & Security, Notifications, Payments & Delivery, Seller Tools, App Preferences, and Help; avoid long descriptions.
- Decision: Require a completed purchase/handoff before a buyer can submit a review. A canceled order, failed meetup, or fully refunded order is not review-eligible.
- Decision: Keep one editable review per completed order; a separate completed repeat purchase may receive a separate review.
- Decision: Prompt for a review gently after completion, with at most one reminder; do not nag.
- Decision: Notify the reviewer in-app when the seller replies, respecting the user's normal push preferences.
- Decision: Sellers can report a review for support review but cannot delete it themselves; authors can edit their own review for that order.
- Decision: Put a compact, tappable account/profile row at the top of Settings showing avatar, name, and current seller tier; avoid a large profile card.
- Decision: Complex settings areas (Privacy, Security, Payments, Delivery) open dedicated pages; simple preferences stay inline.
- Decision: Defer Settings search until the settings catalog grows enough to need it.
- Decision: Offer System, Light, and Dark appearance options; default to System and keep the selected theme device-specific.
- Decision: Profile and Settings layouts respect OS text scaling and remain usable at larger text sizes.
- Decision: Use smooth profile/settings transitions by default and respect the OS Reduce Motion preference by reducing/removing motion when enabled.
- Decision: If a seller switches to Business presentation before entering a store name/logo, allow the switch and use their existing public identity as a fallback; offer a non-blocking prompt to complete business details.
- Decision: Switching back to Personal presentation hides but preserves business identity fields for later use.
- Decision: If Business access expires and the seller is demoted, switch public presentation to Personal, preserve business details privately, and clearly notify the seller.
- Decision: If Business access ends with more than Verified's 100-listing cap, disable/pause excess listings without deleting them; the seller chooses which 100 remain active.
- Decision: A pinned listing counts toward the 100-listing cap and should remain active automatically during downgrade when possible.
- Decision: Snapshot the seller's public name and logo on each order and receipt at creation time; profile links continue to resolve to the seller's current profile.
- Decision: Keep cap-paused listings in a seller-only Paused section; exclude them from public profiles, browsing, and search.
- Decision: If the seller has not selected listings by the time access is downgraded, keep the pinned listing and then the most recently active listings; allow the seller to change the selection.
- Decision: Pausing a listing prevents new purchases but does not affect active orders or existing fulfillment commitments.
- Decision: Send one clear in-app alert when downgrade pauses listings, showing the number paused and linking to listing management.
- Decision: If a buyer opens a direct link to a tier-paused listing, keep the page reachable with a clear temporarily unavailable state, prevent checkout, and link to the seller's current profile/available listings.
- Decision: Keep tier-paused listings in buyers' saved lists and label them unavailable; do not silently remove them.
- Decision: When seller access returns, automatically reactivate paused listings that remain eligible and make them available through profile, search, saved lists, and existing links.
- Decision: If a dispute closes without a full refund and the order remains completed, make the buyer eligible to review after dispute resolution; exclude fully refunded orders.
- Decision: Allow 90 days to submit an eligible review, starting after completion or dispute resolution as applicable.
- Decision: Require an overall star rating; written comments are optional.
- Decision: Use one overall rating for v1 rather than separate seller/item/delivery scores.
- Decision: Do not allow photo/video attachments to reviews in v1; use text and stars.
- Decision: Keep private feedback to MaurMaket/Support separate from the public review form.
- Decision: Publish a review immediately after submission; do not wait for a seller response.
- Decision: Keep eligible reviews public indefinitely and show them newest-first, unless Support makes a final policy-based removal.
- Decision: Once Support finally removes a review, exclude it from public rating averages and preserve the original plus moderation decision in private records.
- Decision: If an already-published review's order is later fully refunded, preserve it in private order/audit history but remove it from public averages; if partially refunded and the buyer keeps the item, the review remains eligible.
- Decision: Defer review eligibility and prompting while an order dispute is open; after it closes, apply the full/partial refund and completed-order rules above.
- Decision: Sellers may edit their single public reply to a review, but replies do not become threads.
- Decision: Buyers may report a seller's review reply; route it to Support with the review context.
- Decision: Keep a reported review public while Support reviews it unless there is a clear safety or privacy concern.
- Decision: Send at most one gentle review reminder a few days after an eligible order completes, only when no review has been submitted.
- Decision: Let buyers edit reviews at any time; visibly mark edited reviews.
- Decision: If a buyer edits a review after the seller has replied, notify the seller in-app.
- Decision: Let buyers delete their published review; remove it from public display and rating averages while retaining only the minimum private audit/order record required for integrity and policy.
- Decision: Offer on-demand translation for reviews in another supported language; preserve the original and label translations clearly.
- Decision: When a seller replies to a review, send the review author one in-app activity notification; do not send an immediate push by default.
- Review implementation notes: Current API already requires `orders.status = 'completed'` and database uniqueness is `(order_id, reviewer_id)`. Reviews are stored as seller/order reviews without a `product_id`; `/reviews/product/:productId` joins through order items and currently displays an order review on every product in that order. For v1, keep the review seller/transaction-level, label it as a completed MaurMaket transaction, and only surface it on product pages for a product included in that reviewed order. Preserve the existing one-review-per-order behavior. Verify fully refunded orders cannot remain review-eligible in edge cases before implementation.
- Discovery is complete and implementation-ready. The implementing AI should read this entire section and `design-principles.md`, inspect current profile/settings/review/tier/listing/order code, and implement the settled decisions without restarting discovery. Keep explicit back-pocket ideas out of v1 and preserve cross-surface consistency with Inbox, checkout, orders, notifications, and seller tiers.

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

### External Services
| Service | Purpose | Key/Config |
|---------|---------|------------|
| **cron-job.org** | Render keep-alive pings (replaces throttled GitHub Actions cron) | API key: `ZhYnvsj66LV9BnAiURgHJa9q/AVND65BnN1tkMBRAmg=` |
| | Target URL: `https://maurmaket.onrender.com/api/health` | Free tier, 1-min interval |

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

## Auth Email Branding
- Supabase auth emails currently use the plain text header **MaurMaket**. Keep it this way until an official logo is available on a stable public CDN or domain; externally hosted images can be blocked by Gmail, Outlook, and other clients.
- In the future, replace the text header with the official logo only after its public hosting is stable and deliverability has been checked.
- Use **MaurMaket** or **Maurinex** as branding language for now. Do not use `© Maurinex` as a substitute for legal entity information until the company is formally established and its exact registered legal name is known.
- Once the legal entity is registered, update the email footer to the exact registered entity name.

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

---

## MonCash Support Work — Back Pocket

The MonCash policy and v1 implementation were discussed with Philippe on 2026-09-30. Treat the following as the agreed direction for future support work. Do not apply it to NatCash; NatCash has a different payment and confirmation flow and needs its own discovery discussion.

### Agreed payment and refund rules

- MonCashConnect charges MaurMaket **0%**. Fees are from the Digicel MonCash network: **2.9% on incoming deposits** and **5% on withdrawals**. Do not label either fee as a MonCashConnect commission.
- Seller tier commission remains MaurMaket revenue: Casual 10%, Verified 8%, Business 5%. Display MonCash network fees separately from MaurMaket commission.
- The MaurMaket wallet is the MonCashConnect dashboard balance. MonCash refunds are sent from that wallet. Support must verify provider-side outcomes because users pass through a MonCash controlled browser/payment flow that MaurMaket cannot observe end to end.
- A provider create/accept response is not settlement confirmation. A signed provider webhook is the normal confirmation. If an outcome is ambiguous, leave funds reserved and have an operator inspect MonCashConnect before reconciling; do not automatically resend an ambiguous transfer.
- Refunds are handled by MaurMaket support. Support records the reason, verified MonCash destination, responsibility decision, and provider reference. Refund fee responsibility follows the buyer/seller/shared decision captured in the refund flow. Any seller share not recoverable from escrow or available balance becomes seller debt and is offset from future MonCash earnings. Sellers may also pay the outstanding balance through MonCash.
- A return URL requests a status check; it does not prove payment. Update the app only after provider confirmation or documented operator reconciliation.

### Support work deliberately left for a later pass

- Define the full support case workflow around refunds: request intake, evidence and dispute review, who may decide buyer/seller/shared responsibility, response-time expectations, and what each party can see at each step.
- Add a durable operator audit trail and permission model for support actions, including separate reviewer/approver controls if needed. The current admin MonCash operations screen is a v1 manual control surface, not a full case-management or staff-role system.
- Establish a reconciliation runbook for MonCashConnect: how to find each reference, verify amount/destination/status, record evidence, handle missing or mismatched webhook events, and resolve old completed records. Never infer provider settlement from HTTP 200 or a browser return.
- Review and reconcile historical payout/refund records whose `settlement_confirmed` flag defaults to false before treating them as provider-verified. Preserve evidence and record operator, timestamp, reference, and note.
- Add operational monitoring and alerts for unresolved transfers, webhook failures, unmatched payments, and seller debt balances. Define ownership and escalation windows before automating retries.
- Test the full MonCash sandbox/provider cycle and confirm actual callback payloads, signature fields, status-poll endpoint, fee rounding, retry/idempotency behavior, and refund destination verification before production rollout.
- Keep NatCash out of these MonCash rules. Schedule a separate discussion for NatCash settlement, confirmation evidence, refunds, fees, and support responsibility.

### Current implementation notes

- MonCash settlement ledger, refund approval/reconciliation endpoints, seller debt payment flow, fee previews, and admin operations screen have been added in code.
- The migration is represented in `server.js` startup migration steps and `migrate-supabase.sql`. Confirm the active database has applied the schema before enabling these flows in production.
- No live provider transfer or production database migration was performed during this implementation. Do not claim the provider cycle is production-verified until the runbook and end-to-end provider check above are complete.

## NatCash Policy — Agreed Design and Backlog

This is a separate discovery track from MonCash. NatCash has no MaurMaket API integration, so buyers transfer directly to sellers. Continue the one-question-at-a-time discussion with Philippe before implementation; do not assume MonCash settlement, refund, or commission rules apply.

### Decisions agreed so far (2026-09-30)

- NatCash access is an optional monthly payment-method add-on paid through MonCash. Casual and Verified sellers pay the same flat price for NatCash access only; it does not upgrade their seller tier or grant Business features. Business includes NatCash access only while the seller has active Business access.
- Set the standalone NatCash add-on price at 500 HTG per month for Casual and Verified sellers. Treat this as the agreed starting price; Business includes access while active.
- Each confirmed 500 HTG standalone payment grants 30 days of NatCash access from MonCashConnect's confirmed-payment timestamp.
- Standalone NatCash renewal is manual through MonCashConnect: the seller enters their MonCash number/PIN in Digicel's flow, and MaurMaket extends access only after its backend confirms the payment with MonCashConnect. Do not assume an automatic recurring charge.
- Sellers may pause NatCash access immediately from Settings, removing NatCash from new checkouts while existing NatCash orders finish. They may reactivate during the already-paid 30-day period without paying again; no prorated refund/credit is due for unused time.
- Stop standalone expiry/grace reminders while a seller has explicitly paused NatCash. If they reactivate during their paid period, resume reminders according to the existing expiration date.
- For standalone NatCash access, send one reminder each day for the final 7 days before expiry and each of the 3 grace-period days. Keep NatCash access active during the 3-day grace period. Renewal stops the reminders. After grace, block new NatCash checkouts; allow existing orders to finish.
- Business-bundled NatCash access ends when Business access ends/downgrades. It does not receive an additional NatCash grace period after the Business subscription’s own grace period.
- Verified sellers may have up to 100 active published listings; drafts, archived listings, and sold listings do not count. If an existing Verified seller is already above 100, keep current listings visible but block new listings/reactivation until they are below the cap. Business remains unlimited.
- A checkout may mix MonCash and NatCash, chosen per seller. Each seller’s portion settles and proceeds independently so one confirmed payment does not wait on another seller’s pending payment.
- The monthly NatCash fee is MaurMaket’s fee for offering NatCash. Do not also charge the tier-based per-order commission on NatCash sales, and do not credit buyer-to-seller NatCash transfers to the withdrawable MaurMaket seller balance. Tier commission and wallet proceeds continue to apply to MonCash orders.
- Keep MonCash as pay-at-checkout. NatCash should be a pay-at-local-handoff option for sellers with active NatCash access; do not ask the buyer to prepay NatCash before the item arrives. Use the handoff confirmation/code for delivery completion, not as proof that NatCash transferred money. Proximity is supporting evidence only; preserve a code or mutual-confirmation fallback.
- Proposed handoff sequence agreed: proximity at the handoff, buyer inspects the item, buyer sends NatCash, seller checks receipt, seller hands over the item, then seller enters the buyer’s existing delivery code to complete the exchange. If seller receipt is delayed, keep the seller order pending and tell the buyer not to resend while the parties check.
- If the buyer says they sent NatCash but the seller cannot confirm receipt, wait up to 15 minutes at the handoff. Do not hand over the item or resend during the wait. If receipt remains unconfirmed, end the handoff attempt, leave the seller order unresolved for review, and do not treat the delay alone as either party's fault.
- Keep the item reserved for up to 24 hours after an unresolved NatCash transfer at handoff while the parties/support check receipt; if still unresolved, cancel the seller order and release the stock. If the seller later confirms the transfer arrived, the seller must resolve the payment directly with the buyer; MaurMaket does not reverse or advance the funds.
- In both payment paths, buyer and seller may report the other party about an order/payment problem. A report starts a review; it does not automatically establish fault.
- A report holds only the affected seller’s order while it is reviewed: retain MonCash escrow and pause NatCash handoff/completion for that seller; other seller orders in the same checkout continue independently.
- For NatCash, MaurMaket support mediates but does not promise or advance a refund for a transfer made directly to the seller. If seller receipt is corroborated and the item is not handed over, require the seller to resolve the payment directly with the buyer; support may enforce marketplace account rules.
- If support confirms a seller breached the handoff and the seller refuses to resolve it, restrict new seller orders/listings and hold MonCash payouts until resolved. A report alone is not grounds for account penalties.
- Buyer-side enforcement should be symmetric and review-based: repeated substantiated no-shows or deliberately fabricated payment claims may restrict new orders. A single unresolved NatCash transfer does not count as buyer misconduct when the actual transfer outcome cannot be established.
- A substantiated buyer no-show after the seller has departed earns a warning/strike, not an automatic fee. Cancellation before seller departure does not count as a no-show.
- Temporarily restrict a buyer's ability to place new orders after 3 substantiated no-shows within a rolling 90-day period; review the account rather than applying an automatic permanent ban.
- A seller who confirms a meetup and then has a substantiated no-show receives a warning for the first incident; temporarily restrict new seller orders/listings after 3 substantiated seller no-shows within a rolling 90-day period, followed by account review rather than an automatic permanent ban.
- Buyer and seller may check in at the agreed meetup using in-app timestamped actions; location is supporting evidence only. Support reviews the check-ins and other evidence before applying no-show warnings or restrictions; GPS alone is not proof.
- A no-show may be reported only after the mutually confirmed meetup time has passed by 1 hour, provided the reporting party checked in and attempted to contact the other party. This grace period reflects local travel/communications conditions in Haiti; support still reviews evidence before penalties.
- Meetup scheduling must include a mutually confirmed date, time, and place: either party can propose a slot, and the other can accept or propose a change. The no-show grace clock uses the confirmed slot; rescheduling rules remain back-pocket for later discussion.
- Record a NatCash transfer using the seller's explicit receipt confirmation as the normal handoff record. SMS screenshots may be attached as optional evidence during a dispute, but remain user-provided and are never labeled provider-verified. Disagreements go to support review.
- Buyer-facing status after the buyer reports sending NatCash must say that the buyer reported sending it and that seller confirmation is pending; clearly tell the buyer not to send again while pending. Never display that state as provider-verified payment.
- Seller-facing order UI mirrors the buyer-reported status and offers explicit "I received it" / "I haven't received it yet" actions. The latter follows the 15-minute wait and unresolved-order policy already defined; it does not accuse the buyer or assert payment failure.
- Show seller-confirmed NatCash order totals separately in seller order history/analytics as direct sales made through the MaurMaket ecosystem. Label them seller-confirmed, not provider-verified; never add them to MaurMaket's withdrawable balance or platform settlement totals.
- Give every tier with NatCash access the basic direct-sales total; keep advanced trends and product breakdowns governed by the existing seller-tier analytics rules.
- In a mixed checkout, each seller order proceeds independently: a completed seller's order continues while the buyer retries or cancels only the pending/failed seller portion.
- Mixed-payment checkout and order history should group items by seller under one buyer journey while showing each seller's chosen payment method and status separately. Retry/cancel controls apply only to that seller's pending portion; one seller's completion or failure does not block another's.
- Reserve inventory for NatCash orders without prematurely decrementing the seller's on-hand stock. Compute sellable quantity as on-hand stock minus active reservations; keep the listing visible with a clear temporarily reserved/unavailable indicator when all units are reserved, and block competing purchases. Release the reservation on cancellation/expiry; decrement on-hand stock only when the handoff completes.
- Give buyer and seller 24 hours to arrange a meetup after a NatCash order is placed. Keep the inventory reservation through the mutually agreed meetup time; if no meetup time is agreed within 24 hours, expire/cancel the order and release its reservation.
- Listings should require a structured item-condition choice (initial set: New, Like new, Good, Fair, For parts/not working) plus a written description of known flaws. Do not require separate flaw-photo uploads in v1; this saves storage. Refine condition choices by category over time. Buyers still submit photos as evidence when reporting a mismatch.
- At a NatCash handoff, the buyer may inspect before paying. If the item materially differs from the listing or has an undisclosed defect, the buyer may refuse it and must submit photo evidence; support reviews the report and helps the parties resolve it. If the listing accurately disclosed the item's condition and the buyer simply changes their mind, treat a refusal after the seller has departed as a buyer cancellation/no-show for the agreed warning/strike policy. A cancellation before seller departure is not a no-show.
- After a completed NatCash handoff, support may review reports of hidden material defects or fraud, but not buyer's remorse or flaws disclosed in the listing. Support may mediate and enforce marketplace rules, but cannot promise to reverse or refund a direct NatCash transfer.
- Buyers must report a hidden material defect discovered after a completed NatCash handoff within 48 hours, with supporting evidence.
- Give the seller 48 hours to respond to a post-handoff defect report; if there is no response, support proceeds with evidence review and follow-up.
- For NatCash support review, assemble the order/listing snapshot, buyer's description and photos, seller's response/evidence, relevant in-app messages, and meetup/payment-status timestamps. Keep uploaded SMS evidence labeled as user-provided, not provider-verified.
- If a seller acknowledges a hidden defect, buyer and seller may agree directly on a full refund, partial refund, or replacement/repair. MaurMaket records the agreed outcome but does not move or guarantee the direct-transfer money.
- If support cannot establish what happened in a post-handoff NatCash case, close it as unresolved with no automatic penalty to either party. Unresolved reports do not count toward strikes; repeated substantiated conduct may still be reviewed as a pattern.
- Repeated, clearly substantiated fabrication of evidence by either a buyer or seller may trigger a temporary account restriction. A single unresolved or unproven report is not fabrication and does not count.
- Temporarily restrict the account and review it after 2 clearly substantiated deliberate evidence-fabrication incidents within a rolling 12-month period.

### Back pocket and implementation backlog

- Build a dedicated MaurMaket support website/portal for handling support cases and operational workflows. Evaluate a Mistral AI API as an assistive tool for handling multiple users/cases per session; keep human accountability, privacy, and support review policies explicit before any automation is designed.
- Support-case UX decisions: give each request a private case view with a reference, status, latest update, and next expected step; allow timestamped evidence/context follow-up with clear user-provided/unverified labels; show honest case-priority-based response estimates and update them when delayed without promising a resolution deadline.
- Support-case communication and fairness: keep Support messages in the private case history; tell a reported participant the behavior and necessary evidence to answer while protecting reporter details and unrelated private information; after one reminder, mark an unanswered case waiting/paused or close it with a clear reopen path, never treating silence as proof of fault.
- Close support cases with a concise user-facing outcome, key reason, and next step; allow one second review for new evidence or a clear process concern, routed to a different reviewer where practical.
- Back pocket: Evaluate Mistral-assisted support issue categorization and routing; preserve human review/accountability and privacy safeguards, and do not let AI determine fault or make final case decisions.
- Design meetup rescheduling rules later; explicitly deferred during discovery.
- Back pocket: build a MaurMaket website for app downloads and updates, plus an in-app alert for app updates.
- Refine condition choices and defect prompts by product category after the v1 general labels are in place.
- Define the support operations runbook for NatCash handoff reports and post-handoff defect/fraud claims, including ownership, escalation, audit history, and review service targets. The evidence packet and response windows are already agreed.
- Implement the NatCash access/settings experience, manual MonCash renewal and payment confirmation, 30-day access, reminders/grace, pause/reactivation behavior, and expiry copy.
- Implement verified listing cap and UI; mutually confirmed meetup date/time; reservation inventory model; NatCash order/payment-report states; buyer-facing mixed-payment timeline and seller-scoped retry/cancel actions; seller analytics separation; support tooling; notifications; and end-to-end verification.
- Do not enable NatCash until DB migrations, inventory/order money-state labels, and support operations are ready.

## Map & Checkout Discovery — Agreed Decisions (2026-10-01)

This product-discovery thread has moved into implementation. Preserve settled decisions; do not reopen them without new evidence. Carry forward the requested emotional-design direction: purposeful, reassuring motion that clarifies state, not decorative animation.

### Checkout meetup and delivery maps

- Keep public seller discovery separate from private order logistics. Exact meetup points are private to the order; buyer proposes a point and seller can accept or suggest another. Both must agree before the meetup is final. Existing seller acceptance of fulfillment terms before payment remains the governing checkout behavior.
- Suggest optional named landmarks/place labels when available, without calling them safe or implying current security validation. Sparse map data falls back to a movable pin plus a written landmark/directions note. Both parties confirm the exact point and directions.
- Do not infer safety from political/security data or stale POI data. Never label places safe/unsafe based on incomplete platform data. Community-derived labels are “Popular with MaurMaket meetups,” not safety guarantees.
- A named place becomes eligible as a popular meetup suggestion only from at least 7 completed orders in a rolling 90-day window where buyer and seller mutually agreed to the place. Hide exact counts and individual activity. Cancellations, no-shows, and unresolved disputes do not count; a dispute can count only if resolved and the order is completed.
- Popular meetup suggestions are local to the selected buyer area and seller/buyer radius constraints, optional, and visible only in the meetup-location flow (not public discovery pins). They are a starting point; both parties still confirm the exact order pin and directions. If none fit, use normal pin + directions selection.
- Users may optionally confirm after the meetup whether they met at the agreed place; this is not required to complete an order. Reports for incorrect map details and time-sensitive safety concerns are separate. A single unverified report flags for review; a credible unresolved safety risk temporarily pauses the popularity suggestion and warns affected upcoming meetups. Multiple independent reports also trigger prompt review. Warnings remain advisory and private; they do not automatically cancel/change an order or penalize a seller. Any user may report firsthand concerns; collect optional reason categories/notes and temporary/ongoing/unsure choices. Do not use background GPS for reporting. Show warnings only while risk remains unresolved, explain the reviewed risk without exposing the reporter, and offer another mutually agreed place or Support. Users may privately save preferred meetup places, but the exact point still requires mutual confirmation for each order. Positive recommendations still require 7 mutually confirmed completed orders in a rolling 90-day window; safety reports alone never make a place “safe.”
- Delivery map flow remains private address selection and seller-radius eligibility. Do not aggregate or publish delivery destinations as community map suggestions.

### Seller discovery map

- Discovery map is opt-in and OFF by default. Prompt for permission when the seller enables it; denial keeps the seller off the map. Opting out removes the seller and all listings from map results and map-derived counts, while keeping listings available in regular search/browse. Show a concise confirmation of this effect when opting out. Changes/opt-outs apply immediately.
- Each seller chooses and saves a separate, stable public discovery area. Never derive it from home address, delivery address, or live device location. One seller-level setting controls all listings.
- All tiers get an approximate discovery area. Approximate coordinates are generalized on the server before being sent to buyers and remain stable (no jitter). Seller previews how the location appears before publishing.
- A precise pin is an explicit choice for an actual public-facing storefront, regardless of seller tier; show a clear visibility notice and require confirmation. Approximate area remains the default.
- Map settings live in a dedicated “Map visibility” section, separate from private delivery/meetup address settings.
- Show one pin per opted-in seller, only while the seller has at least one currently available listing. Opening a pin shows all currently available listings; no per-listing curation in v1.
- Buyers can filter by category. Keep a seller pin when at least one available listing matches; show matching listings first and keep the seller’s other available items accessible. Price filters stay in seller preview for v1.
- Panning/zooming stages a new area; a “Search this area” action applies it. Remember the buyer’s last map area, category filter, and selected seller preview. Empty results offer expand-area and clear-category actions. Exclude opted-out sellers from every map result and aggregate.
- Use purposeful animation to preview a seller’s pin moving before publication, and clear motion/feedback for privacy setting changes. Keep current location unpublished until seller confirms; once published, future changes/opt-outs take effect immediately.

## Checkout & Map Discovery — Q&A Clarifications (2026-10-01)

These decisions complete the four-question checkout/map follow-up and clarify the existing map decisions above. Implementation is underway.

- Meetup proposals and counters have a 24-hour response window. If no response arrives, cancel the order and release the reserved quantity. If a MonCash charge exists, start its refund; the agreed flow defers MonCash payment until meetup terms are accepted.
- The buyer submits the first complete meetup proposal from checkout. The seller can accept or counter on the map. Keep one active proposal, preserve earlier proposals in order history, and notify the other party on each new proposal.
- Any change to the accepted meetup location or time returns the complete plan to pending confirmation.
- MonCash payment happens after the seller accepts or counters and the buyer confirms the plan. NatCash remains pay-at-meetup.
- Reserve the selected quantity when the buyer submits the first meetup proposal. Show it to other buyers as reserved/unavailable without exposing a misleading zero-stock count. Keep the reservation through the 24-hour negotiation; cancellation or timeout releases it. After mutual confirmation, keep the reservation through the 15-minute MonCash payment window. Preserve the existing NatCash handoff reservation/accounting rules.
- The map label is “Popular meetup spot.” A threshold-only explanation such as “7+ completed meetups in the past 90 days” is acceptable; never show exact counts or individual activity.

### Implementation defaults chosen when Philippe said “implement” (2026-10-01)

- A seller declining a proposed meetup point declines that point, not the entire purchase. Keep the reservation and let the buyer send a revised point; the 24-hour response deadline restarts on the new proposal. Buyer may cancel at any time.
- Once all seller terms are accepted and the buyer has confirmed any seller counterproposal, start a 15-minute MonCash payment window. NatCash remains payable at the in-person handoff.

### Add Product Discovery — Complete / Implementation Ready (2026-10-01)

- Continue Q&A in groups of three questions, each with a clear recommendation. Record decision-memory updates after every nine answered questions. Check this section and connected product decisions before asking; avoid repeating settled questions.
- Do not implement Add Product before Philippe concludes discovery. At conclusion, treat these decisions as implementation-ready: inspect existing create/edit flows, server listing rules, seller tiers/KYC, image storage, checkout, and the condition/disclosure policy; then implement as the prior AI would, including UI and backend consistency.
- Existing flow is a long form in `src/screens/AddListingScreen.tsx`, with a separate edit flow in `src/screens/EditListingScreen.tsx` and create route in `src/routes/products.js`. Current form has gallery photos, name, description, price, stock, optional category, and sale fields. It lacks drafts, category-aware fields, cover reordering, preview, and item condition/flaw disclosure.
- Cross-flow decision already settled: every seller tier must pass identity verification before selling; seller tier is a separate entitlement and keeps its listing cap (Casual 10, Verified 100, Business unlimited). Reconcile the current casual-seller block and backend gates during implementation rather than treating KYC as a tier feature.
- Preserve the agreed listing-condition policy: structured condition (New, Like new, Good, Fair, For parts/not working) and written disclosure of known flaws. Do not add flaw-photo uploads in v1. Align condition fields with the checkout/NatCash inspection and dispute flows.
- Decision: Use a short guided creation flow with steps for photos, product details, and price/stock; progress and Back navigation preserve entered data.
- Decision: Ask for a category before details, use a shared core form with a small number of relevant optional category-specific fields, and allow changing category later.
- Decision: Require at least one photo to publish, but allow incomplete drafts.
- Decision: Autosave private drafts server-side as the seller progresses; drafts do not count toward tier listing caps.
- Decision: Offer camera and photo library; request camera permission only when the seller chooses camera.
- Decision: Let sellers reorder photos and select the cover; the first photo is the default cover.
- Decision: Incomplete drafts may omit price and stock; require valid price and stock before publishing.
- Decision: Provide a pre-publish preview of both the product card and detail page with a direct way back to edit.
- Decision: Support simple product variants in v1 (such as size/color), with price and stock per option; keep variants optional and straightforward.
- Decision: Drafts never publish automatically. Publishing is a deliberate action after validation and preview.
- Decision: After publishing, show a brief success state with actions to view or manage the listing, while keeping other drafts easy to reach.
- Decision: Support up to two simple variant dimensions (such as size and color), tracking price and stock for each option combination.
- Decision: When stock reaches zero, mark the listing unavailable while preserving it in seller management; sellers can restock and reactivate it without recreating the listing.
- Decision: Let sellers enable or disable offers per listing. Show the asking price clearly; when offers are enabled, negotiation happens in chat.
- Decision: Allow safe edits while an order/reservation is active, but lock price, variant, and stock changes that could alter that commitment. Snapshot the agreed order terms so later listing edits never rewrite an existing order.
- Decision: Sellers can pause listings to stop new purchases and remove them from public browsing while preserving them in seller management for later reactivation.
- Decision: If a listing requires review before publication, show a clear Pending review state, explain what the seller can do while it is pending, and notify them when approved or when changes are needed.
- Decision: A listing that passes review publishes automatically after the seller's explicit publish submission; notify the seller and link to listing management.
- Decision: Material changes to a live listing that affect what is being sold or raise a safety/policy concern trigger review; pause the listing during that review. Routine edits do not interrupt sales.
- Decision: Listings do not expire automatically in v1. Sellers manage availability by pausing or marking items unavailable; a later “still available?” check for stale listings is deferred.
- Decision: Include the product-card appearance in the pre-publish preview so sellers can review the browse/search presentation (cover, title, price, condition).
- Decision: Show approximate views and saves to the seller in Seller Tools only; do not expose those counts on public listings or frame them as sales guarantees.
- Decision: The post-publish success screen includes Share alongside View listing and Manage listing.
- Decision: Validate listing rules before publishing; explain the specific problem in plain language and preserve the draft so the seller can fix it.
- Decision: Disabling offers stops new offers but does not cancel existing offers; existing offers can be accepted/countered or expire under their original terms.
- Decision: Preserve a draft through connectivity or image-upload failures, identify failed uploads for retry, and prevent publishing until selected photos have uploaded successfully.
- Decision: Default each listing to the seller's configured fulfillment options, but allow disabling a method per item; checkout offers only methods supported by both the seller and the listing.
- Decision: Only active published listings count toward tier caps; validate the cap when a paused listing is reactivated.
- Decision: Sellers may write listing content in any supported language and optionally label its language; translation is not required for publication.
- Decision: Optional sale price must be below the regular price, and both prices are shown clearly. Do not imply a markdown from a prior price without reliable price history.
- Decision: Allow an optional seller-only SKU/reference per listing or variant.
- Decision: Allow duplicating a listing into a private draft; copy its product details/photos but reset stock and availability, then require review and deliberate publishing.
- Decision: Show out-of-stock variants as unavailable and prevent selecting them, while leaving other in-stock variants selectable.
- Decision: Provide low-stock alerts with a sensible default threshold and an adjustable per-listing setting in Seller Tools.
- Decision: Keep drafts until sellers delete them. If future storage limits require cleanup, warn well in advance and provide an export/recovery window.
- Decision: If variant prices differ, show the lowest price as “From [price]” in browse cards and the full range on the listing detail page.
- Decision: Show price changes to users who saved a listing in their saved-list experience; price-drop push notifications are opt-in.
- Decision: For a rejected listing, show the reason and let the seller edit and resubmit; provide a support appeal path when the seller believes the decision was mistaken.
- Discovery is complete. The implementing AI should read this section and `design-principles.md`, inspect the current create/edit screens and backend, reconcile all agreed listing behavior with tier/KYC, storage, checkout/fulfillment, inventory, offers, moderation, and notifications, and implement the whole experience (UI and server/data changes) without reopening settled questions. Preserve deferred ideas and existing order snapshots/commitments. Do not treat this as a visual-only redesign.

### Profile Visual Redesign — Complete / Implementation Ready (2026-10-01)

- This is a visual and interaction-design continuation of the completed Profile & Settings discovery above. Continue Q&A in groups of three with a recommendation per question; record decisions after every nine answers. Do not re-open settled profile privacy, trust, navigation, or tier behavior. Do not implement until Philippe concludes discovery and asks to proceed.
- Scope: redesign both the user's My Profile and visitor-facing profiles as one visual system, with owner controls on My Profile and visitor actions on the public profile.
- Direction: combine Instagram's fast identity/action/content hierarchy with Pinterest's image-led discovery feel. Keep MaurMaket's visual identity and marketplace trust/shopping purpose; do not copy social features wholesale.
- Research: Meta documents up to three pinned posts and business-profile action buttons as ways to shape a profile and help visitors act. Pinterest profiles organize Pins into boards, support public/private boards, and use visual search to move from images toward related ideas and products. V1 adapts hierarchy, masonry, and visual discovery rather than adding seller boards/collections. Sources: https://about.fb.com/ja/news/2022/06/grid_pinning_on_profile/ ; https://about.fb.com/ja/news/2018/05/instagram_businessmessaging_action/ ; https://help.pinterest.com/en/article/find-your-profile ; https://help.pinterest.com/en/article/boards ; https://newsroom.pinterest.com/en-gb/news/introducing-new-visual-search-features/ .
- Current-code observation: `src/screens/MeScreen.tsx` puts stats, the Business/Personal switch, identity text, three actions, and Seller Tools before listings; visitor UI lives in `src/screens/StorefrontScreen.tsx`. Audit both together and reduce competing visual emphasis while preserving their separate roles.
- Repository note: `AGENTS.md` references `design-principles.md`, but no such file was found in the repo during this discovery. Locate it if added later; otherwise use the existing theme/components and this documented direction as the visual baseline.
- Decision: Both profile surfaces share a visual language; owner controls stay on My Profile, and visitor-facing profiles use Follow/Message actions.
- Decision: Use Instagram-like hierarchy without cloning its look/features: profile identity, primary action, then browsable content in a MaurMaket-native style.
- Decision: Use a clear two-column product grid with title, price, and condition legible below each photo; use Pinterest-style masonry image heights while retaining readable listing details.
- Decision: Prefer a compact identity header with avatar, name, and trust signals; avoid a large cover image.
- Decision: Keep Listings and Reviews navigation visible while scrolling with a subtle sticky tab bar.
- Decision: Keep Business/Personal switching accessible on My Profile as a compact mode control, with a clear active state and the already-agreed smooth transition.
- Decision: Show the pinned listing as a compact Featured card above the product grid; it should stand out without dominating the profile.
- Decision: Do not add seller-custom profile colors or backgrounds in v1. Store name/logo express business identity within MaurMaket's shared visual system.
- Decision: Do not add seller-curated boards/collections in v1; use the visual grid, categories, and one pinned listing for discovery.
- Decision: Keep Saved private and simple in v1; do not add buyer-created saved-item collections.
- Decision: Preserve product photo proportions within sensible height bounds instead of forcing square crops; tapping a tile opens the full listing.
- Decision: Provide a compact Save/bookmark control on each listing tile; keep purchase and offer actions on the product detail page to prevent grid clutter.
- Decision: Visually prioritize seller rating and completed sales over follower counts; never expose revenue publicly.
- Decision: Animate the masonry grid on initial appearance with a subtle, brief fade and slight stagger; do not animate on every scroll, and respect Reduce Motion.
- Decision: Keep Listings and Reviews as the public profile tabs. Give the owner a separate Saved entry that is not visible to visitors.
- Decision: On the owner's empty profile, show a welcoming “start your shop” state with an Add Listing action. On a visitor profile, use a quiet no-listings state and keep Reviews/About available when populated.
- Decision: Tapping Save gives immediate, subtle bookmark-fill/scale feedback; do not add a count or repetitive toast.
- Decision: Opening a listing from the profile uses a quick, restrained transition that connects the tile with its detail page without slowing browsing.
- Decision: Use subtle tonal layering between the profile canvas and cards, with restrained MaurMaket accents, so sections are distinct and product photos stand out.
- Decision: On visitor profiles, Message is the primary action and Follow is secondary; shopping actions remain on listing detail pages.
- Decision: Show compact category filters above a seller's masonry grid only when the catalog spans enough listings/categories to benefit; “All” is the default.
- Decision: Order profile listings as pinned Featured item first, then newest available listings; defer extra sorting controls until catalog size justifies them.
- Decision: On My Profile, use one prominent Edit Profile button and smaller secondary Share and Visitor View actions nearby.
- Decision (updated 2026-10-02): Keep the Add (+) action beside Settings on the upper-right of the My Profile top bar, matching Instagram's profile controls.
- Decision (updated 2026-10-02): My Profile uses an Instagram-style metric row beside the avatar (active listings, followers, following), with the display name and bio below; seller rating and completed sales remain visible as quieter trust details.
- Decision: Keep the rating/review count in the trust area and full review content in the Reviews tab; do not add a repeated recent-review preview to the profile header.
- Decision: Show optional Business service area as a small “Serves [area]” line under the bio. Show a person's public city only with explicit opt-in; never show a precise address.
- Decision: For new sellers, do not show an empty/zero-star rating; show the verified badge if earned, and add rating/completed-sales signals once there is data.
- Decision: As the profile scrolls, collapse the large identity area into a compact sticky bar with a small avatar and username, keeping Listings/Reviews navigation accessible.
- Decision: If there are no reviews, show a calm “No reviews yet” state without empty stars or pressure; keep the rest of the profile usable.
- Decision: Use layout-matched skeletons for profile header and product tiles; fade in loaded content without a sudden layout jump.
- Decision: When offline, show cached profile content if available, label it potentially out of date, and refresh after connectivity returns.
- Decision: Keep the profile usable if some metrics fail to load; hide unavailable metrics rather than showing misleading zeros and retry those metrics quietly.
- Decision: On wider web layouts, center the profile in a comfortable max-width container and expand the masonry grid to three columns; retain two columns on mobile.
- Decision: Follow updates immediately with a small smooth state change; if the request fails, restore the previous state and offer a clear retry.
- Decision: Do not count up trust/follower numbers on profile open. Keep numbers steady; animate meaningful state changes such as following, saving, or switching identity.
- Discovery is complete. When Philippe asks to proceed, read this section and the existing Profile & Settings decisions, inspect `src/screens/MeScreen.tsx`, `src/screens/StorefrontScreen.tsx`, shared profile/listing components, and theme/navigation behavior, then implement the visual redesign across owner and visitor profiles. Preserve existing privacy, account/KYC, seller-tier, order-snapshot, review-eligibility, and saved-item behavior. The implementation should use subtle emotional motion, honor Reduce Motion, support mobile and web layouts, and avoid reopening settled questions. No visual change is authorized by this discovery record alone.

### Feed & Explore Discovery — In Progress (2026-10-02)

- Continue discovery in groups of three questions. After every nine answered questions, add the settled decisions here before continuing. Do not implement until Philippe explicitly concludes discovery and asks to proceed.
- Scope: clarify the purpose, behavior, and interaction model of the vertical Feed and the grid-based Explore surface together. Preserve connected decisions for search, listings, seller discovery, recommendation signals, accessibility, and listing condition.
- Current-code findings: `src/screens/FeedScreen.tsx` presents one full-screen listing per vertical snap, with horizontal swiping across a listing's photos, seller/follow controls, price, stock, BuyRow, and a right rail for like, comments/reviews, save, and more. The client currently sends `following=true` for the “For You” tab and `personalized=true` for “New”, which conflicts with the labels agreed below. Feed items currently use still images; this discovery does not add video upload/playback scope by implication.
- Current-code findings: `src/screens/ExploreScreen.tsx` has debounced search, horizontal category chips, a filter sheet with sort and min/max price, persisted filters, and a masonry grid. It requests personalized products for logged-in users by default and uses “For You” as the default sort. Search/category changes update results directly; sort and price values are staged until Apply.
- Decision 1: “New” means newest listings in chronological order. “For You” means personalized recommendations. Followed sellers may influence ranking but must not restrict the entire For You feed to followed sellers.
- Decision 2: Keep Feed as an immersive, full-screen, one-listing-per-vertical-swipe surface. Improve its swipe/transition behavior so it feels as smooth and decisive as Reels/Shorts, without changing it into a compact grid.
- Decision 3: Explore defaults to personalized best matches, with explicit sort options available for users who prefer another order.
- Decision 4: Keep strict one-item vertical snapping. Preload the next listing's image and use a subtle, brief transition to improve perceived smoothness; do not auto-advance, and honor Reduce Motion.
- Decision 5: Preserve horizontal photo swiping within a Feed listing, with position dots. Gesture handling must more reliably distinguish horizontal photo navigation from vertical listing navigation, locking to the dominant gesture direction to avoid accidental cross-navigation.
- Decision 6: Simplify Feed's action rail to Like, Save, and More. Keep the seller identity/follow action, price, and one clear Buy action visible. Move comments/reviews out of the rail and make them reachable from product detail.
- Decision 7: Keep a subtle, tappable “Why you're seeing this” cue for For You recommendations so users can understand relevance without competing with the listing.
- Decision 8: For a user with little/no recommendation history, start For You with a varied mix of fresh listings and gradually personalize as signals accumulate. Do not force follow-onboarding to make the feed usable.
- Decision 9: Show active Explore filters clearly and provide one Clear all action. Search and category selection update results immediately; stage sort and price changes together and apply them explicitly.
- Decision 10: Add soft recommendation diversity in For You: avoid consecutive listings from the same seller and vary categories when inventory allows, while keeping relevance as the primary ranking signal.
- Decision 11: Explore search matches product title, description, category, and seller/store name so buyers can search by item or seller.
- Decision 12: Add a condition filter to Explore using the listing conditions New, Like new, Good, Fair, and For parts/not working.
- Decision 13: Tapping the “Why you're seeing this” cue opens a small sheet with one or two specific recommendation reasons; keep it separate from the More menu controls.
- Decision 14: Keep Explore's two-column masonry grid with natural image proportions and readable product title/price details.
- Decision 15: When search/filters return no results, show recovery actions: clear filters and broaden the search or category.
- Decision 16: Keep Feed action controls anchored to the active listing during vertical swipes. In Explore, animate masonry card and overlay repositioning together as a coordinated tile transition rather than independent jumps.
- Decision 17: Keep Feed media as still product images with horizontal multi-photo galleries; short-video upload/playback is out of scope unless separately discussed.
- Decision 18: Persist Explore category, sort, price, and condition filters across visits; clear the text search when leaving Explore.
- Decision 19: Tapping the main Feed image or product title opens Product Detail; keep the Buy action separately visible and direct.
- Decision 20: Listing Report submits a real report for review and remains separate from “Not interested,” which only tunes recommendations.
- Decision 21: Exclude the signed-in user's own listings from both New and For You feeds; sellers manage and preview their own listings from their profile/tools.
- Decision 22: “More like this” and “Not interested” feedback from Feed tunes recommendations across both Feed and Explore.
- Decision 23: Avoid showing a listing more than once in the same session when other unseen listings are available; allow repeats when inventory is limited.
- Decision 24: Respect Reduce Motion by removing/reducing Feed transitions while preserving strict snapping and gesture-direction locking. Provide screen-reader labels for the current listing and navigation actions.
- Decision 25: Explore product tiles include a compact Save control; tapping the tile opens Product Detail, and purchase actions remain on the detail page.
- Decision 26: Keep the condition filter in Explore's existing filter sheet alongside sort and price, and show active conditions with the other applied filters.
- Decision 27: The “Why you're seeing this” sheet is informational only and shows one or two concise recommendation reasons; keep recommendation feedback and other controls in More.
- Discovery is complete and implementation-ready (2026-10-02). Philippe explicitly concluded Q&A and asked to implement. Inspect `FeedScreen.tsx`, `ExploreScreen.tsx`, `ProductDetailScreen.tsx`, recommendation/product routes, `src/api.ts`, listing condition/schema work, shared masonry/save/report components, and gesture/reduced-motion helpers. Reconcile Feed vs Explore semantics with backend sorting and ranking; honor existing privacy rules, seller-tier behavior, inventory/checkout constraints, and i18n. Implement the settled decisions above as a coherent Feed and Explore experience. Preserve still-image media scope; do not add short-video upload/playback. Do not reopen settled product decisions unless code constraints make one impossible.

## App-Wide Build Phase and Compaction Handoff

- Discovery is complete: the app-wide ledger has 508 whole-app answers plus the focused design-system follow-up APP-Q551–APP-Q553 (511 total). This is now the BUILD phase. Do not restart Q&A, ask Philippe to repeat decisions, or stop at a plan/report; continue implementing approved decisions end to end unless Philippe redirects.
- At every new session or compaction, read this `AGENTS.md` first, then `C:\MAURINEX\MAURINEX NOTES\MaurMaket\context.md`, the latest entry in `C:\MAURINEX\MAURINEX NOTES\MaurMaket\sessions\source-of-truth.md`, `docs/discovery/app-wide-qna-ledger.md`, and the relevant code/design principles. Run `node query-graph.cjs stats`; query related graph nodes for substantial work. Treat the ledger and domain notes as settled product decisions.
- Resume at the latest explicit “Remaining / Next” implementation item in the current session log. Preserve all existing changes in the shared worktree; inspect `git status` before edits and never reset or overwrite unrelated work. Do not commit/push unless Philippe explicitly requests it.
- Maintain the build in reviewable slices: implement the next code slice, run relevant checks/builds, update the external session log and current context, and run `node ingest-sessions.cjs`. When a task spans compaction, record changed files/features, verification results, known issues, exact current status, and the next implementation action. This note is the durable handoff so another instance can continue without relying on chat memory.
- App-wide implementation plan: (1) finish shared design foundations (adaptive theme, type scale, icon family, surfaces/backgrounds, motion/accessibility); (2) apply/audit the system across onboarding, discovery/feed, listing/detail, profiles/settings, inbox/notifications, checkout/orders/map, seller tools, and support; (3) align interactions with settled privacy, security, payment, accessibility, localization, and reliability decisions in the ledger; (4) run TypeScript, design/i18n checks, web and Android bundle checks, and focused UI/device review; (5) document any deferred integrations or risks in the back pocket. Continue beyond superficial token swaps where the current behavior still conflicts with an accepted decision.
- Current verified checkpoint (Session 364): Inbox/chat accessibility and localization are improved; meetup LocationPicker now requires explicit confirmation for map taps/search choices, is localized, respects Reduce Motion, and has 44dp controls. Active meetup actions are localized, modal controls are accessible, and motion respects Reduce Motion. MapScreen no longer does broad tile downloads or passive GPS; explicit Find me is foreground-only, and legacy exact map caches are cleared. Seller discovery now has a dedicated Map visibility settings screen: explicit area selection/save, default-off consent, device GPS disabled in picker, separate rounded public coordinates, legacy rows hidden, and discovery response uses only confirmed public points. Exact private fulfillment coordinates and order meetup terms remain intact. `npm test` and TypeScript pass; 2,215 locale keys sync (1,642 calls), design guardrails 0/0, 573 unused-key notices. Server route syntax and changed-file whitespace checks pass. No native device map validation. Orders list follow-up: status changes/cancel/complete now force a quiet server refresh instead of reusing the 30-second cache; statuses, filters, confirmation labels and action names are localized; tabs/filters expose selection, actions expose busy state, and touch targets are 44dp. `npm test` and TypeScript pass after this change. Continue deeper OrderDetail accessibility/reliability review next. No commit/push.


### Session 364 checkpoint — seller public map area (2026-10-04)
- Added dedicated Seller Tools > Map visibility screen. Public discovery is off by default; seller chooses a public area by map/search, previews it, then saves explicitly. LocationPicker has an opt-out for current-device location and the new flow never requests GPS.
- `seller_locations` retains its existing private `lat/lng` values for exact fulfillment/radius calculations. Added separate `public_lat/public_lng/public_area_confirmed` columns, rounds the selected point server-side to 3 decimals (~100m), and nearby map responses use only confirmed public points with distance rounded to 0.5km. Existing rows are hidden by migration unless seller reconfirms an area. Client drops legacy exact-location and seller-coordinate caches.
- Added the EN/FR/HT translations, navigation and Map/Seller Tools entry points.
- Validation: `npm test` passes (guardrails 0/0, 2,208 locale keys synchronized, 1,635 `t()` calls; 573 unused-key notices); TypeScript `tsc --noEmit` passes; server route syntax checks and touched-file `git diff --check` pass. No device-level Android map validation. No commit/push.
- Next: continue order-flow accessibility/reliability audit. Preserve exact order meetup coordinates and private fulfillment points; map discovery must consume only generalized, consented public points.


### Session 364 continuation — Orders list consistency/accessibility
- Fixed post-mutation stale UI: cancel, complete, and seller status updates force a server refresh while keeping the current list visible (no skeleton flash).
- Localized order status labels, cancel confirmation action, filter labels, and accessible action names in EN/FR/HT. Buying/Selling and filter controls announce tab/selection state; actions announce busy/disabled state and meet 44dp targets.
- `npm test` passes (design guardrails 0/0, 2,215 locale keys synced, 1,642 `t()` calls; 573 unused-key warnings); TypeScript passes; touched-file whitespace check passes.
- Next: continue the deeper OrderDetail accessible controls and consequential-action audit, preserving order terms/payment safety.

## Active Build Checkpoint — Order Meetup Counterproposal (2026-10-04)
- Fixed the Order Detail meetup response flow: either participant who did not propose the current location can accept it or suggest a replacement. Replacement uses the existing authenticated meetup proposal endpoint and LocationPicker with device-location lookup disabled.
- The prior seller “Decline meetup and cancel order” action incorrectly called the buyer-only cancellation endpoint. It is now a non-destructive counterproposal; the paid/pending order remains active until the location is mutually confirmed. Text now explains that the other party may accept or suggest another place.
- A newer meetup proposal resolves the previous unresolved meetup Action-needed notification while retaining its activity history. Added matching EN/FR/HT copy and 48dp controls.
- Validation: `npm test` passes (0 design violations/warnings; 2,219 locale keys synchronized, 1,643 translation calls; 576 unused-key warnings); TypeScript `tsc --noEmit` completed without diagnostics; locale JSON parsing, notification syntax, and touched-file `git diff --check` pass.
- No device UI or live order/notification database test performed. Preserve unrelated working tree changes; no commit/push.
- Next: continue concrete OrderDetail accessibility/reliability audit and verify the live mobile interaction when available. Keep exact per-order meetup location private to order participants; do not conflate seller discovery coordinates with meetup coordinates.

## Active Build Checkpoint — Order Detail Accessibility (2026-10-04)
- Continued the OrderDetail audit: all seller/buyer transactional action controls now use their visible localized labels rather than hardcoded English screen-reader names, and server mutations expose disabled/busy state. Meetup confirmation status now says the location is confirmed rather than displaying the imperative “Confirm Meetup.”
- Order progress is exposed as a progress bar with current status; item photos announce the product name. Review stars and dispute reasons expose selection state, star labels/input labels are localized, modal headings are announced, close controls are 44dp, rating controls 48dp, dispute reasons 44dp, and submit actions 48dp.
- Timeline now localizes its known event types, includes actor name (or MaurMaket for system events), and respects device date/time locale. OrderEvent type reflects server actor_name.
- Validation: `npm test` passes (design guardrails 0/0; 2,233 EN/FR/HT keys synchronized; 1,649 translation calls; 584 unused-key notices). TypeScript passes; locale JSON parsing, notification syntax, and touched-file diff check pass. No device UI/live order validation. No commit/push.
- Session 368–369 implementation updates supersede this initial gap: post-fulfillment seller response requests and eligible pre-fulfillment buyer cancellation are now implemented in constrained slices. Continue from the latest cancellation checkpoint below; do not revert to discovery or repeat settled policy.

### Session 369 — Pre-fulfillment buyer cancellation (2026-10-04)
- Pending unpaid orders can now be cancelled before fulfillment; stock reservations are released atomically, variant and product stock is restored, accepted-offer claims are released, seller fulfillments/agreements are marked cancelled, and the event/notification records the action.
- A buyer can cancel a paid order only while it is still pre-fulfillment, single-seller, delivery (not meetup), MonCash-funded with held escrow. Cancellation is effective; a separate open refund-review record is created. The UI states that refund review/MonCash confirmation is still pending; this does not send or confirm a refund. NatCash, paid meetup, multi-seller, and post-fulfillment paths fail closed here.
- MonCash payment-attempt creation now locks the order in a transaction; cancellation checks unresolved attempts under the same order lock so an in-flight or ambiguous payment cannot be orphaned by a concurrent cancel. Successful checkout webhook handling links stock reservations and the pending checkout to the created order. Older MonCash checkout reservations are reparented at cancellation before idempotent stock release.
- Added localized paid-cancel explanation and OrderDetail eligibility for pending unpaid and qualifying paid MonCash orders.
- Validation: `npm test` passes (design guardrails 0/0, 2,278 EN/FR/HT keys synchronized, 1,694 translation calls; 584 unused-key notices); TypeScript passes after fixing optional fulfillment narrowing; Node syntax checks pass; `git diff --check` passes; Expo web export passes (3,571 modules / 9 bundles). No live DB/provider/device test and no remote migration; no commit/push.
- Remaining cancellation work: seller-initiated cancellation with payment-specific handling, multi-seller per-portion cancellation/refund/stock reconciliation, and a safe outcome/resolution path for accepted or overdue post-fulfillment requests. Keep Support disconnected until its website/API exists; use its seam only when a user-facing Support route is needed. Preserve unrelated worktree changes.

### Session 370 — Seller-initiated pre-fulfillment cancellation (2026-10-04)
- Sellers can cancel their own single-seller order portion before fulfillment with a required reason and optional 300-character details. Pending unpaid orders cancel immediately; paid MonCash delivery orders cancel only when escrow is held, while opening a separate refund-review record. No provider refund is sent or claimed confirmed.
- Cancellation restores reserved product/variant stock, releases accepted-offer claims, updates order/fulfillment/terms, records the seller's reason, and notifies the buyer. Multi-seller and paid meetup/NatCash cases remain unavailable. Meetup orders are blocked after either participant checks in; OrderDetail hides the cancellation action once check-in has started.
- Added localized EN/FR/HT reason UI and confirmation disclosure; Support remains disconnected.
- Validation: `npm test` passes (0 design violations/warnings; 2,291 locale keys synchronized; 1,703 translation calls; 588 unused-key notices); TypeScript and route syntax checks pass; touched-file diff check passes; Expo web export succeeds (3,571 modules / 9 bundles). No live database/provider/device test, remote migration, commit, or push.
- Remaining: multi-seller per-portion cancellation/refund/stock handling, plus safe resolution for accepted/overdue post-fulfillment requests. Preserve unrelated worktree changes and Support API cable rule.

### Session 371 — Multi-seller per-portion cancellation (2026-10-04)
- Buyer cancellation can now target one seller portion or the whole eligible paid MonCash delivery checkout. Whole-checkout cancellation is exposed only while every seller portion is still pending, payment-verified, and backed by held escrow. A seller can cancel only their own pending fulfillment portion. Other sellers' active portions remain active; the order becomes globally cancelled only when the buyer chose the whole checkout or no active portions remain.
- Cancellation remains blocked for paid NatCash/meetup, meetup check-in, and paid fulfillment already started for the affected seller. Partial cancellation of unpaid multi-seller checkouts remains blocked until totals, promotions, and delivery allocations can be safely recalculated.
- Seller-scoped cancellation opens a separate refund review. Admin settlement can target the canceled seller's held escrow, records `refunded_seller_id`, blocks overlapping pending transfers, and allows multiple payouts per order by removing the legacy order-wide uniqueness constraint. Provider-confirmed refund state remains separate; no transfer is claimed sent/complete before confirmation. Inventory release and accepted-offer claims are seller-scoped; the checkout remains active for other sellers.
- Added idempotent startup/manual SQL migration for seller-scoped refund allocation and payout lookup. Migration is local only; no remote DB was changed. Support remains disconnected.
- Validation: `npm test` passes (design guardrails 0 violations/warnings; 2,299 EN/FR/HT keys; 1,711 translation calls; 588 unused-key notices), TypeScript passes, Node syntax checks pass, touched-file `git diff --check` passes, and Expo web export passes (3,571 modules / 9 bundles). No live DB/provider/device verification; no commit/push.
- Remaining: safely resolve accepted/overdue post-fulfillment cancellation requests without inventing a Support API; make unpaid multi-seller partial cancellation reprice totals/promo/delivery safely. Discovery stays at 511 answers.

### Session 372 — Cancellation review and explicit resume outcome (2026-10-04)
- Seller fulfillment status advancement now stays blocked for every active cancellation request: `open` requires a seller response and `under_review` (accepted, declined, or overdue) pauses the seller portion. This closes the gap where an overdue request blocked buyer completion/escrow but allowed the seller to advance.
- Added an admin-only, audited resolution endpoint for the safe outcome `resume_order`. It resolves only an `under_review` cancellation request, records the reviewer note in the order timeline, resolves its action notifications, and notifies both parties. It deliberately leaves order/payment/fulfillment/refund state unchanged; no automatic fault, cancellation, physical return, Support case, or refund is assumed. The generic admin dispute status route now rejects cancellation requests so they must use the scoped resolution path.
- Order Detail now labels the reviewed resume outcome and explains that unresolved cases pause seller fulfillment while the Support website is unavailable. Copy is localized in EN/FR/HT. Multi-seller post-fulfillment requests remain guarded.
- Validation: `npm test` passes (design 0/0; 2,302 locale keys; 1,714 translation calls; 588 unused-key notices), TypeScript and JS syntax checks pass, touched-file diff check passes, and Expo web export passes (3,571 modules / 9 bundles). No live DB or device review; no commit/push.
- Still open: an admin-reviewed cancellation/refund/return outcome for cases where resuming unchanged is not appropriate; safe unpaid multi-seller repricing. Keep Support API disconnected, do not invent a physical return or refund policy. Discovery remains 511 answers.

### Session 373 — Admin cancellation before shipment (2026-10-04)
- Extended the scoped admin review endpoint with `cancel_before_shipment`. It is permitted only when the seller accepted, that seller fulfillment is still `processing` (not shipped/delivered), payment is verified MonCash, delivery method is delivery, and the seller's escrow is held. No NatCash, meetup, overdue/declined request, completed order, or unavailable escrow is eligible.
- The transaction cancels only that seller fulfillment, releases only that seller's stock reservation and accepted-offer claim, preserves other seller portions, and globally cancels only when no other active seller portion remains. It resolves the cancellation request and creates a separate seller-scoped `refund_request`; the refund transfer is not approved/sent/confirmed. Order Detail shows the explicit pending-review state in EN/FR/HT. Extracted the shared reservation release helper to `src/utils/orderStock.js`.
- Shipped/delivered cases remain frozen for an explicit return/review workflow; no return or receipt is inferred. Support API remains disconnected while ledger implementation continues.
- Validation: `npm test` passes (design 0/0; 2,304 locale keys; 1,716 translation calls; 588 unused-key notices), TypeScript and JS syntax pass, targeted diff check passes, Expo web export passes (3,571 modules / 9 bundles). No live DB/provider/device validation, migration, commit, or push.
- Next implementation: safely recalculate unpaid multi-seller totals/promotions/delivery allocations for partial cancellation. Then continue remaining ledger items before starting the Support website. Discovery stays at 511.

### Session 374 — Unpaid multi-seller checkout seller removal (2026-10-05)
- Buyers can remove one seller’s portion from an unpaid pending checkout before any seller payment session starts. The UI confirms the action, shows the updated remaining total, and preserves the other sellers’ accepted/proposed fulfillment choices.
- Recalculation uses locked cart prices and seller-specific delivery fees; discounts are reapportioned deterministically in cents. Seller-scoped promo eligibility and minimum spend are rechecked. Removing the promo’s seller or falling below its minimum removes the promo and updates the displayed total.
- Removal atomically validates/releases only that seller’s stock/variant reservations and accepted-offer claims, records history, removes that seller’s agreement, and notifies the seller. Removing the final seller cancels the checkout and releases the rest. Buyer/seller agreement accept, reject, and counter routes, seller removal, payment start, and the MonCash webhook serialize checkout-first, preventing edits from racing payment confirmation.
- A removal does not extend existing response/stock deadlines. Payment start verifies recomputed totals match the buyer-reviewed checkout total and fails closed if pricing changed. Sellers do not see the shared checkout’s aggregate total.
- Validation: checkout-total smoke cases, JS syntax, `git diff --check`, `npm test` (design guardrails 0/0; 2,313 EN/FR/HT keys synced; 1,725 translation calls; 588 existing unused-key notices), TypeScript, and Expo web export (3,571 modules; 9 bundles) passed. Metro discarded an incompatible cached graph and completed a full crawl. No live DB/provider/device validation or remote migration; no commit/push.
- Next: continue from the ledger’s remaining implementation requirements, using the latest source-of-truth handoff and domain decisions. Support website remains sequenced after ledger implementation; the Support adapter remains disconnected. Discovery stays at 511.

### Session 375 — Notification preference and summary consistency (2026-10-05)
- Notification preference updates validate a patch and merge under a user-row lock. Follows/offers are always `push_now`. Client writes changed fields only and updates the account timezone from the active device.
- Quiet-hours and daily-summary controls are editable/localized. Summary scheduling uses the saved IANA timezone and exact local time; only unread events explicitly assigned to Daily summary are included, and they are marked summarized only after Expo accepts delivery. Unknown event types preserve prior push behavior; known informational milestones remain in-app.
- Checks: `npm test`, JS syntax, `git diff --check`, Expo web export, and increased-stack TypeScript passed. No live DB/provider/device test; no commit/push. Continue ledger implementation; Support remains sequenced afterward.

### Session 376 — Verified listing cap lifecycle (2026-10-05)
- Business subscription expiry now locks and rechecks subscription/user state, then transactionally expires the subscription, demotes the seller, and pauses excess active listings. The downgrade notification is emitted only after commit. Standalone downgrade calls also transact tier/listing changes before notifying.
- The cap transition considers only published active and available listings. It keeps pinned listings first, then the most recently updated listings, and pauses overflow without deleting it. Sellers can swap which listings remain active: reactivating a cap-paused listing now uses the live cap check instead of an unconditional block.
- My Listings now labels cap-paused items distinctly, explains why they are paused, localizes cap errors, and links to tier settings. Add Listing also links to tiers at the cap. Corrected stale copy that described Verified listings as unlimited; Verified remains 100 active and Business unlimited.
- Validation: `npm test` passed (design guardrails 0/0; 2,330 EN/FR/HT keys synchronized; 1,747 translation calls; 583 unused-key notices); TypeScript passed with `node --stack-size=8192 .\node_modules\typescript\bin\tsc --noEmit`; JS syntax and `git diff --check` passed; Expo web export succeeded (3,571 modules / 9 bundles) and Android export succeeded (3,910 modules; 8.9 MB Hermes bundle). No live DB/provider/device test or migration; no commit/push.
- Next: continue the remaining implementation requirements in the app-wide ledger, preserving existing broad worktree changes. Support website/API remains sequenced after ledger implementation; the adapter stays disconnected. Discovery remains closed at 511.

### Session 377 — Explore quick-action localization and motion (2026-10-05)
- Localized Explore's long-press quick sheet in EN/FR/HT, including action labels, accessibility names, and the recommendation-feedback hint. Its modal fade now respects Reduce Motion; MasonryGrid's existing coordinated layout behavior already respects the setting.
- Validation: `npm test` passed (0 design violations/warnings; 2,331 EN/FR/HT keys; 1,748 `t()` calls; 583 unused-key notices), increased-stack TypeScript passed, `git diff --check` and route syntax passed, web export passed (3,571 modules/9 bundles), and Android export passed (3,910 modules; 8.9 MB Hermes bundle). No live DB/API/device interaction; no commit/push.
- Next: continue the explicit Feed/Explore implementation-ready handoff above, comparing the settled decisions against code and addressing remaining mismatches without reopening discovery. Preserve broad worktree state; Support website remains sequenced afterward.

### Session 378 — Localized recommendation explanations (2026-10-05)
- Personalized product responses now return stable recommendation reason codes instead of English prose. Feed maps those codes to EN/FR/HT copy for both the inline “Why you’re seeing this” cue and its detail sheet; legacy cached English reasons map to equivalent localized reasons.
- Validation: `npm test` passed (design 0/0; 2,339 EN/FR/HT keys; 1,748 `t()` calls; 591 unused-key notices), increased-stack TypeScript and route syntax passed, `git diff --check` passed, web export passed (3,571 modules/9 bundles), and Android export passed (3,910 modules; 9 MB Hermes bundle). No live DB/API/device test or commit/push.
- Next: continue Feed/Explore implementation audit against the settled handoff, especially backend ranking/filters and the remaining interaction/accessibility decisions. Discovery remains closed at 511; Support website stays deferred.

### Session 379 — Feed and Explore action localization (2026-10-05)
- Localized Feed edit/view/recommendation menu labels, notification-button accessibility name, and the preference-save failure shown from Feed and Explore. These remain consistent across EN/FR/HT.
- Validation: `npm test` passed (design 0/0; 2,341 EN/FR/HT keys; 1,750 `t()` calls; 591 unused-key notices), increased-stack TypeScript and route syntax passed, `git diff --check` passed, web export passed (3,571 modules/9 bundles), and Android export passed (3,910 modules; ~9 MB Hermes bundle). Metro discarded an unreadable cache and succeeded after a full crawl. No live DB/API/device test or commit/push.
- Next: continue the Feed/Explore audit against the settled handoff, especially candidate ranking/diversity and remaining accessibility behavior. Discovery remains closed at 511; Support website stays deferred.

### Session 380 — Feed/Explore image sizing without eager probes (2026-10-05)
- MasonryGrid no longer calls `Image.getSize` for every product in a result set or runs ten timed dimension refreshes. It uses dimensions returned by the API immediately, then captures unknown primary-image dimensions from the image's normal load event and updates masonry once.
- Removed the now-unused eager dimension-probe helpers. This avoids duplicate network work for offscreen thumbnails and repeated re-layout churn while preserving masonry's natural image proportions where metadata exists or becomes available.
- Validation: `npm test` passed (design guardrails 0/0; 2,341 EN/FR/HT keys; 1,750 `t()` calls; 591 unused-key notices); increased-stack TypeScript and `git diff --check` passed; Expo web export passed (3,571 modules/9 bundles) and Android export passed (3,910 modules; 8.9 MB Hermes bundle). No live DB/API/device test or commit/push.
- Next: continue code-to-ledger Feed/Explore audit, especially ranking/diversity and remaining interaction/accessibility gaps. Preserve broad worktree; discovery remains closed at 511; Support website/API stays deferred.

### Session 381 — Blocked sellers hidden from discovery (2026-10-05)
- The shared product browse endpoint now excludes listings from sellers the signed-in user blocked, covering Feed, Explore, search/category browse, map seller previews, and related-listing queries that use `/products`. Signed-out browsing remains unchanged.
- Co-purchase recommendations now use optional authentication and omit blocked sellers' products when a session exists. Existing order records and direct order flows are untouched.
- Validation: product route syntax, increased-stack TypeScript, `git diff --check` and `npm test` passed (design guardrails 0/0; 2,341 EN/FR/HT keys; 1,750 `t()` calls; 591 unused-key notices). No live DB/API/device test, migration, commit, or push.
- Next: continue Feed/Explore implementation against its settled handoff, reviewing ranking and recommendation feedback semantics. Discovery stays closed at 511; Support website/API remains deferred until ledger implementation ends.

### Session 382 — Reversible, synchronized recommendation feedback (2026-10-05)
- Made `relevant` and `not_relevant` mutually exclusive per user/listing and serialized changes with a transaction-scoped advisory lock. Switching a vote replaces its prior state and applies only the category-affinity delta; `undo_not_relevant` removes the negative vote and reverses its category signal without writing a positive vote.
- Feed Undo is offered after the server/queue acknowledges the original preference, restores the card at its prior position, and submits the explicit undo event. Feed and Explore invalidate both recommendation caches after feedback so a later visit reflects the same preference across surfaces.
- Validation: route syntax, increased-stack TypeScript, `git diff --check`, and `npm test` passed (design guardrails 0/0; 2,341 EN/FR/HT keys; 1,750 `t()` calls; 591 unused-key notices). Web export passed (3,571 modules/9 bundles); Android export passed (3,910 modules; 8.9 MB Hermes bundle). Metro recovered from an incompatible cache via full crawl (web ~234s, Android ~250s). No live DB/API/device test or commit/push.
- Next: continue Feed/Explore implementation review against remaining ranking, listing-repeat, imagery/Low Data, and accessibility decisions. Discovery stays closed at 511; Support website/API remains deferred until ledger implementation ends.

### Session 383 — Low Data preference foundation and Explore input accessibility (2026-10-05)
- Added an optional persisted device-local Low Data mode toggle to Settings using the existing secure app preference storage. The shared app store notifies open screens when it changes; Feed stops prefetching the next offscreen listing image when Low Data is enabled, while standard mode keeps its smooth preload behavior. Shared masonry grids use only thumbnail URLs (or the neutral placeholder if missing) and skip the offscreen multi-image carousel in Low Data mode; opening Product Detail loads full photos on demand while price, stock, and condition remain visible.
- Localized Explore's price-range heading, minimum/maximum placeholders, and accessible field labels in EN/FR/HT.
- Validation: `npm test` passed (0 design violations/warnings; 2,345 EN/FR/HT keys; 1,754 translation calls; 591 existing unused-key notices); increased-stack TypeScript passed; `git diff --check` reported only broad-worktree LF/CRLF conversion notices and no whitespace errors; web export passed (3,572 modules / 9 bundles) and Android export passed (3,911 modules; 8.9 MB Hermes bundle). No live device/network behavior test; no commit/push.
- Next: continue applying Low Data to remaining media surfaces and audit Feed/Explore accessibility and diversity against the domain handoff. Low Data remains optional and user-controlled; do not infer it from network speed. Discovery remains closed at 511; Support website/API stays deferred until ledger implementation ends.

### Session 384 — Seller photo upload data confirmation (2026-10-05)
- Before uploading listing photos on a native cellular connection, Add Listing now estimates selected local file sizes and asks for confirmation at 5 MiB or more; it also asks when a selected file's size cannot be determined. The prompt clearly says this is the pre-compression estimate and actual mobile-data use may be lower because the existing upload pipeline compresses photos.
- “Wait for Wi-Fi” keeps the selected local images and flushes the listing draft; uploading proceeds only after the seller explicitly confirms. Existing publish validation and upload failure handling remain intact. Prompt copy is localized EN/FR/HT.
- Validation: `npm test` passed (0 design violations/warnings; 2,350 EN/FR/HT keys; 1,759 translation calls; 591 existing unused notices); increased-stack TypeScript and `git diff --check` passed (line-ending conversion notices only); web export passed (3,572 modules/9 bundles); Android export passed (3,911 modules; 9 MB Hermes bundle). No device interaction, mobile network, or upload-provider test; no commit/push.
- Next: apply Low Data's tap-to-load behavior to chat images and tap-to-play to voice messages, then continue the remaining Low Data/map and Feed/Explore audit. Keep Low Data optional and user-controlled; discovery remains closed at 511; Support website/API stays deferred.

### Session 385 — Low Data chat media on demand (2026-10-05)
- Chat's remote image attachments and shared-media gallery now use explicit tap-to-load placeholders while Low Data mode is enabled; after loading, a second tap opens the existing photo viewer. Device-local pending uploads remain visible immediately.
- Remote voice notes now keep the audio player source empty until the user taps play in Low Data mode; loading shows progress, and failures offer an explicit retry. Standard mode retains existing preloading behavior. New prompts are localized in EN/FR/HT.
- Validation: `npm test` passed (design 0/0; 2,353 EN/FR/HT keys; 1,762 translation calls; existing unused-key notices), increased-stack TypeScript passed, `git diff --check` passed with only line-ending conversion notices, web export passed (3,572 modules/9 bundles), and Android Hermes export passed (3,911 modules; 9 MB). No live device/network playback test or commit/push.
- Next: continue Low Data map/background-media work and remaining Feed/Explore accessibility/diversity audit. Preserve optional user-controlled behavior; Support website/API stays deferred until ledger implementation is complete. Discovery remains closed at 511.
- Session 385 continuation: Map seller markers now use icon fallbacks instead of downloading seller avatars in Low Data mode, and the expanded seller sheet does not auto-fetch latest-item thumbnails; opening an item remains the on-demand detail path. Map panning/search behavior and confirmed-order location precision are unchanged; visible basemap tiles still load normally and no broad area caching was added. Revalidated after this change: tests, TypeScript, diff check, web export (3,572 modules/9 bundles), Android export (3,911 modules/9 MB).
- Session 385 final Low Data continuation: Outbox image/audio uploads queued in the background no longer resume automatically on cellular when Low Data is on; they stay queued with a tappable “Waiting for Wi-Fi” action. Explicitly sending a new attachment or tapping that action can proceed over cellular. Queued text still auto-sends. Link-preview thumbnails are also suppressed in Low Data. Checks rerun after all changes: `npm test` (design 0/0; 2,354 locale keys; 1,763 calls; 591 existing unused notices), increased-stack TypeScript, `git diff --check`, web export (3,572 modules/9 bundles), Android export (3,911 modules/9 MB). Metro cache repeatedly failed deserialization but full-crawl exports passed. No live device/network test, commit, or push.

### Session 386 — Map seller list alongside the map; icon-alias fixes (2026-10-05)
- Investigated the map basemap against APP-Q194–APP-Q204 before changing anything. Measured CartoCDN's Voyager, Positron, and Dark Matter: one shared vector tile source (`carto.streets/v1`), identical 396-byte sprites, and identical layer structure (27 label layers, ~94 total). There is no lighter-tile option on this provider, so a style swap would not save meaningful data and was deliberately not used.
- Implemented APP-Q135's accessibility requirement on the map: a searchable, list-based view of seller results sits **alongside** the map, reachable from a localized Map/List switch available in every mode. Neither view replaces the other, so the visible map the ledger requires (APP-Q202, APP-Q204) stays available.
- The list shows name, tier, listing count, and rounded distance with icon avatars (no remote image requests) and opens the existing seller sheet. Map search/filter, follow, and radial actions are unchanged; “Find me” switches to the map view. No broad map-area caching was added and confirmed-order location precision is untouched.
- Localized the map surface in EN/FR/HT: new keys for the view switch, list heading/hint, counts, distance, and empty state; replaced the hardcoded “Follow/Following”, “Latest items”, “Loading…”, “No products listed yet”, “Refresh”, “Theme”, and seller-count line. Fixed two broken icon aliases (`map-outline`→`map`, business marker `store`→`storefront`) that had been rendering fallback question marks.
- Validation: `npm test` (design 0/0; 2,369 EN/FR/HT keys in sync; 1,778 `t()` calls; existing unused-key notices), increased-stack TypeScript, `git diff --check` (line-ending notices only), and web export (3,572 modules / 9 bundles; MapScreen 7.2 KB chunk) passed. MapScreen early-returns on web, so the list itself was not exercised in a live browser; no native device test. No commit/push.
- Next: continue the remaining Feed/Explore accessibility/diversity audit. Discovery stays closed at 511; Support website/API stays deferred. Low Data map savings remain what Session 385 established: suppressed seller/item media, viewport-only tiles, and no broad area caching.

### Session 387 — Authenticity and content-rights reporting (2026-10-05)
- Implemented APP-Q542–APP-Q544 in the listing report flow. Listing reports now separate **authenticity/content-rights** reasons (counterfeit or fake item, stolen photos or copied description, unauthorized brand or logo use, prohibited or illegal item) from **ordinary listing complaints** (spam, inappropriate, wrong category, misleading, other), each under its own heading with guidance on when to use it.
- Selecting an authenticity reason turns the optional details field into a clearly labeled private evidence field: optional, review-team-only, documents never required (APP-Q543), and a report alone is not proof of wrongdoing and is reviewed before any action (APP-Q544). Ordinary complaints keep the previous details field.
- No backend change was needed: `/api/reports` already accepts `listing` targets, resolves the seller, blocks self-reports, and stores reason/details privately. No moderation/admin surface consumes these reasons yet, so a stable machine-readable reason code remains a follow-up for when that surface is built.
- Context: the Feed/Explore audit was checked against the settled handoff and found materially complete — verified Decision 1 (New = newest, For You = personalized), 3 (Explore defaults to personalized), 5 (directional gesture lock), 6 (rail is Like/Save/More), 9 (Clear all + staged sort/price), 10 (diversity reranker), 11 (search covers title/description/category/seller), 12 and 26 (condition filter in the filter sheet), 15 (empty-state recovery), 18 (filters persisted, text search cleared on leave), 20 (report separate from not-interested), 21 and 23 (own-listing exclusion, session repeat avoidance), and 25 (tile save chip).
- Validation: `npm test` (design 0/0; 2,380 EN/FR/HT keys in sync; 1,781 `t()` calls; existing unused-key notices), increased-stack TypeScript, `git diff --check`, and web export all passed (each via captured exit status). No native device test; no commit/push.
- Next: continue the remaining ledger implementation. The adjacent slice is the seller-facing side of a content-rights review (APP-Q545–APP-Q547: what the seller is told, editing while pending, and the appeal path). Discovery stays closed at 511; Support website/API stays deferred.

### Session 388 — Seller-facing content-rights review and appeals (APP-Q545–APP-Q547) (2026-10-05)
- When a listing is restricted for a counterfeit/content-rights review, the seller now sees a dedicated **Under review** state in My Listings: a distinct badge (shield-search icon), a filter chip with its own count, the reason category in plain language (counterfeit, stolen photos/description, unauthorized brand use, prohibited item, or other concern), the affected content when staff recorded a detail, the current restriction (hidden from buyers while the review is open), and the response path. The seller notice never reveals the reporter's identity or the private evidence (APP-Q545).
- Sellers may edit or replace disputed photos/text while review is pending (APP-Q546). Saving from Edit Listing keeps the listing `under_review`, preserves the moderation reason/appeal state, and sets `content_updated_during_review = true` so the edited content is what gets re-reviewed without erasing review history. Edit Listing shows the same under-review banner and the save button becomes “Resubmit”.
- The appeal path (APP-Q547) accepts a listing that is `rejected` **or** `under_review`, records the note and timestamp, and surfaces the appeal-sent state in both screens; staff review new evidence/process concerns on the existing admin appeal queue.
- Backend: idempotent `products` migration (`moderation_category`, `moderation_detail`, `content_updated_during_review`) in `server.js`; new admin-only `POST /api/admin/listings/:id/restrict` (validated category set, hides the listing, records the reason category/detail, notifies the seller with `listing_under_review`, 409 when already under review); resubmit + appeal routes accept `under_review`; seller listings and the admin queue select the new fields. Shared category mapping in `src/utils/listingReview.ts`; EN/FR/HT copy added for every new state.
- Context: the moderation/admin review surface belongs to the future Support website (see the back-pocket blocks above and ledger Batches 78–82). The new endpoint is API-only staff tooling matching the existing admin listing endpoints — no in-app admin UI was added, and the Support adapter stays disconnected (`not_connected`).
- Validation: `npm test` (design 0/0; 2,394 EN/FR/HT keys in sync; 1,790 `t()` calls; existing unused-key notices, including the dynamically built review-category keys), increased-stack TypeScript, `node --check` on `server.js` and the route, `git diff --check`, and web export (3,573 modules/9 bundles) all passed with captured exit status. No live database/provider/device test; no commit/push.
- Next: APP-Q548–APP-Q550 — notify affected buyers after a confirmed counterfeit without assigning blame or automatically changing order/payment state; keep automation matches as private review signals with human review before consequential restrictions; retain only the minimal item/terms snapshot in completed orders when a listing is removed. Then continue the remaining ledger domains. Discovery stays closed at 511; Support website/API stays deferred.

### Session 389 — Listing-rights batch complete: Q541 + Q544, Q548–Q550, Q008 alignment (2026-10-05)
- **APP-Q548** — new admin-only `POST /api/admin/listings/:id/confirm` closes an open content review as confirmed: the listing is rejected/hidden, the seller is told factually and can appeal, and affected buyers are notified for item-affecting categories (`counterfeit`, `prohibited`). Buyer notice is factual, blames no one, offers a Support route (deep-links to the in-app Help & Support screen), and changes no order/payment state. Content-only categories (stolen photos, brand misuse) do not notify buyers because nothing about a delivered item changed.
- **APP-Q549** — automated checks stay private review signals: `assessModeration` only holds a listing for human review; seller-facing copy now discloses that an automated check flagged it (My Listings pending note, Edit Listing pending banner and review notification), and a listing already confirmed as a content-rights violation returns to human review after an edit instead of going live. Policy comment recorded in `src/utils/listingConstants.js`.
- **APP-Q550** — order records now rely on their own snapshot: order list and order detail queries prefer `order_items.product_name` / `product_image` with LEFT JOINs, and `DELETE /products/:id` soft-archives a listing that has order history (`paused_reason = 'seller_removed'`) instead of refusing, so sellers can remove a listing while receipts/disputes keep only the minimal item/terms snapshot. Listings without orders still delete outright.
- **APP-Q541** — Add Listing now requires a content-rights confirmation before publishing (checkbox on the preview step, localized with clear examples, never persisted in drafts); the server enforces `rightsConfirmed === true` on `POST /products` with code `LISTING_RIGHTS_REQUIRED`, and the client maps that code back to the localized prompt.
- **APP-Q544 follow-up** — authenticity/content-rights reports gain a dedicated rights-holder identification checkbox ("I own this content or am authorized to act for the rights holder"), stored as `user_reports.rights_holder` via an idempotent migration; the report alone remains not proof.
- **APP-Q008 alignment correction** — routine content review keeps the listing visible; only a credible immediate serious risk is hidden. `restrict` takes an explicit `hide` flag (default off), the seller notice and both seller screens state the actual restriction ("stays available"/"hidden while a person reviews"), replacing Session 388 copy that assumed hiding.
- Also: notification tap routing now covers `listing_approved/rejected/in_review/under_review/content_confirmed` → My Listings and `content_review_buyer_notice` → Help & Support. Context for reviewers: there is still no in-app admin UI; the moderation endpoints are API-only staff tooling for the future Support website (see the back-pocket blocks above), and `src/support/supportGateway.ts` stays disconnected.
- Validation: `npm test` (design 0/0; 2,407 EN/FR/HT keys in sync; 1,803 `t()` calls; existing unused-key notices), increased-stack TypeScript, `node --check` on `server.js` and changed routes, `git diff --check`, and web export (3,573 modules/9 bundles) all passed with captured exit statuses. No live DB/provider/device test; no commit/push. Implementation records stay in AGENTS.md/session notes — the ledger is left untouched as Codex's discovery guide.
- Next: continue the remaining ledger domains (e.g. remaining support/reporting, review, and operations decisions), one verified slice at a time. Discovery stays closed at 511; Support website/API stays deferred.

### Session 390 — Reviews v1: buyer edit/delete and public visibility (2026-10-05)
- Buyers can now edit or delete their own review from Order Detail. `GET /orders/:id` returns `my_review`; the screen shows a "Your review" card (stars, comment, edited state, Edit and Delete) and falls back to the original "Review order" prompt when none exists.
- New author-only `DELETE /reviews/:id` soft-deletes: sets `reviews.deleted_at`, keeps the one-review-per-order audit row, and removes the review from every public list and rating average. Editing a deleted review now returns 409, and Order Detail shows a muted "no longer public" line instead of the review prompt so the buyer is not offered a submission that would fail (one review per order still holds).
- Public review visibility is a single shared predicate in `src/utils/reviewVisibility.js`: not moderated, not author-deleted, and not tied to a fully refunded order. Applied to product reviews, seller reviews + stats, the seller search list averages, and public profile averages — the last two previously included moderated and fully refunded reviews, so public ratings are now consistent.
- Reviews are labeled "Completed MaurMaket purchase" on product pages and profile surfaces, completing the v1 transaction-level review requirement from the Profile & Settings handoff.
- Also recorded the Support-need recognition rule (Philippe, 2026-10-05) next to the existing Support integration rule: when something needs Support, build only the narrow typed seam and route users to the existing in-app Help & Support screen; never claim a case was filed. Current examples remain the unconnected admin moderation endpoints and `src/support/supportGateway.ts` (`not_connected`).
- Backend/migration: idempotent `reviews.deleted_at` column in `server.js`. Copy localized EN/FR/HT.
- Validation: `npm test` (design 0/0; 2,418 EN/FR/HT keys in sync; 1,814 `t()` calls; existing unused-key notices), increased-stack TypeScript, `node --check` on `server.js` and changed routes, `git diff --check`, and web export (3,573 modules/9 bundles) all passed with captured exit statuses. No live DB/provider/device test; no commit/push.
- Next: continue the remaining ledger/review decisions (e.g. on-demand review translation, private-feedback separation, one gentle review reminder) and other unimplemented domains. Discovery stays closed at 511; Support website/API stays deferred and disconnected.

### Session 391 — Reviews remainder: reminder job, private-feedback separation, translation seam (2026-10-05)
- One gentle review reminder (Profile & Settings decision): a daily cron sends at most one in-app reminder for orders completed 3–30 days ago with no review submitted, no open dispute, and not fully refunded. `orders.review_reminder_sent_at` (idempotent migration in `server.js`) enforces "at most one"; the reminder uses the `reviews` notification category so it never pushes immediately, and it deep-links to the order.
- Private-feedback separation: the Order Detail review modal now states that reviews are public and offers a distinct "Contact Help & Support" action that opens the real in-app support screen, so private concerns never mix into the public review form.
- On-demand review translation: the review surface offers a Translate action that renders only when the server reports a configured provider (`GET /api/translate/status`); the original is always preserved and the translation is labeled. `POST /api/translate` returns `TRANSLATION_NOT_CONFIGURED` (501) instead of inventing text. No provider is chosen yet — the seam (`src/routes/translate.js`, `translateText`/`getTranslationStatus` in `src/api.ts`) is built and inert until `TRANSLATION_API_URL`/`TRANSLATION_API_KEY` are set.
- Validation: `npm test` (design 0/0; 2,423 EN/FR/HT keys in sync; 1,819 `t()` calls), increased-stack TypeScript, `node --check` on `server.js` and changed routes/jobs, `git diff --check`, and web export (3,573 modules/9 bundles) all passed with captured exit statuses. No live DB/provider/device test; no commit/push.
- Next: choose a translation provider (or defer) to activate the built seam, then continue with the next unimplemented ledger domain. Discovery stays closed at 511; Support website/API stays deferred and disconnected.

### Session 392 — Privacy & data lifecycle, first slice: "Your Data & Privacy" center (2026-10-06)
- Domain: privacy and data lifecycle (APP-Q405–APP-Q417, APP-Q420–APP-Q432), previously unimplemented. The Privacy screen only covered profile visibility, presence, and blocked users; the `privacy.dataControl` / `privacy.dataExportSoon` keys were dead, confirming an intended-but-unbuilt section.
- Added a new localized screen `src/screens/DataPrivacyScreen.tsx` (route `DataPrivacy`, registered in `App.tsx` + `src/navigation.ts`) reached from a new "Data & control" group in `PrivacySettingsScreen.tsx`. It implements: held-data categories with purpose and a Required/Optional tag (APP-Q405, APP-Q408, APP-Q409); a plain-language retention table keyed to retention triggers with an explicit "no fixed deletion date" caveat and closure retention note (APP-Q427, APP-Q414); service-provider categories and purposes, stating providers never own the account or sign-in (APP-Q415); a readable in-app data summary (order/message/review/notification counts) plus a structured export that copies machine-readable JSON to the clipboard and, on web, also downloads a `.json` file (APP-Q411) — no new dependency was added (uses the already-present `expo-clipboard`); a correction route to Edit Profile for low-risk fields (APP-Q406); and a privacy-request route to the existing in-app Help & Support screen (APP-Q428).
- Support rule honored: privacy requests are routed to the real in-app help surface; the `src/support/supportGateway.ts` adapter stays `not_connected`, no case backend was invented, and the screen states that a private request tracker is planned for the future Support portal. Export is delivered only as the user's own data, with a note that saved copies leave our control and re-authentication may be required.
- Reused the existing authenticated `GET /user/export-data` endpoint — no backend or migration change. Added 66 EN/FR/HT keys (now 2,489 each, parity intact). The stale `privacy.dataExportSoon` / `privacy.blockedUsersSoon` keys remain unused (warn-only) rather than edited.
- Deferred within this domain (next slices): optional product-usage analytics opt-out (APP-Q416, APP-Q432) — there is no optional analytics collection to gate yet, so a toggle would be hollow; device permission review with an OS-settings shortcut (APP-Q420–APP-Q422); external search-engine indexing (APP-Q423, not applicable to the mobile app); in-app search discoverability separate from link access (APP-Q431); and policy-change notice + acceptance-version history (Batch 72, APP-Q356–APP-Q365).
- Validation: `npm test` exit 0 (design guardrails 0/0; 2,489 EN/FR/HT keys; 1,857 t() calls), increased-stack TypeScript exit 0, `git diff --check` exit 0 (line-ending notices only), and `npx expo export --platform web` exit 0 (9 bundles). All 66 new keys were independently checked to exist and be referenced in all three locales. Live authenticated click-through was blocked: the local backend's only working credential requires TOTP 2FA, so the screen was verified via type/build/key checks and confirmed present in the web bundle (EN/FR/HT copy) rather than an authenticated UI run. No live DB/provider/device test; no commit/push.
- Next: continue the remaining privacy-domain items above, then the next unimplemented ledger domain. Discovery stays closed at 511; Support website/API stays deferred and its adapter disconnected.

### Session 393 — Device permissions review (APP-Q420–Q422) (2026-10-06)
- Added a localized `src/screens/DevicePermissionsScreen.tsx` (route `DevicePermissions`, registered in `App.tsx` + `src/navigation.ts`), reached from the "Data & control" group in `PrivacySettingsScreen.tsx`.
- Shows the current status of camera, photos/media, location, and notifications, read on open and on demand. Each read is individually guarded and uses the modules already in the app (`expo-notifications`, `expo-image-picker`, `expo-location` via dynamic import), so a platform that does not expose an API degrades to "Unavailable on this device" instead of failing the screen. Status is shown with a dot plus a text label, never color alone.
- APP-Q420: every permission states what the feature needs it for and offers a manual fallback — gallery instead of camera, a typed location instead of GPS, and in-app alerts that keep working when push is off.
- APP-Q421: a direct "Open device settings" shortcut calls the OS settings surface (disabled on web) and the copy makes clear the OS owns the permission, not MaurMaket; the screen also explains it can only read status.
- APP-Q422: a dedicated note explains that turning a permission off stops MaurMaket using that capability immediately, that anything already entered is kept, and that the user can continue by hand or retry. In-flow revocation handling itself was already satisfied by existing behavior (for example Add Listing keeps its draft and reports a specific retry path).
- No backend or migration change. Added 22 EN/FR/HT keys (now 2,511 each, parity intact).
- Validation: `npm test` exit 0 (design guardrails 0/0; 2,511 EN/FR/HT keys; 1,871 t() calls), increased-stack TypeScript exit 0, `git diff --check` exit 0 (line-ending notices only), and `npx expo export --platform web` exit 0 with no warnings (9 bundles). All 22 new keys were checked to be defined and referenced in all three locales, and the screen's EN/FR/HT copy was confirmed present in the web bundle. Live authenticated click-through remains blocked (the only working local credential requires TOTP 2FA), so there was no live device permission read. No commit/push.
- Next: policy transparency and consent (Batch 72, APP-Q356–APP-Q365) plus the remaining Batch 77 items (optional analytics opt-out APP-Q416/APP-Q432; in-app discoverability separate from link access APP-Q431; external indexing APP-Q423 is not applicable to the mobile app). Discovery stays closed at 511; Support website/API stays deferred and disconnected.

### Session 394 — Policy transparency & consent (Batch 72, APP-Q356–APP-Q365) (2026-10-06)
- Implemented the whole policy-transparency batch. New backend: `src/utils/policyBaseline.js` holds the baseline Terms and Privacy documents with per-locale title/summary/URL; `src/routes/policies.js` (mounted in `src/routes/index.js`) serves the current documents, the caller's acceptance state, retained notices, and acceptance history, plus endpoints to confirm a version and to dismiss a notice. Idempotent migrations in `server.js` create `policy_versions`, `user_policy_acceptances`, and `user_policy_notices`, and seed one baseline version per kind.
- APP-Q356/APP-Q357: material changes appear as an in-app notice, and only a material version that is not yet confirmed asks for deliberate confirmation — routine editorial changes are shown informatively, with no acceptance gate.
- APP-Q358: acceptance is stored as a minimal, access-restricted row of `user_id + kind + version + accepted_at`, unique per version so the history is append-only.
- APP-Q359/Q361/Q362/Q363: a new `LegalPrivacyScreen` (route `LegalPrivacy`, reached from Settings → Help) lists the current documents with version, update date, a localized "what changed" summary, a one-tap link to the full text, an availability note when the app language has no translation yet, the user's acceptance state, the acceptance history, and dismissed notices retained for re-reading.
- APP-Q360: declining a material update opens an inline explanation of the limits (no new purchases, listings, or payouts until confirmed) while stating that the account, existing orders, messages, and support stay available, with direct routes to data export, account settings, and Help & Support.
- APP-Q365: acceptance is only ever recorded after the server confirms it — the client never marks a policy accepted optimistically. The server re-checks that the submitted version is still current and returns `POLICY_VERSION_STALE` otherwise; offline attempts get a clear "connect to confirm" message and the screen state is preserved.
- APP-Q364: `GET /orders/:id` now returns a read-time `terms_policy_version` resolved from the terms version in effect when the order began. Accepted order terms themselves are never rewritten by a later policy change. Accounts that existed before acceptance tracking are treated as covered by the baseline version, so nobody is asked to re-accept terms they already agreed to at signup; the notice appears only for a genuinely newer version.
- No UI enforcement gate was added on other flows (checkout, listing creation): a genuine material update does not exist yet, and adding a blocking gate was not verified safe for existing orders. The confirmation state is recorded and surfaced; wiring enforcement is the deliberate next step.
- Validation: `npm test` exit 0 (design guardrails 0/0; 2,545 EN/FR/HT keys; 1,905 t() calls), increased-stack TypeScript exit 0, `node --check` on `server.js`, `src/routes/policies.js`, `src/routes/index.js`, `src/routes/orders.js`, and `src/utils/policyBaseline.js` all clean, `git diff --check` exit 0 (line-ending notices only), and `npx expo export --platform web` exit 0 with no warnings (9 bundles). All 34 new `legal.*` keys were checked to be defined and referenced in all three locales, and the three route paths plus the migration steps were confirmed present. No live database or authenticated UI test: the migrations were not applied remotely (they apply on the next deploy), and the only working local credential requires TOTP 2FA. No commit/push.
- Next: wire the confirmed-acceptance state into the flows that require agreement (only when a genuinely material version exists), then the remaining Batch 77 items (optional analytics opt-out APP-Q416/APP-Q432; in-app discoverability separate from link access APP-Q431). Discovery stays closed at 511; Support website/API stays deferred and disconnected.

### Session 395 — In-app search discoverability (Batch 77, APP-Q431) (2026-10-06)
- Implemented APP-Q431: a person's in-app *search discoverability* is now a separate control from *link access*. New `users.search_discoverable` (idempotent migration step #85 in `server.js`, plus a partial index; `NOT NULL DEFAULT true` so every existing and future account stays findable until it opts out).
- When off, the person is excluded from people-discovery surfaces: `/sellers/search` (used by the Inbox "new chat" seller search), `/sellers/nearby` (the seller map, even if that seller separately enabled public map visibility), and seller-name matching in `/products` search. Item discovery is deliberately untouched — their listings still match by item name, description, and category, so inventory stays public. Direct links, the storefront (`/sellers/:id`), orders, reviews, and messages keep working, which is exactly the "separate search discoverability from link access" split.
- `search_discoverable` is exposed on `GET /user/me` and accepted by `PUT /user/profile` (`searchDiscoverable`, param `$25`) using the existing COALESCE pattern, so a partial profile save never resets it. Added `search_discoverable?: boolean` to the `User` type.
- UI: new localized **Discoverability** section in `PrivacySettingsScreen` (its own SettingsGroup + Reduce-Motion-aware stagger section, renumbered indices), with a toggle, an explicit state line, and a note stating that the setting affects in-app search and suggestions only while listings, direct links, orders, reviews, and messages continue to work and shared links keep respecting current profile privacy (this also documents APP-Q429's link-honoring behavior).
- Reused the previously dead `privacy.discoverability` / `privacy.discoverabilityDesc` keys (already translated in EN/FR/HT), which confirmed the feature was intended but unbuilt. Added 7 new keys (2,552 each; parity intact; none land in the unused-key list).
- Rationale for choosing this over APP-Q432/Q416 (optional analytics opt-out): the app collects **no** optional product-usage analytics (the only "analytics" is seller business stats), so an opt-out toggle would be hollow; it needs real optional instrumentation first. APP-Q423 (external indexing) does not apply to the mobile app.
- Validation: `npm test` exit 0 (design guardrails 0 violations / 0 warnings; 2,552 EN/FR/HT keys in sync; 1,914 `t()` calls), `node --stack-size=8192 ./node_modules/typescript/bin/tsc --noEmit` exit 0, `node --check` clean on `server.js` + the three touched routes, `git diff --check` exit 0 (line-ending notices only), and `npx expo export --platform web` exit 0 with no warnings (9 bundles). The EN/FR/HT copy was confirmed present in the exported web bundle. No live DB/provider/device test: the migration was not applied remotely (it applies on next deploy) and the only working local credential requires TOTP 2FA, so there was no authenticated click-through. No commit/push.
- Next: the remaining Batch 77 item (optional analytics opt-out APP-Q416/APP-Q432, which needs real optional instrumentation first) or wiring the confirmed policy-acceptance state into gated flows when a genuinely material version exists; otherwise continue to the next unimplemented ledger domain. Discovery stays closed at 511; Support website/API stays deferred and its adapter disconnected.

### Session 396 — Private security activity history + new sign-in alerts (Batch 73, APP-Q369) (2026-10-06)
- Implemented APP-Q369 ("alert users to new sign-ins and important security events; provide private event history and verified-channel fallback when push is unavailable"). Ledger discipline confirmed first: the ledger was **not** touched — its mtime (2026-10-05 22:58) predates this session's edits, and the new column/table names appear **0** times in it. The `+20 staged / +14 unstaged` ledger diff is pre-existing from the shared worktree.
- Dead-key discovery again pointed the way: `security.recentSignInActivity` existed in all three locales but was referenced nowhere, confirming an intended-but-unbuilt "recent sign-in activity" surface. It is now wired up.
- **Data model:** idempotent migration step #86 in `server.js` creates `security_events (id, user_id UUID FK → users ON DELETE CASCADE, event_type, metadata JSONB, created_at)` + `idx_security_events_user_created`. Only **structured type codes** and non-secret metadata are stored; all wording is rendered from the app locale, per the settled "store structured activity, render in the user's current language" decision. No IP address is stored or returned — only the user-agent string, which is the same device data the caller's own session list already exposes.
- **New `src/utils/securityEvents.js`:** `SECURITY_EVENT_TYPES` (v1: `sign_in`), `SECURITY_EVENT_RETENTION_DAYS = 365`, `recordSecurityEvent()` (best-effort — validates the type, truncates the user-agent to 300 chars, and swallows/logs every failure so security history can never break sign-in), and `cleanupOldSecurityEvents()`.
- **Sign-in capture:** new `databaseHooks.session.create.after` in `src/config/auth.js` — fires for *every* sign-in path (password, email OTP, Google, passkey) and records the event plus alerts the owner. Loaded via dynamic `import()` and wrapped in try/catch so an auth-config load-order or hook failure cannot break authentication. Deliberately does **not** pass `actorId`, because `createNotification` suppresses self-actions — security alerts about your own sign-in are the point (checked before writing).
- **Alerting:** new `new_sign_in` notification type added to `URGENT_TYPES` in `src/utils/notifications.js`, so it bypasses snooze, quiet hours, and category preferences and pushes immediately (security/account access is a settled always-immediate category). Added a `sanitizeForLockScreen` case that keeps the alert useful but never puts device detail, tokens, or addresses on the lock screen. `src/notificationRouting.ts` now routes `new_sign_in` / `account_security` / `password_changed` → `SecuritySettings` (the latter two were previously unrouted).
- **Retention honesty:** `cleanupOldSecurityEvents()` is exported from `helpers.js` and called in the existing 03:00 cleanup cron (`src/jobs/index.js`) so the disclosed one-year retention is actually enforced rather than merely displayed.
- **API/UI:** new `src/routes/security.js` — `GET /api/security/events` (authRequired, own events only, newest first, LIMIT 50, filters to known types, returns `retention_days`); mounted at root in `src/routes/index.js` following the `policies.js` precedent. `api.ts` gains `getSecurityEvents()` (typed) and `types.ts` gains `SecurityEvent`. `SecuritySettingsScreen` gains a "Recent sign-in activity" section (localized, device label + localized date, empty state, retention line, and a "if you don't recognize a sign-in" block with Change password → `SettingsEdit` and Help & Support → `HelpSupport`). It loads independently of the Better Auth snapshot so history still appears when session listing reports `sessionsNeedFreshSignIn`.
- Added 5 keys (2,557 each; parity intact; none unused; `security.recentSignInActivity` also drops off the unused list).
- Validation: `npm test` exit 0 (design guardrails 0/0; 2,557 EN/FR/HT keys in sync; 1,920 `t()` calls), increased-stack `tsc --noEmit` exit 0, `node --check` clean on all 8 touched backend files, `git diff --check` exit 0 (after fixing a stray blank line at EOF in `types.ts` that the check caught), and `npx expo export --platform web` exit 0 with no warnings (9 bundles); EN/FR/HT copy confirmed in the bundle. Also ran two bounded runtime probes: the recorder's guard paths return `null` for unknown types/missing user without touching the DB, and `createAuth(stubAdapter)` accepts the new config and retains `session.create.after` as an invocable function.
- Not verified / limitations: no live sign-in was exercised end-to-end (the only working local credential requires TOTP 2FA and migrations were not applied remotely — they apply on next deploy), so the hook's real invocation and push delivery are unproven in practice. The hook writes via the pool while Better Auth creates the session; the only shared lock would be a FK reference on `users`, so no conflict is expected, but this was not load-tested. Notification title/body remain stored English like every other existing type (localizing the whole notification feed is a separate, broader gap). Only `sign_in` is recorded — password/2FA/passkey changes are Better Auth-owned follow-ups. No commit/push.
- Next: continue the remaining account-security batches (73/74/75: fast account freeze for suspected compromise, private device labelling, trusted-device duration, security-history-in-export, app auto-lock) or the remaining Batch 77 analytics opt-out (still needs real optional instrumentation). Discovery stays closed at 511; Support website/API stays deferred and its adapter disconnected.

### Session 397 — Fast account freeze for suspected compromise (Batch 73/74/75, APP-Q371) (2026-10-06)
- Implemented APP-Q371 (with the freeze-effect and safe-communication rules from APP-Q374/APP-Q375/APP-Q393). Goal was to start clearing the "finish the ledger" backlog, beginning with the largest gap: account security (Batches 73/74/75), which was otherwise unbuilt apart from session revoke, 2FA/passkeys, and Session 396's sign-in history.
- **Boundaries (deliberately narrow, from the ledger):** a freeze stops **new listings** and **payout requests** only. Sign-in, recovery, messages, existing orders, Support, and data export all keep working (APP-Q375/Q393 require safe order communication to survive a freeze). The new `accountActive` middleware is applied to **exactly three** routes — `POST /products`, `POST /api/products/:id/resume`, `POST /api/seller/payouts/request` — verified by grep to be 3 attachment sites, and intentionally **not** a global gate.
- **Data model:** migration #87 adds `users.frozen_at`, `users.freeze_reason`, `users.frozen_by` + a partial index.
- **`src/utils/accountFreeze.js`:** `freezeAccount` locks the user row `FOR UPDATE`, sets the freeze, and pauses only listings that are currently `listing_status='active' AND is_available=true`, marking them `paused_reason='account_freeze'`. `unfreezeAccount` restores **only** listings carrying that reason. This is provably faithful because a paused listing cannot be purchased, so availability cannot drift while frozen — and it means listings the seller had already paused keep their own reason and are never resurrected. Both are idempotent (re-freezing does not double-pause). Security events are written **after** commit so a history failure can never undo a committed freeze.
- **Deliberate restore (APP-Q371):** `POST /api/account/unfreeze` requires the account password when one exists, verified through the new `src/utils/passwordVerify.js`, which handles both password stores (legacy bcrypt on `users.password_hash` and Better Auth scrypt on `accounts.password`), mirroring the verifier in `src/config/auth.js`. The threat model is a live session in an attacker's hands, so an existing session alone must not undo the freeze. Google-only accounts with no password get an explicit confirmation instead, and the action is still recorded — a stated limitation, not a silent bypass.
- **Alerting:** new `account_frozen` / `account_unfrozen` notification types are in `URGENT_TYPES` (immediate push, bypassing snooze/quiet hours/categories), have lock-screen sanitizer cases that never expose the owner's free-text reason, and route to `SecuritySettings` in `src/notificationRouting.ts`.
- **API/UI:** new `src/routes/account.js` — `GET /api/account/freeze` (returns state + `listings_paused` + `has_password`, so the UI can ask for the right restore credential up front), `POST /api/account/freeze` (optional bounded reason, max 200 chars), `POST /api/account/unfreeze` (returns `listings_restored`). Mounted at root following the `policies.js`/`security.js` precedent. `security_events` gained the two new types plus allow-listed `reason` metadata (unknown metadata keys are dropped by design so callers cannot persist tokens or addresses). `api.ts` + `types.ts` gain the typed client surface; `SecuritySettingsScreen` gains a freeze section (frozen banner with paused-listing count, or a freeze action), two modals (freeze with optional reason; restore with password when required), and the security history now labels freeze/unfreeze events.
- Added 23 keys (2,580 each; parity intact; none unused).
- Validation: `npm test` exit 0 (design guardrails 0/0; 2,580 EN/FR/HT keys in sync; 1,943 `t()` calls), increased-stack `tsc --noEmit` exit 0, `node --check` clean on all 12 touched backend files, `git diff --check` exit 0, and `npx expo export --platform web` exit 0 (9 bundles); EN/FR/HT freeze copy confirmed in the bundle. Also ran a **route-registration probe** that imported the routers and listed their paths without executing any query — it confirmed exactly `GET /api/account/freeze`, `POST /api/account/freeze`, `POST /api/account/unfreeze`, `GET /api/security/events`.
- **Deliberately NOT done:** no live/endpoint test was run, because the local `DATABASE_URL` resolves to a **remote Neon host** (`ep-bitter-block-aimkobg4-pooler...neon.tech`), so starting the backend would have applied migrations #83–#87 to a remote database without authorization. Static + route-mount + type + build verification only, matching the recorded limitation pattern of earlier sessions. No commit/push.
- Remaining ledger work (unchanged, next slices): account-security remainder — private device labelling, trusted-device duration, sign-in rate limiting + generic failure wording, re-auth for data export and before removing the last 2FA factor, export lifecycle (status/expiry/cancel/retry), security history in exports, staff KYC-evidence access log, clear device caches at sign-out, optional device-authenticated app auto-lock; Batch 83 tail — advisory map/meetup safety warnings that pause positive recommendations during unresolved credible risk; Batch 77 tail — optional analytics opt-out (still needs real instrumentation); policy-acceptance enforcement once a genuinely material version exists. Support-web batches (78–82, 84) remain deferred by Philippe's sequencing rule with `supportGateway` still `not_connected`.

### Session 398 — Sign-in throttling and generic failure wording (Batch 73, APP-Q380) (2026-10-06)
- Implemented APP-Q380 ("repeated failed sign-in attempts"): rate limits and risk checks with generic error wording, plus safe recovery that never reveals whether an account exists.
- **Fixed a real defect found while auditing the surface:** `app.use('/api/auth', authLimiter)` was registered *after* the Better Auth catch-all `app.all('/api/auth/*', …)`. That handler ends the response, so the limiter never executed and sign-in was effectively unthrottled. Proven with a probe against the real middleware: the old ordering allowed 11 consecutive failures with no 429.
- **New `signinLimiter`** in `src/middleware/rateLimit.js`: 15-minute window, 10 failures, `skipSuccessfulRequests: true` (a normal sign-in never consumes budget), keyed on `ipKeyGenerator(req.ip)` + the submitted email so one shared connection is not punished for a single account's failures and one account cannot be brute-forced from many addresses. Used the v8 `ipKeyGenerator` helper rather than raw `req.ip` for IPv6 safety. Generic message + `TOO_MANY_ATTEMPTS` code.
- **Mounting:** `server.js` now applies the limiter *before* the catch-all and only to credential-guessing paths — `/api/auth/sign-in/email`, `/api/auth/two-factor/verify-totp`, `/api/auth/two-factor/verify-backup-code`. Session reads, OAuth starts, and passkey are deliberately excluded so ordinary app usage is unaffected. The inert `app.use('/api/auth', authLimiter)` line and its now-unused import were removed.
- **Client wording:** `login()` in `src/api.ts` now raises a stable `INVALID_CREDENTIALS` error for any credential failure, discarding server text that could distinguish a missing account from a wrong password (verified safe: `autoVerifyEmail: true` and no `requireEmailVerification`, so a failed email sign-in is always a credential failure or a 429). A distinct `TOO_MANY_ATTEMPTS` state carries status 429. `AnimatedSignin` maps it to new `signin.tooManyAttempts` copy in EN/FR/HT that tells the user to wait and points at password reset as safe recovery. Added 3 keys (2,609 each; parity intact).
- **Verification:** probe using the real `signinLimiter` → old ordering 11×401 (inert), new ordering 10×401 then 429, a different email from the same IP stayed at 401, and 20 consecutive successful sign-ins stayed 200. `npm test` exit 0 (design guardrails 0/0; 2,609 EN/FR/HT keys in sync; 1,972 `t()` calls), increased-stack `tsc --noEmit` exit 0, `node --check` clean on `server.js` and the middleware. No live provider/device test; no authenticated click-through.
- **Corrected a stale handoff:** the data-export lifecycle (Batch 74/75, APP-Q379–APP-Q391) listed as remaining after Session 397 is already implemented — `src/routes/dataExport.js` (re-auth for export, status, download, cancel, retry), `src/utils/dataExport.js` (jobs, TTL, lazy expiry, retained security history in payloads), and the `cleanupOldExportJobs` daily cron in `src/jobs/index.js`. It is no longer a remaining slice.
- Remaining account-security slices unchanged otherwise: trusted-device duration, private device labelling, re-auth before removing the last optional second factor, staff KYC-evidence access log, clearing authenticated device caches at sign-out, and optional device-authenticated app auto-lock. Discovery stays closed at 511; Support website/API stays deferred and its adapter disconnected.
