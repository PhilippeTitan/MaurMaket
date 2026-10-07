/**
 * Message bookmark policy — Inbox/Messaging decisions.
 *
 * Ledger: "Keep message bookmarks private to the user and separate from canonical
 * order terms."
 *
 * Two halves, and the second is the one that gets forgotten:
 *
 *   1. **Private.** A bookmark is one person's note to themselves. It is keyed by
 *      (user_id, message_id) and every read and write is scoped to the caller, so
 *      there is no row shape in which one participant could see or change the
 *      other's saved messages. Bookmarking also never tells the other person: it
 *      writes no read receipt, no delivery state, and no message row.
 *   2. **Separate from the deal.** A saved message is a bookmark, never a term.
 *      It must not reach accepted-offer state, order events, dispute evidence, or
 *      any snapshot a human later reads as the canonical record. The guardrail
 *      asserts the statement cannot touch those tables at all.
 *
 * The rest is honest limits: a list you can actually read, an excerpt that shows
 * what the message says *now* rather than what it said when it was saved (a
 * deleted message must not leak its old text back out), and a refusal to create
 * a bookmark for a message that no longer exists or was already deleted.
 *
 * No imports: the route and the guardrail read the same answers.
 */

/** How many bookmarks the list returns at most. */
export const BOOKMARK_LIST_LIMIT = 100;

/** Longest excerpt kept for a saved message, in characters. */
export const BOOKMARK_EXCERPT_MAX = 160;

/** What a saved message shows once it has been deleted by its author. */
export const BOOKMARK_DELETED_PLACEHOLDER = 'Message deleted';

/**
 * Whether this message can be bookmarked right now.
 *
 * A message that does not exist cannot be saved. A message that has already been
 * deleted cannot be saved either — there is nothing left to keep, and letting it
 * be saved would create a new path to the text the author withdrew.
 *
 * @param {{ exists?: boolean, isDeleted?: boolean }} [message]
 * @returns {{ bookmarkable: boolean, reason: 'missing'|'deleted'|null }}
 */
export function bookmarkableMessage({ exists = false, isDeleted = false } = {}) {
  if (!exists) return { bookmarkable: false, reason: 'missing' };
  if (isDeleted) return { bookmarkable: false, reason: 'deleted' };
  return { bookmarkable: true, reason: null };
}

/**
 * The excerpt shown in the saved-messages list.
 *
 * Returns the *current* text, whitespace-collapsed and cut to the shared limit,
 * and the placeholder for a message whose author has since deleted it — the
 * listing must never be a way to read text that was withdrawn.
 *
 * @param {string|null|undefined} content
 * @param {{ isDeleted?: boolean, placeholder?: string }} [options]
 * @returns {string}
 */
export function bookmarkExcerpt(content, { isDeleted = false, placeholder = BOOKMARK_DELETED_PLACEHOLDER } = {}) {
  if (isDeleted) return placeholder;
  const collapsed = String(content ?? '').replace(/\s+/g, ' ').trim();
  if (!collapsed) return placeholder;
  if (collapsed.length <= BOOKMARK_EXCERPT_MAX) return collapsed;
  return `${collapsed.slice(0, BOOKMARK_EXCERPT_MAX - 1).trimEnd()}…`;
}

/**
 * Bound the requested page size. A caller asking for a million bookmarks gets the
 * shared limit; a caller asking for nothing gets the shared limit too.
 *
 * @param {unknown} requested
 * @returns {number}
 */
export function bookmarkPageSize(requested) {
  const parsed = Number(requested);
  if (!Number.isFinite(parsed) || parsed <= 0) return BOOKMARK_LIST_LIMIT;
  return Math.min(Math.floor(parsed), BOOKMARK_LIST_LIMIT);
}
