# NatCash Implementation TODO

This plan implements the agreed NatCash policy in `AGENTS.md`. Supabase is the primary database. Neon failover/replication remains behind the existing database controller. Do not imply provider verification for direct seller transfers.

## Implementation progress

Implemented in this pass:

- Startup migrations create standalone NatCash access, payment, reminder, and pending-checkout order-linkage tables/columns.
- Seller access screen in Settings shows Business bundle or 500 HTG/30-day access, provider-confirmed payment state, pause/resume, and the seller opt-in plus required NatCash number.
- MonCash access payments use unique references. A signed webhook checks the amount and settles idempotently; ambiguous payment creation or amount outcomes block another charge pending reconciliation.
- Checkout checks access, seller opt-in, and configured NatCash phone. Public product/store data removes NatCash when those checks fail. Reminders run daily in Port-au-Prince time.
- NatCash checkouts require meetup fulfillment. Once all sellers accept, the backend creates the order before transfer. Buyer claims stay unverified, seller receipt is separate, and the meetup delivery code is rejected until the seller confirms receipt. Old checkout SMS-verification endpoints return HTTP 410.
- A buyer claim starts a 24-hour seller-portion reservation window. Seller receipt confirms the reservation; unresolved portions expire, cancel, release stock, and notify both parties. Later app confirmation is blocked and asks both parties to resolve directly.
- Verified sellers are capped at 100 available listings for both create and reactivation.

Known gaps before enabling the full NatCash flow: mixed payment selection remains cart-wide; mutual meetup date/time proposals are not implemented; the existing stock model decrements at checkout and still needs the agreed on-hand/reservation refactor; condition labels, report/dispute workflow, evidence packets, direct-payment analytics, and admin review remain in later phases. Existing clients that still open the old SMS screen will receive the retired-flow response.

## Baseline findings before this implementation

- NatCash is selected once for the full checkout, so buyers cannot choose it per seller.
- Checkout sends buyers to `NatCashPaymentScreen`, which parses a pasted SMS and calls server routes that mark the transfer verified before the item handoff.
- Seller confirmation currently happens after a buyer claim and is described as payment verification; it can also create commission/escrow records.
- Sellers can advertise `natcash` in `accepted_payment_methods` without a paid NatCash entitlement.
- No standalone NatCash subscription/access ledger exists. Business subscriptions already use manual MonCashConnect checkout and a signed webhook.
- Checkout/order infrastructure already has per-seller fulfillment agreements and stock reservations. Extend it carefully; retain MonCash behavior and historic order compatibility.

## TODO and delivery order

### Phase 1 — Access entitlement and manual add-on billing

- [x] Add durable standalone NatCash access and payment-ledger schema, plus pause state. Preserve existing `seller_subscriptions` for Business.
- [x] Add a server-side entitlement function: active Business access bundles NatCash; otherwise a confirmed 500 HTG payment grants 30 days. Business loss ends bundled access without a second NatCash grace. Pausing hides NatCash from new orders but existing orders continue.
- [x] Add manual MonCashConnect checkout and signed, idempotent webhook handling. Only a confirmed provider event extends access; unresolved provider outcomes cannot be retried blindly.
- [x] Expose access state, paid-through time, and source (`business` or `standalone`) to the app. Add Settings UI for status, manual renewal, pause/reactivate, and clear price/expiry copy.
- [x] Schedule daily notices during the last 7 paid days and the 3-day grace period. Stop notices while paused or after confirmed renewal. After grace, disallow new NatCash orders but allow existing ones to finish.
- [x] Filter NatCash out of checkout unless every seller in the current cart has server-confirmed access. Per-seller mixed payment selection remains in Phase 2.

### Phase 2 — Direct handoff lifecycle (replace checkout-time SMS verification)

- [ ] Add per-seller payment method selection to checkout and persist the selection with each seller fulfillment agreement.
- [x] Materialize an order/fulfillment before any NatCash transfer after all sellers accept. NatCash orders are due at handoff; checkout SMS verification routes now return a retired-flow response.
- [x] Keep buyer action “I sent NatCash” as a buyer-reported claim only. Show the seller “I received it” / “I haven’t received it yet”; direct NatCash does not create MonCash escrow or commission entries.
- [x] Block meetup code completion until the seller confirms receipt. Require 15 minutes from the buyer claim before the seller can report non-receipt; do not hand over or resend during that period.
- [x] Hold the item for up to 24 hours after an unresolved transfer, then cancel that seller portion and release stock. If the seller confirms receipt later, require direct resolution with the buyer.
- [ ] Add mutually confirmed meetup date/time and location. One party proposes; the other accepts or proposes a change. One-hour lateness grace and timestamped check-ins/location as supporting evidence precede reviewed no-show consequences. Meetup rescheduling policy remains deferred.
- [ ] Keep mixed seller orders independent: MonCash can complete while NatCash waits for handoff. Retry/cancel actions affect only the selected seller portion.

### Phase 3 — Inventory and listing quality

- [ ] Separate on-hand stock from active reservations. Sellable stock is on-hand minus active reservations; release on cancellation/expiry and decrement on handoff completion.
- [ ] Keep fully reserved listings visible with a “Temporarily reserved” state and disable new purchases.
- [ ] Add condition labels (New, Like new, Good, Fair, For parts/not working) and a written known-flaw description. Do not require separate flaw photos in v1; accept buyer photos as dispute evidence.
- [x] Enforce a maximum of 100 active published listings for Verified sellers (draft/archived/sold excluded); Business remains unlimited. Existing listings above cap stay visible; block new/reactivated listings until below cap.

### Phase 4 — Reports, support, and user-facing records

- [ ] Add buyer/seller report actions for both rails; reports hold only the affected seller portion. MonCash escrow remains held; NatCash handoff/completion pauses.
- [ ] Add 48-hour buyer defect-report window after completed NatCash handoff and 48-hour seller response window. Record seller/buyer agreement to full/partial direct refund or replacement/repair without MaurMaket moving the money.
- [ ] Build support evidence packet: listing/order snapshot, buyer description/photos, seller response/evidence, in-app messages, meetup and payment-status timestamps. SMS is user-provided evidence, never provider-verified.
- [ ] Unresolved evidence means no automatic fault/penalty. Review no-shows before the agreed buyer/seller thresholds; review repeated deliberate evidence fabrication (2 in 12 months).
- [ ] Show seller-confirmed direct NatCash totals separately in order history/analytics for all tiers with access; never count them as withdrawable wallet funds or platform settlement. Advanced analytics remain tier-gated.
- [ ] Add admin support review, case outcomes, audit history, notifications, and escalation runbook.

### Phase 5 — Closeout

- [ ] Verify Supabase schema is current and startup migrations are additive/idempotent; confirm RAID replication handles the new records.
- [ ] Review user-facing English/French/Haitian Creole strings and accessible loading/error/empty states.
- [x] Run source syntax checks, locale JSON parsing, and TypeScript no-emit compilation; no provider transfers or production database mutations were used.
- [ ] Update this checklist with shipped files, migration requirements, and any remaining risk before enabling NatCash for sellers.

## Safety invariants

- Only MonCashConnect's signed, idempotent success confirmation grants paid access or settles a MonCash seller order.
- A buyer-entered SMS, screenshot, proximity check, or delivery code is not proof that a NatCash transfer reached the seller.
- Never hand an item over until the seller confirms NatCash receipt.
- Never retry an unresolved MonCashConnect operation as if it failed; reconcile its saved reference first.
- NatCash direct payments do not create fictitious MaurMaket wallet balance, commission revenue, escrow, or refunds.
- Keep unrelated working-tree changes intact.
