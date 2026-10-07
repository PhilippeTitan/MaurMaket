#!/usr/bin/env node
/**
 * Cancellation-scope check — post-fulfillment cancellation decisions.
 *
 * Ledger: APP-Q340 "cancel only the affected seller sub-order unless the buyer
 * explicitly cancels the whole checkout"; APP-Q341 "an unanswered request keeps
 * the order and payment unchanged, reminds once, then needs a clear unresolved
 * state — no automatic fault or refund".
 *
 * Two opposite mistakes are easy here, and both are dangerous:
 *
 *   1. Being *too* destructive. A portion cancellation must only ever touch its
 *      own seller. The buyer could not even open a request on a multi-seller
 *      order before this slice, which is now allowed — so the money path behind
 *      it has to be airtight. A cancelled portion's held escrow must never be
 *      released to its seller by the order-level release; it leaves only through
 *      its own MonCash refund review.
 *   2. Being *too* generous with an unanswered request. A seller who never
 *      replied is not at fault, and the lapse must not cancel anything or refund
 *      anything on its own.
 *
 * Run: node scripts/cancellation-scope-check.js
 * Exit code 0 = clean, 1 = policy violation
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PORTION_CANCELLATION_SCOPE,
  cancellationBasis,
  portionIsCancellableBeforeShipment,
  portionCancellationResolution,
} from '../src/utils/cancellationScopePolicy.js';

const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');
// These source files are CRLF on disk, so normalise line endings before matching:
// a pattern written as `{\n` never matches `{\r\n`, and the check silently passes.
const stripComments = (src) => src
  .replace(/\r/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/^\s*--.*$/gm, '');

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

console.log('Checking cancellation-scope policy...\n');

// ── 1. The basis of a resolvable request ──
check('every portion decision is scoped to one seller', PORTION_CANCELLATION_SCOPE === 'seller_portion');
check('a seller who agreed is a basis to cancel the portion',
  cancellationBasis({ resolution: 'seller_accepted_pending_settlement' }) === 'seller_accepted');
check('a seller who never replied is also a basis — but recorded distinctly',
  cancellationBasis({ resolution: 'seller_response_overdue' }) === 'unanswered');
check('a decline is not a basis', cancellationBasis({ resolution: 'seller_declined' }) === null);
check('a withdrawal is not a basis', cancellationBasis({ resolution: 'buyer_withdrew' }) === null);
check('an already-reviewed request is not a basis again',
  cancellationBasis({ resolution: 'admin_reviewed_order_resumes' }) === null
  && cancellationBasis({ resolution: 'admin_cancelled_before_shipment_refund_review' }) === null
  && cancellationBasis({ resolution: 'admin_cancelled_unanswered_portion_refund_review' }) === null);
check('a missing request is not a basis',
  cancellationBasis({}) === null && cancellationBasis() === null && cancellationBasis({ resolution: null }) === null);

// ── 2. The hard conditions before a reviewer may cancel a portion ──
const cancellable = (overrides = {}) => portionIsCancellableBeforeShipment({
  orderStatus: 'paid',
  paymentMethod: 'moncash',
  fulfillment: { payment_status: 'verified', fulfillment_status: 'processing', fulfillment_method: 'delivery' },
  hasMeetupCheckin: false,
  hasHeldEscrow: true,
  hasOpenRefundReview: false,
  ...overrides,
});

check('a verified, unshipped MonCash delivery portion with held escrow is cancellable', cancellable() === true);
check('a completed order is never cancellable', cancellable({ orderStatus: 'completed' }) === false);
check('an already-cancelled order is never cancellable', cancellable({ orderStatus: 'cancelled' }) === false);
check('a non-MonCash payment is never cancellable here', cancellable({ paymentMethod: 'natcash' }) === false);
check('a missing seller portion is never cancellable', cancellable({ fulfillment: null }) === false);
check('an unverified payment is never cancellable',
  cancellable({ fulfillment: { payment_status: 'pending', fulfillment_status: 'processing', fulfillment_method: 'delivery' } }) === false);
check('a shipped portion is never cancelled from here',
  cancellable({ fulfillment: { payment_status: 'verified', fulfillment_status: 'shipped', fulfillment_method: 'delivery' } }) === false);
check('a delivered portion is never cancelled from here',
  cancellable({ fulfillment: { payment_status: 'verified', fulfillment_status: 'delivered', fulfillment_method: 'delivery' } }) === false);
check('a meetup portion is never cancelled from here',
  cancellable({ fulfillment: { payment_status: 'verified', fulfillment_status: 'processing', fulfillment_method: 'meetup' } }) === false);
check('a meetup already under way is never cancellable', cancellable({ hasMeetupCheckin: true }) === false);
check('escrow that is not held is never cancellable', cancellable({ hasHeldEscrow: false }) === false);
check('a refund review already open is never re-cancelled', cancellable({ hasOpenRefundReview: true }) === false);
check('the conditions are read from the fulfillment, not defaulted in',
  portionIsCancellableBeforeShipment() === false);

// ── 3. The recorded outcome is always a refund *review*, never a transfer ──
check('an agreed cancellation records the accepted basis',
  portionCancellationResolution('seller_accepted') === 'admin_cancelled_before_shipment_refund_review');
check('an unanswered cancellation records the unanswered basis',
  portionCancellationResolution('unanswered') === 'admin_cancelled_unanswered_portion_refund_review');
check('both bases end in an open refund review, not a paid refund',
  portionCancellationResolution('seller_accepted').endsWith('refund_review')
  && portionCancellationResolution('unanswered').endsWith('refund_review'));

// ── 4. The buyer can now open a request on a multi-seller order ──
const orders = stripComments(read('src/routes/orders.js'));
const admin = stripComments(read('src/routes/admin.js'));

check('the multi-seller refusal is gone from the buyer request path',
  !/multi-seller orders yet because fulfillment and refund state are not independently represented/.test(orders));
check('no seller-count gate remains in the buyer request path',
  !/SELECT COUNT\(DISTINCT seller_id\)::int AS count FROM order_items[\s\S]{0,220}Seller-scoped cancellation is not available/.test(orders));
check('the request is still scoped to the one seller the buyer named',
  /router\.post\('\/orders\/:id\/cancellation-requests'[\s\S]{0,2000}seller_fulfillments sf[\s\S]{0,200}sf\.order_id = \$1 AND sf\.seller_id = \$2/.test(orders));
check('that seller must actually own a portion of this order',
  /seller_fulfillments sf[\s\S]{0,300}EXISTS \(SELECT 1 FROM order_items oi WHERE oi\.order_id = sf\.order_id AND oi\.seller_id = sf\.seller_id\)/.test(orders));
check('a second request for the same seller is still refused',
  /cancellation_request'[\s\S]{0,400}status IN \('open', 'under_review'\)/.test(orders));
check('a meetup order still cannot open a cancellation request here',
  /delivery_method === 'meetup'[\s\S]{0,200}cancellation/i.test(orders));

// ── 5. A cancelled portion's money can only leave through its own refund ──
const release = (orders.match(/router\.post\('\/orders\/:id\/escrow\/release'[\s\S]*?\n\}\);/) || [''])[0];
check('the order-level escrow release exists', Boolean(release));
check('it releases only held escrow — and never a cancelled seller portion',
  /FROM order_escrow oe[\s\S]{0,300}status = 'held'[\s\S]{0,300}COALESCE\(sf\.fulfillment_status, ''\) <> 'cancelled'/.test(release));
check('the exclusion is lock-safe (the outer-joined table is not the locked one)',
  /FOR UPDATE OF oe/.test(release));
check('commission is transferred only for the portions actually released',
  /SUM\(commission_amount\), 0\) AS total FROM order_escrow WHERE order_id = \$1 AND id = ANY\(\$2::uuid\[\]\)/.test(release)
  && /escrows\.rows\.map\(\(row\) => row\.id\)/.test(release));
check('an open dispute or an under-review cancellation still freezes the whole release',
  /SELECT id FROM disputes WHERE order_id = \$1\n\s*AND \(status = 'open' OR \(reason = 'cancellation_request' AND status = 'under_review'\)\)/.test(release));
check('a seller-specific refund still requires that seller’s cancelled portion and exactly one held escrow',
  /refundedSellerId[\s\S]{0,400}fulfillment_status = 'cancelled'[\s\S]{0,200}escrowResult\.rows\.length !== 1/.test(orders));
check('marking the whole order complete is still blocked while a cancellation is unresolved',
  /router\.put\('\/orders\/:id\/complete'[\s\S]{0,1200}reason = 'cancellation_request'[\s\S]{0,160}status IN \('open', 'under_review'\)/.test(orders));

// ── 6. The reviewer path wires the shared policy, not a second copy of it ──
check('the admin reviewer imports the shared policy',
  /import \{ cancellationBasis, portionIsCancellableBeforeShipment, portionCancellationResolution \} from '\.\.\/utils\/cancellationScopePolicy\.js'/.test(admin));
check('the accepted-only condition is gone',
  !/request\.resolution !== 'seller_accepted_pending_settlement'/.test(admin));
check('the basis is computed from the recorded resolution',
  /const basis = decision === 'cancel_before_shipment' \? cancellationBasis\(request\) : null;/.test(admin));
check('an unanswered request is resolvable on the same terms as an agreed one',
  /if \(!basis\) \{[\s\S]{0,300}409/.test(admin));
check('every hard condition comes from the tested policy',
  /if \(!portionIsCancellableBeforeShipment\(\{/.test(admin)
  && /orderStatus: request\.order_status,/.test(admin)
  && /hasOpenRefundReview: \(existingRefundRequest\.rowCount \|\| 0\) > 0,/.test(admin));
check('the outcome is chosen by the policy',
  /newResolution = portionCancellationResolution\(basis\);/.test(admin));
check('the unresolved basis is stated plainly, with no fault assigned',
  /basis === 'unanswered'/.test(admin) && /No fault is assigned/.test(admin));
check('nothing in the reviewer path moves money',
  /paymentChanged: false, refundReviewOpened, refundIssued: false \}/.test(admin));
check('the reviewer opens a separate, seller-scoped refund review',
  /INSERT INTO disputes \(order_id, seller_id, raised_by, reason, description, status\)[\s\S]{0,120}'refund_request'/.test(admin));
check('the order itself is cancelled only when no other portion is still active',
  /SELECT 1 FROM order_items oi LEFT JOIN seller_fulfillments sf[\s\S]{0,300}COALESCE\(sf\.fulfillment_status, 'pending'\) <> 'cancelled' LIMIT 1/.test(admin));

// ── 7. The app offers the per-portion action and tells the truth about it ──
const detail = stripComments(read('src/screens/OrderDetailScreen.tsx'));
check('the app no longer claims cancellation is unavailable for multi-seller orders',
  !/multiSellerCancellationUnavailable/.test(detail));
check('the request button is no longer gated to a single-seller order',
  !/order\.seller_count === 1 && order\.seller_fulfillments/.test(detail));
check('one button is offered per active seller portion',
  /order\.seller_fulfillments\?\.filter\(\(f\) => \['processing', 'shipped', 'delivered'\]\.includes\(f\.fulfillment_status\)\)\.map\(\(f\) => \{/.test(detail));
check('the button names the seller it applies to on a multi-seller order',
  /order\.seller_count && order\.seller_count > 1 \? ` · \$\{seller\?\.full_name/.test(detail));
check('a portion already waiting on a response does not offer a second request',
  /const active = order\.cancellation_requests\?\.some\(\(request\) => request\.seller_id === f\.seller_id && \['open', 'under_review'\]\.includes\(request\.status\)\);/.test(detail)
  && /if \(active\) return null;/.test(detail));
check('an unanswered request gets its own, non-accusatory explanation',
  /overdue \? t\('orderDetail\.cancellationUnansweredBody'\)/.test(detail));

// ── 8. Nothing anywhere still advertises the old limitation ──
for (const rel of ['src/api.ts', 'src/screens/OrderDetailScreen.tsx', 'src/routes/orders.js', 'src/routes/admin.js']) {
  check(`no stale multi-seller cancellation limitation in ${rel}`,
    !/multiSellerCancellationUnavailable/.test(stripComments(read(rel))));
}

// ── 9. The strings exist in all three languages and say the right thing ──
const locales = ['en', 'fr', 'ht'];
const required = ['orderDetail.cancellationUnansweredBody', 'orderDetail.cancellationRefundReviewPending', 'orderDetail.cancellationPortionCancelled'];
for (const lang of locales) {
  const messages = JSON.parse(read(`messages/${lang}.json`));
  const missing = required.filter((key) => typeof messages[key] !== 'string' || !messages[key].trim());
  check(`every cancellation-scope string exists in ${lang}`, missing.length === 0, missing.join(','));
  check(`the retired multi-seller string is gone from ${lang}`,
    messages['orderDetail.multiSellerCancellationUnavailable'] === undefined);
  const refund = String(messages['orderDetail.cancellationRefundReviewPending'] || '');
  check(`${lang} no longer ties the portion cancellation to the seller agreeing`,
    !/seller agreed|l’accord du vendeur|vandè a te dakò/i.test(refund));
  check(`${lang} still promises only a review, never a refund`,
    /review|vérification|verifikasyon/i.test(refund) && /no refund|aucun transfert|poko gen/i.test(refund));
}

if (failures > 0) {
  console.log(`\nFAIL: ${failures} cancellation-scope violation(s).`);
  process.exit(1);
}
console.log('OK: cancellation-scope policy holds (portion-scoped, unanswered resolvable, no silent money movement).');
