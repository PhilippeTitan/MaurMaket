/**
 * Message-search policy — Inbox/Messaging decisions.
 *
 * Ledger: "Support per-conversation search, optional safe link previews, and
 * image/voice attachments with validation, upload progress, and retry."
 *
 * Two decisions are worth pinning down, because both are the kind of thing that
 * looks harmless and is not:
 *
 *   1. The term is matched as a LITERAL substring, never as a LIKE pattern. A
 *      search box that turns `%` into "every message in this conversation" is not
 *      a convenience — in a private chat it is a way to dump the whole thread
 *      through a one-character query, and `_` silently matches any single
 *      character. The server therefore uses `strpos(...) > 0`, and this module
 *      deliberately has no escaping helper to get wrong.
 *   2. A term that is too short (or empty) is not an error and never a wildcard:
 *      it is simply "not a search yet", and both the app and the server must
 *      agree on that so a half-typed query cannot pull the conversation.
 *
 * No imports and no SQL: the server and the app both read these answers.
 */

/** At most this many matches come back; the rest are reported as truncated. */
export const MESSAGE_SEARCH_LIMIT = 50;

/** Below this the query is still being typed, so nothing is searched for it. */
export const MESSAGE_SEARCH_MIN_LENGTH = 2;

/** Longer than this is a paste, not a query; it is cut rather than rejected. */
export const MESSAGE_SEARCH_MAX_LENGTH = 100;

/**
 * Normalise a raw query into the term that will actually be matched.
 * Whitespace runs collapse to a single space so `"  hello   world "` and
 * `"hello world"` are the same search, and an over-long paste is truncated
 * rather than refused.
 *
 * @param {unknown} raw
 * @returns {{ term: string, valid: boolean }}
 */
export function normalizeSearchQuery(raw) {
  const source = typeof raw === 'string' ? raw : '';
  const term = source.replace(/\s+/g, ' ').trim().slice(0, MESSAGE_SEARCH_MAX_LENGTH);
  return { term, valid: term.length >= MESSAGE_SEARCH_MIN_LENGTH };
}
