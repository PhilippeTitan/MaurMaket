/**
 * Inbox list policy — archive and the personal mark-unread reminder.
 *
 * Ledger: "Keep per-conversation mute, archive, and a small capped set of pinned
 * chats. Active order conversations/actions stay reachable from Orders and cannot
 * be buried; order-critical alerts remain available even when a chat is muted."
 *
 * and: "Add an Unread Inbox filter and a synced personal mark-unread reminder
 * without changing the other participant's read receipt."
 *
 * Two rules do the work here, and both are pure so the server and the guardrail
 * cannot drift apart:
 *
 *   1. Archiving files a chat away from the Inbox — but never at the cost of a
 *      live offer, which is time-sensitive and must stay in front of the user.
 *      An archived conversation with an active offer therefore stays visible.
 *   2. Mark-unread is a reminder the user left for themselves. It is a separate
 *      flag (`conversation_user_settings.marked_unread`), never a write to
 *      `messages.is_read` or `message_deliveries`, so the other participant's
 *      read receipt is untouched — their ticks never learn that we unflagged a
 *      message.
 *
 * No imports and no SQL on purpose: everything that reads this file must agree
 * on the same pure answers.
 */

/** Archived chats leave the Inbox, except when a live offer would be hidden. */
export function staysInInbox({ isArchived = false, hasActiveOffer = false } = {}) {
  return !isArchived || !!hasActiveOffer;
}

/**
 * A mark-unread request is a set, not a toggle: only an explicit `true` marks the
 * chat unread, and anything else clears the reminder. Repeating the same request
 * is therefore idempotent.
 */
export function normalizeMarkUnread(value) {
  return value === true;
}

/**
 * What the row shows next to the name. A real unread message outranks a personal
 * reminder, but either one means the row is not "read".
 */
export function unreadState({ unreadCount = 0, markedUnread = false } = {}) {
  if ((Number(unreadCount) || 0) > 0) return 'unread';
  if (markedUnread === true) return 'marked';
  return 'read';
}

/**
 * The Inbox badge counts messages that are genuinely unread plus the chats the
 * user flagged as reminders — one number, so the tab badge cannot disagree with
 * what the list is showing.
 */
export function inboxUnreadTotal({ unreadMessages = 0, markedConversations = 0 } = {}) {
  const messages = Math.max(0, Number(unreadMessages) || 0);
  const marked = Math.max(0, Number(markedConversations) || 0);
  return messages + marked;
}
