/**
 * Message-request policy — the first-contact area (Inbox/Messaging decisions,
 * APP-Q154, APP-Q164–APP-Q173).
 *
 * Ledger lines this file exists to keep in one place:
 *   - "Use a lightweight Requests area for first contact with listing/order
 *     context; acceptance moves it into Inbox, while urgent order messages stay
 *     direct." (APP-Q154)
 *   - "Show chosen public identity and relevant listing/order context; hide
 *     private account/KYC data and unrelated profile details." (APP-Q164)
 *   - "Offer Accept, Delete, and Report, with Block in overflow; deleting declines
 *     without affecting an order/listing." (APP-Q165)
 *   - "No read receipt before acceptance; show delivery, then apply ordinary
 *     read-receipt preference after acceptance." (APP-Q166)
 *   - "Allow one concise initial message with listing context; hold follow-ups
 *     until acceptance, preserving urgent existing-order contact." (APP-Q167)
 *   - "Do not silently expire quickly; archive stale requests after a clear
 *     period with a visible restore path." (APP-Q168)
 *   - "None [no attachments] before acceptance; supported media becomes
 *     available after acceptance." (APP-Q169)
 *   - "No [formal offer through an unaccepted request]; accept the conversation
 *     first, then use the established offer flow." (APP-Q170)
 *   - "Show a neutral status without revealing whether the recipient deleted,
 *     reported, or blocked them; no decline push." (APP-Q172)
 *   - "Separate Requests count from accepted chats/offers count." (APP-Q173)
 *
 * Two properties make the whole area safe, and both are pure functions here so
 * the routes, the jobs and the guardrail cannot drift apart:
 *
 *   1. **A pending request is the only gated state.** `request_state` is NULL on
 *      every conversation that existed before this feature and on every order
 *      thread, so "urgent existing-order contact stays direct" is structural
 *      rather than a special case. Acceptance is a permanent transition; a
 *      decline is neutral to the sender and hidden for the recipient.
 *   2. **The stranger's side is read-only until accepted.** One plain message,
 *      no attachments, no offers, no listing shares, no read receipts — all of
 *      them the same answer (`requestAllows`) instead of five scattered checks.
 *
 * No imports and no SQL on purpose: everything that reads this file must agree
 * on the same answers.
 */

export const REQUEST_STATE = {
  /** Waiting for the recipient's decision. The only gated state. */
  PENDING: 'pending',
  /** The recipient accepted; the conversation is an ordinary one now. */
  ACCEPTED: 'accepted',
  /** The recipient deleted it. Neutral to the sender, gone for the recipient. */
  DECLINED: 'declined',
};

/**
 * How long an unanswered request stays in the active area before it is filed
 * away (APP-Q168). Deliberately generous: "do not silently expire quickly".
 * The archive has a visible restore path, and nothing is ever deleted by time.
 */
export const REQUEST_STALE_DAYS = 30;

/**
 * Whether a conversation being created right now is a first contact.
 *
 * An order thread is existing business and stays direct (APP-Q154). A pair with
 * any earlier non-pending conversation (an accepted thread, a past order thread)
 * is not a stranger either — that is what makes repeat contact direct.
 *
 * @param {{ orderId?: string|null, hasPriorConversation?: boolean }} input
 * @returns {'pending'|null}
 */
export function firstContactState({ orderId = null, hasPriorConversation = false } = {}) {
  if (orderId) return null;
  if (hasPriorConversation) return null;
  return REQUEST_STATE.PENDING;
}

/**
 * The person who receives the request: the party who did not write it.
 *
 * @param {{ buyerId?: string, sellerId?: string, requestedBy?: string|null }} input
 * @returns {string|null}
 */
export function requestRecipientId({ buyerId, sellerId, requestedBy } = {}) {
  if (requestedBy === buyerId) return sellerId || null;
  if (requestedBy === sellerId) return buyerId || null;
  return null;
}

/**
 * What the initiator may send before acceptance: exactly one plain text message
 * (APP-Q167). Images, voice notes, listing shares and offers are all held — not
 * silently dropped, refused with a stated reason, because the client shows the
 * held state.
 *
 * @param {{ sentByRequester?: number, messageType?: string }} input
 * @returns {boolean}
 */
export function canSendBeforeAcceptance({ sentByRequester = 0, messageType = 'text' } = {}) {
  return messageType === 'text' && Number(sentByRequester) === 0;
}

/**
 * The one gate a pending request applies to every outgoing thing in a
 * conversation. `kind` separates an ordinary message from the two side doors —
 * a listing share and a formal offer — so adding a third door means updating
 * one table instead of remembering five routes.
 *
 * @param {{ requestState?: string|null, isRequester?: boolean, sentByRequester?: number, messageType?: string, kind?: 'message'|'listing'|'offer' }} input
 * @returns {{ allowed: true } | { allowed: false, reason: 'request_not_accepted'|'request_followup_held' }}
 */
export function requestAllows({
  requestState = null,
  isRequester = false,
  sentByRequester = 0,
  messageType = 'text',
  kind = 'message',
} = {}) {
  if (requestState !== REQUEST_STATE.PENDING && requestState !== REQUEST_STATE.DECLINED) return { allowed: true };
  // The recipient of an unaccepted request cannot write back in it at all: the
  // decision lives in the Requests area, not in the thread.
  if (!isRequester) return { allowed: false, reason: 'request_not_accepted' };
  // A declined request was never accepted, so follow-ups stay held forever
  // (APP-Q167: "hold follow-ups until acceptance"). The sender keeps their thread
  // and a neutral status, and writes into it no further (APP-Q172).
  if (requestState === REQUEST_STATE.DECLINED) return { allowed: false, reason: 'request_not_accepted' };
  if (kind !== 'message') return { allowed: false, reason: 'request_followup_held' };
  return canSendBeforeAcceptance({ sentByRequester, messageType })
    ? { allowed: true }
    : { allowed: false, reason: 'request_followup_held' };
}

/**
 * Read receipts never leave a pending request (APP-Q166). Delivery still does:
 * the sender sees that their one message arrived, and only the read tick waits
 * for acceptance.
 */
export function readReceiptAllowed({ requestState = null } = {}) {
  return requestState !== REQUEST_STATE.PENDING;
}

/**
 * The sender-facing label. Only two states exist for them, and neither reveals
 * what the recipient did — deleted, reported and blocked all read the same
 * (APP-Q172). An accepted thread is simply an ordinary conversation.
 *
 * @param {{ requestState?: string|null, isRequester?: boolean }} input
 * @returns {'waiting'|'not_accepted'|null}
 */
export function senderRequestStatus({ requestState = null, isRequester = false } = {}) {
  if (!isRequester) return null;
  if (requestState === REQUEST_STATE.PENDING) return 'waiting';
  if (requestState === REQUEST_STATE.DECLINED) return 'not_accepted';
  return null;
}

/**
 * The recipient-facing state: a pending request is shown in the Requests area
 * and nowhere else. Accepted and declined threads are no longer requests.
 *
 * @param {{ requestState?: string|null, isRequester?: boolean }} input
 * @returns {'pending'|null}
 */
export function recipientRequestState({ requestState = null, isRequester = false } = {}) {
  if (isRequester) return null;
  return requestState === REQUEST_STATE.PENDING ? 'pending' : null;
}

/**
 * Whether an unanswered request is old enough to be filed away (APP-Q168).
 * Nothing is ever deleted: it moves to the recipient's archived list with a
 * one-tap restore.
 *
 * @param {{ createdAt?: string|Date|null, now?: Date, alreadyArchived?: boolean }} input
 * @returns {boolean}
 */
export function shouldArchiveStaleRequest({ createdAt = null, now = new Date(), alreadyArchived = false } = {}) {
  if (alreadyArchived) return false;
  if (!createdAt) return false;
  const ageMs = now.getTime() - new Date(createdAt).getTime();
  return ageMs >= REQUEST_STALE_DAYS * 86400000;
}

/** What the recipient can do with a request, and where Block lives (APP-Q165). */
export const REQUEST_PRIMARY_ACTIONS = ['accept', 'decline', 'report'];
export const REQUEST_OVERFLOW_ACTIONS = ['block', 'archive'];
