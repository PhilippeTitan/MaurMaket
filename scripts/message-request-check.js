#!/usr/bin/env node
/**
 * Message-request check — first-contact area (APP-Q154, APP-Q164–Q173).
 *
 * Ledger lines this file exists to keep working:
 *   - Q154: lightweight Requests area for first contact with listing/order
 *     context; acceptance moves it into Inbox; urgent order contact stays direct.
 *   - Q164: chosen public identity + listing/order context only; no KYC data.
 *   - Q165: Accept / Delete / Report + Block in overflow; deleting declines
 *     without touching an order or listing.
 *   - Q166: no read receipt before acceptance — delivery only.
 *   - Q167: one concise initial message; follow-ups held until acceptance.
 *   - Q168: no quick silent expiry; archive after a clear period + restore.
 *   - Q169: no attachments before acceptance.
 *   - Q170: no formal offers through an unaccepted request.
 *   - Q171: accepting does not auto-follow.
 *   - Q172: neutral sender status (waiting / not accepted), never what the
 *     recipient did; no decline push.
 *   - Q173: separate Requests badge from the Inbox badge.
 *
 * The pure policy answers are asserted directly; the routes and screens are
 * asserted by pattern so a refactor that drops a gate fails here first.
 *
 * Run: node scripts/message-request-check.js
 * Exit code 0 = clean, 1 = policy violation
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  REQUEST_STATE,
  REQUEST_STALE_DAYS,
  REQUEST_PRIMARY_ACTIONS,
  REQUEST_OVERFLOW_ACTIONS,
  firstContactState,
  requestRecipientId,
  canSendBeforeAcceptance,
  requestAllows,
  readReceiptAllowed,
  senderRequestStatus,
  recipientRequestState,
  shouldArchiveStaleRequest,
} from '../src/utils/messageRequestPolicy.js';

const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');
// Sources are CRLF on disk; normalise before matching so a pattern written as
// `{\n` cannot silently miss `{\r\n` (the classic false pass).
const stripComments = (src) => src
  .replace(/\r/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/^\s*--.*$/gm, '');
const between = (src, startMarker, endMarker) => {
  const s = src.indexOf(startMarker);
  if (s < 0) return null;
  const e = src.indexOf(endMarker, s + startMarker.length);
  return e < 0 ? null : src.slice(s, e);
};

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

console.log('Checking message-request policy...\n');

// ── 1. First contact, recipient, stale window (Q154, Q168) ──
check('an order thread is never a request (urgent order contact stays direct)',
  firstContactState({ orderId: 'order-1' }) === null);
check('a pair with prior conversation stays direct',
  firstContactState({ hasPriorConversation: true }) === null);
check('a stranger knock is pending',
  firstContactState({}) === 'pending' && firstContactState({ orderId: null, hasPriorConversation: false }) === 'pending');
check('the stale window is disclosed and generous (not a quick silent expiry)',
  REQUEST_STALE_DAYS >= 30);
check('the recipient is the party who did not write the request',
  requestRecipientId({ buyerId: 'a', sellerId: 'b', requestedBy: 'a' }) === 'b'
  && requestRecipientId({ buyerId: 'a', sellerId: 'b', requestedBy: 'b' }) === 'a');
check('the recipient is never invented for a stranger pair',
  requestRecipientId({ buyerId: 'a', sellerId: 'b', requestedBy: 'c' }) === null);

// ── 2. What the sender may send before acceptance (Q167, Q169, Q170) ──
check('exactly one plain text message is allowed up front',
  canSendBeforeAcceptance({ sentByRequester: 0 }) === true
  && canSendBeforeAcceptance({ sentByRequester: 1 }) === false);
check('no attachment of any kind before acceptance',
  canSendBeforeAcceptance({ messageType: 'image' }) === false
  && canSendBeforeAcceptance({ messageType: 'audio' }) === false);
check('the pending gate answers one table for messages, shares and offers',
  JSON.stringify(requestAllows({ requestState: REQUEST_STATE.PENDING, isRequester: true, sentByRequester: 0, kind: 'listing' }))
    === JSON.stringify({ allowed: false, reason: 'request_followup_held' })
  && JSON.stringify(requestAllows({ requestState: REQUEST_STATE.PENDING, isRequester: true, sentByRequester: 0, kind: 'offer' }))
    === JSON.stringify({ allowed: false, reason: 'request_followup_held' }));
check('the recipient cannot write back into an unaccepted request at all',
  JSON.stringify(requestAllows({ requestState: REQUEST_STATE.PENDING, isRequester: false }))
    === JSON.stringify({ allowed: false, reason: 'request_not_accepted' }));
check('the requester gets their one message, then follow-ups are held',
  requestAllows({ requestState: REQUEST_STATE.PENDING, isRequester: true, sentByRequester: 0 }).allowed === true
  && requestAllows({ requestState: REQUEST_STATE.PENDING, isRequester: true, sentByRequester: 1 }).allowed === false);
check('a declined request holds follow-ups forever — it was never accepted (Q167)',
  requestAllows({ requestState: REQUEST_STATE.DECLINED, isRequester: true, sentByRequester: 5 }).allowed === false
  && requestAllows({ requestState: REQUEST_STATE.DECLINED, isRequester: true, sentByRequester: 0 }).allowed === false
  && requestAllows({ requestState: REQUEST_STATE.DECLINED, isRequester: false }).allowed === false);
check('an accepted or ordinary conversation is unrestricted again',
  requestAllows({ requestState: REQUEST_STATE.ACCEPTED, isRequester: true, sentByRequester: 9, messageType: 'image' }).allowed === true
  && requestAllows({ requestState: null, isRequester: false, messageType: 'audio' }).allowed === true);

// ── 3. Read receipts and the two neutral statuses (Q166, Q172) ──
check('no read receipt leaves a pending request, delivery still allowed',
  readReceiptAllowed({ requestState: REQUEST_STATE.PENDING }) === false
  && readReceiptAllowed({ requestState: REQUEST_STATE.ACCEPTED }) === true
  && readReceiptAllowed({ requestState: null }) === true);
check('the sender sees only waiting / not accepted — never what happened',
  senderRequestStatus({ requestState: REQUEST_STATE.PENDING, isRequester: true }) === 'waiting'
  && senderRequestStatus({ requestState: REQUEST_STATE.DECLINED, isRequester: true }) === 'not_accepted'
  && senderRequestStatus({ requestState: REQUEST_STATE.ACCEPTED, isRequester: true }) === null
  && senderRequestStatus({ requestState: REQUEST_STATE.PENDING, isRequester: false }) === null
  && senderRequestStatus({ requestState: REQUEST_STATE.DECLINED, isRequester: false }) === null);
check('the recipient sees pending only while it is pending',
  recipientRequestState({ requestState: REQUEST_STATE.PENDING, isRequester: false }) === 'pending'
  && recipientRequestState({ requestState: REQUEST_STATE.PENDING, isRequester: true }) === null
  && recipientRequestState({ requestState: REQUEST_STATE.DECLINED, isRequester: false }) === null);
check('the primary actions are Accept / Delete / Report, Block lives in overflow (Q165)',
  REQUEST_PRIMARY_ACTIONS.join(',') === 'accept,decline,report'
  && REQUEST_OVERFLOW_ACTIONS.includes('block'));
check('staleness is decided by the shared policy, not re-derived',
  shouldArchiveStaleRequest({ createdAt: new Date(Date.now() - 29 * 86400000) }) === false
  && shouldArchiveStaleRequest({ createdAt: new Date(Date.now() - 31 * 86400000) }) === true
  && shouldArchiveStaleRequest({ createdAt: new Date(), alreadyArchived: true }) === false
  && shouldArchiveStaleRequest({ createdAt: null }) === false);

// ── 4. The routes actually use the shared answers ──
const messaging = stripComments(read('src/routes/messaging.js'));
const offers = stripComments(read('src/routes/offers.js'));
const jobs = stripComments(read('src/jobs/index.js'));
const server = stripComments(read('server.js'));

check('messaging imports the shared policy, not a private copy of it',
  /REQUEST_STATE, requestRecipientId, firstContactState, requestAllows/.test(messaging)
  && /readReceiptAllowed, senderRequestStatus, recipientRequestState/.test(messaging));
check('first contact is computed by the shared policy at conversation creation',
  /firstContactState\(\{ orderId, hasPriorConversation: prior\.rows\.length > 0 \}\)/.test(messaging));
check('the send gate covers pending AND declined through requestAllows (Q167)',
  /gateState === REQUEST_STATE\.PENDING \|\| gateState === REQUEST_STATE\.DECLINED/.test(messaging)
  && /requestAllows\(\{ requestState: gateState/.test(messaging));
check('a held send fails loudly with the agreed codes, not a silent drop',
  /REQUEST_NOT_ACCEPTED/.test(messaging) && /REQUEST_FOLLOWUP_HELD/.test(messaging));
check('listing shares go through the same gate, not a hand-rolled check',
  /kind: 'listing'/.test(messaging)
  && !messaging.includes('conversation.request_state === REQUEST_STATE.PENDING'));
check('offers go through the same gate (Q170)',
  /kind: 'offer'/.test(offers) && /REQUEST_NOT_ACCEPTED/.test(offers));
check('reading a pending thread never flips the read tick (Q166)',
  /if \(readReceiptAllowed\(\{ requestState: conv\.rows\[0\]\.request_state \}\)\)/.test(messaging));
check('the mark-read endpoint returns early for a pending request (Q166)',
  /requestPending: true/.test(messaging));
check('thread context tells the client the shared state instead of re-deriving it',
  /senderStatus: senderRequestStatus\(/.test(messaging)
  && /recipientState: recipientRequestState\(/.test(messaging)
  && /canSend: requestAllows\(/.test(messaging));

// ── 5. Inbox, unread and Requests stay separate (Q154, Q172, Q173) ──
const excludedEverywhere = "(c.request_state IS DISTINCT FROM 'pending' AND c.request_state IS DISTINCT FROM 'declined') OR c.requested_by = $1";
const occurrences = messaging.split(excludedEverywhere).length - 1;
check('the Inbox list and both unread counts keep pending AND declined-for-me out',
  occurrences === 3, `found ${occurrences}`);
check('the sender still sees their own thread, labelled only neutrally (Q172)',
  /conv\.request_label = senderRequestStatus\(/.test(messaging));
check('repeat contact is direct because any answered conversation counts as prior',
  /request_state IS DISTINCT FROM 'pending' LIMIT 1/.test(messaging));
check('the separate Requests endpoint exists with its own count (Q173)',
  /router\.get\('\/api\/conversations\/requests', authRequired/.test(messaging)
  && /unreadCount: active\.length/.test(messaging));
check('the Requests list is the recipient\'s pending set only (Q164: identity + context, nothing else)',
  /WHERE c\.request_state = 'pending' AND c\.requested_by <> \$1/.test(messaging)
  && /username AS requester_username/.test(messaging)
  && /avatar_url AS requester_avatar/.test(messaging));

const requestsRoute = between(messaging, "router.get('/api/conversations/requests'", 'const REQUEST_DECISIONS');
check('the Requests fetch marks delivery honestly and never read (Q166)',
  !!requestsRoute && /status = 'delivered'/.test(requestsRoute)
  && !/is_read\s*=\s*true/.test(requestsRoute || ''),
  requestsRoute === null ? 'requests route not found' : '');

// ── 6. Decisions: recipient-only, silent decline, no auto-follow (Q165, Q171, Q172) ──
const decisionRoute = between(messaging, 'const REQUEST_DECISIONS', 'export default router');
check('only the four agreed decisions exist',
  !!decisionRoute && /new Set\(\['accept', 'decline', 'archive', 'restore'\]\)/.test(decisionRoute || ''));
check('only the recipient can answer a request',
  !!decisionRoute && /Only the recipient can answer a message request/.test(decisionRoute || ''));
check('accepting is a one-way transition guarded against double answers',
  !!decisionRoute && /request_state = 'pending' RETURNING requested_by/.test(decisionRoute || '')
  && /REQUEST_ALREADY_ANSWERED/.test(decisionRoute || ''));
const acceptBranch = decisionRoute ? between(decisionRoute, "if (decision === 'accept')", "if (decision === 'decline')") : null;
check('accepting only opens the conversation — no follow is written (Q171)',
  !!acceptBranch && !/follow/i.test(acceptBranch || ''), 'accept branch writes a follow');
const declineBranch = decisionRoute ? between(decisionRoute, "if (decision === 'decline')", 'if (conversation.request_state !== REQUEST_STATE.PENDING)') : null;
check('declining is silent: no emit, no push (Q172)',
  !!declineBranch && !/emitToUsers|sendPush|createNotification/.test(declineBranch || ''), 'decline notifies someone');
check('declining changes no order and no listing (Q165)',
  !!declineBranch && !/UPDATE orders|UPDATE products|UPDATE order_items/.test(declineBranch || '')
  && /SET request_state = 'declined'/.test(declineBranch || ''));
check('accepting emits a live refresh to both parties',
  !!acceptBranch && /request_updated/.test(acceptBranch || ''));

// ── 7. Stale requests are archived by the daily job, never deleted (Q168) ──
check('the daily job asks the shared policy what stale means',
  /shouldArchiveStaleRequest\(\{ createdAt: row\.created_at \}\)/.test(jobs));
check('the job only ever files pending requests, with restore left intact',
  /UPDATE conversations SET request_archived_at = CURRENT_TIMESTAMP/.test(jobs)
  && /request_state = 'pending'/.test(jobs));

// ── 8. Migration adds the request columns (step 98) ──
check('migration adds request_state, requested_by and request_archived_at',
  /ALTER TABLE conversations ADD COLUMN IF NOT EXISTS request_state TEXT/.test(server)
  && /ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES users\(id\)/.test(server)
  && /ADD COLUMN IF NOT EXISTS request_archived_at TIMESTAMPTZ/.test(server));
check('a partial index keeps the pending list cheap',
  /idx_conversations_pending_requests/.test(server) && /WHERE request_state = 'pending'/.test(server));

// ── 9. The screens offer exactly the agreed experience ──
const requestScreen = stripComments(read('src/screens/MessageRequestsScreen.tsx'));
const inbox = stripComments(read('src/screens/InboxScreen.tsx'));
const chat = stripComments(read('src/screens/ChatScreen.tsx'));
const api = stripComments(read('src/api.ts'));

check('the screen offers Accept, Delete, Report, then Archive and Block (Q165)',
  /acceptMessageRequest\(/.test(requestScreen)
  && /declineMessageRequest\(/.test(requestScreen)
  && /reportConversationUser\(/.test(requestScreen)
  && /archiveMessageRequest\(/.test(requestScreen)
  && /blockUser\(/.test(requestScreen));
check('accepting opens an ordinary conversation in the Inbox (Q154)',
  /navigation\.navigate\('Chat'/.test(requestScreen));
check('the recipient sees public identity and context only — no private/KYC data (Q164)',
  !/email|phone|kyc|birth|government/i.test(requestScreen),
  'private field referenced');
check('reporting reuses the shared reasons and never removes the request (Q165)',
  /chat\.reportReason\./.test(requestScreen));
check('the Inbox has its own Requests row with its own badge (Q173)',
  /inbox\.requestsEntry/.test(inbox) && /styles\.requestsCountBadge/.test(inbox));
check('the sender\'s thread carries the neutral label into the Inbox (Q172)',
  /request_label/.test(inbox) && /requests\.statusWaiting/.test(inbox) && /requests\.statusNotAccepted/.test(inbox));
check('the chat states the held/waiting state and holds the composer (Q166/Q167)',
  /requests\.senderHint/.test(chat) && /requests\.senderWaitingBody/.test(chat)
  && /requests\.recipientHint/.test(chat)
  && /requestInfo && !requestInfo\.canSend \? null/.test(chat));
check('a declined request shows only the neutral status in the thread (Q172)',
  /requests\.senderDeclined/.test(chat));
check('the client API exposes the five request operations',
  /export const getMessageRequests/.test(api)
  && /export const acceptMessageRequest/.test(api)
  && /export const declineMessageRequest/.test(api)
  && /export const archiveMessageRequest/.test(api)
  && /export const restoreMessageRequest/.test(api));
check('the screen is registered in navigation and the app stack',
  /MessageRequests: undefined;/.test(stripComments(read('src/navigation.ts')))
  && /name="MessageRequests"/.test(stripComments(read('App.tsx'))));

// ── 10. Every string exists in EN/FR/HT, and the sender-facing ones stay neutral ──
const keys = [
  'inbox.requestsEntry', 'inbox.requestsHint',
  'requests.title', 'requests.explainer', 'requests.loadError', 'requests.empty',
  'requests.emptyHint', 'requests.accept', 'requests.delete', 'requests.report',
  'requests.archive', 'requests.block', 'requests.restore', 'requests.acceptedToast',
  'requests.deletedToast', 'requests.archivedToast', 'requests.restoredToast',
  'requests.blockedToast', 'requests.actionFailed', 'requests.reportTitle',
  'requests.reportSubmit', 'requests.contextOrder', 'requests.contextListing',
  'requests.contextGeneral', 'requests.unknownSender', 'requests.senderHint',
  'requests.senderWaitingBody', 'requests.recipientHint', 'requests.senderDeclined',
  'requests.statusWaiting', 'requests.statusNotAccepted', 'requests.archivedToggle',
];
// The sender must never learn what the recipient actually did (Q172).
const revealsAction = /delet|effac|suppress|efas|report|rap[oò]rt|blok|block/i;
for (const lang of ['en', 'fr', 'ht']) {
  const messages = JSON.parse(read(`messages/${lang}.json`));
  const missing = keys.filter((key) => typeof messages[key] !== 'string' || !messages[key].trim());
  check(`every message-request string exists in ${lang}`, missing.length === 0, missing.join(','));
  for (const senderKey of ['requests.senderDeclined', 'requests.statusNotAccepted', 'requests.statusWaiting']) {
    check(`${lang} keeps ${senderKey} neutral`,
      !revealsAction.test(String(messages[senderKey])), String(messages[senderKey]));
  }
}

if (failures > 0) {
  console.log(`\nFAIL: ${failures} message-request violation(s).`);
  process.exit(1);
}
console.log('OK: message-request policy holds (one message then held, delivery without read, neutral sender status, separate badge, silent decline, 30-day archive with restore).');
