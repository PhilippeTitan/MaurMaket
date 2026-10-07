#!/usr/bin/env node
/**
 * Message-bookmark check — Inbox/Messaging decisions.
 *
 * Ledger: "Keep message bookmarks private to the user and separate from
 * canonical order terms."
 *
 * Both halves of that sentence are easy to lose by accident:
 *
 *   1. **Private.** A bookmark is one person's own note. If a read or a write is
 *      ever scoped by message id alone, or by the conversation rather than the
 *      caller, one participant can read (or silently clear) the other's saved
 *      messages. Every statement must be pinned to the caller.
 *   2. **Separate from the deal.** If a bookmark ever writes into accepted-offer
 *      state, order events, or dispute evidence, then saving a line someone wrote
 *      has quietly become a change to the record a human later reads as the
 *      contract. The check asserts those tables are not reachable from here.
 *
 * It also holds the honest limits: a deleted message cannot be newly saved, and a
 * saved message whose author later deleted it shows the placeholder instead of
 * the withdrawn text.
 *
 * Run: node scripts/message-bookmark-check.js
 * Exit code 0 = clean, 1 = policy violation
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  bookmarkableMessage,
  bookmarkExcerpt,
  bookmarkPageSize,
  BOOKMARK_LIST_LIMIT,
  BOOKMARK_EXCERPT_MAX,
  BOOKMARK_DELETED_PLACEHOLDER,
} from '../src/utils/messageBookmarkPolicy.js';

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

console.log('Checking message-bookmark policy...\n');

// ── 1. What may be saved ──
check('a real, undeleted message can be saved',
  bookmarkableMessage({ exists: true, isDeleted: false }).bookmarkable === true);
check('a message that does not exist cannot be saved',
  bookmarkableMessage({ exists: false }).bookmarkable === false
  && bookmarkableMessage({ exists: false }).reason === 'missing');
check('an already-deleted message cannot be saved',
  bookmarkableMessage({ exists: true, isDeleted: true }).bookmarkable === false
  && bookmarkableMessage({ exists: true, isDeleted: true }).reason === 'deleted');
check('nothing is bookmarkable by default', bookmarkableMessage().bookmarkable === false);

// ── 2. What a saved message shows ──
check('an excerpt collapses whitespace and trims',
  bookmarkExcerpt('  hello   there \n friend  ') === 'hello there friend');
check('a short excerpt is kept whole',
  bookmarkExcerpt('worth remembering') === 'worth remembering');
const long = 'x'.repeat(BOOKMARK_EXCERPT_MAX + 200);
check('a long excerpt is cut to the shared maximum',
  bookmarkExcerpt(long).length <= BOOKMARK_EXCERPT_MAX && bookmarkExcerpt(long).endsWith('…'));
check('empty or missing content shows the placeholder, never a blank row',
  bookmarkExcerpt('') === BOOKMARK_DELETED_PLACEHOLDER
  && bookmarkExcerpt('   ') === BOOKMARK_DELETED_PLACEHOLDER
  && bookmarkExcerpt(null) === BOOKMARK_DELETED_PLACEHOLDER);
check('a deleted message shows the placeholder instead of its old text',
  bookmarkExcerpt('the withdrawn words', { isDeleted: true }) === BOOKMARK_DELETED_PLACEHOLDER);

// ── 3. Page size ──
check('the default page is the shared limit', bookmarkPageSize(undefined) === BOOKMARK_LIST_LIMIT);
check('an oversized request is clamped, not honoured',
  bookmarkPageSize(100000) === BOOKMARK_LIST_LIMIT && bookmarkPageSize('500') === BOOKMARK_LIST_LIMIT);
check('a junk or non-positive request falls back to the default',
  bookmarkPageSize('abc') === BOOKMARK_LIST_LIMIT
  && bookmarkPageSize(0) === BOOKMARK_LIST_LIMIT
  && bookmarkPageSize(-5) === BOOKMARK_LIST_LIMIT);

// ── 4. Every bookmark statement belongs to the caller, and only to them ──
const rawMessaging = read('src/routes/messaging.js');
const messaging = stripComments(rawMessaging);
const start = messaging.indexOf("router.get('/api/messages/bookmarks'");
const end = messaging.indexOf("router.put('/api/conversations/:id/pin'");
const bookmarkRoutes = messaging.slice(start, end);
check('the bookmark routes exist', start > -1 && end > start);

check('the list is scoped to the caller', /WHERE mb\.user_id = \$1 AND \(c\.buyer_id = \$1 OR c\.seller_id = \$1\)/.test(bookmarkRoutes));
check('saving is scoped to the caller',
  /INSERT INTO message_bookmarks \(user_id, message_id\) VALUES \(\$1, \$2\)/.test(bookmarkRoutes));
check('removing is scoped to the caller and nothing else',
  /DELETE FROM message_bookmarks WHERE user_id = \$1 AND message_id = \$2/.test(bookmarkRoutes));
check('no bookmark statement can be scoped by message id alone',
  !/DELETE FROM message_bookmarks WHERE message_id/.test(bookmarkRoutes)
  && !/WHERE message_id = \$1/.test(bookmarkRoutes));
check('saving is idempotent',
  /ON CONFLICT \(user_id, message_id\) DO NOTHING/.test(bookmarkRoutes));
check('the participant is re-checked before a save',
  /WHERE m\.id = \$1 AND \(c\.buyer_id = \$2 OR c\.seller_id = \$2\)/.test(bookmarkRoutes));
check('a deleted message is refused rather than saved',
  /A deleted message cannot be saved/.test(bookmarkRoutes)
  && /BOOKMARK_MESSAGE_DELETED/.test(bookmarkRoutes));
check('a missing message is a 404 and a deleted one a 409',
  /res\.status\(reason === 'missing' \? 404 : 409\)/.test(bookmarkRoutes));
check('the list fetches one row past the limit so \"more\" is honest',
  /LIMIT \$2`,\n\s*\[req\.user\.id, limit \+ 1\]/.test(bookmarkRoutes)
  && /const truncated = rows\.rows\.length > limit;/.test(bookmarkRoutes));
check('the excerpt is built by the shared policy, not inline',
  /bookmarkExcerpt\(row\.content, \{ isDeleted: row\.is_deleted \}\)/.test(bookmarkRoutes));

// ── 5. Saving a message is not a change to the deal ──
const reachable = [
  [/INSERT INTO orders/, 'orders'],
  [/UPDATE orders/, 'orders'],
  [/order_events/, 'order_events'],
  [/order_evidence/, 'order_evidence'],
  [/message_offers/, 'message_offers'],
  [/disputes/, 'disputes'],
  [/message_deliveries/, 'message_deliveries'],
  [/UPDATE messages/, 'messages'],
  [/INSERT INTO messages/, 'messages'],
  [/UPDATE seller_fulfillments/, 'seller_fulfillments'],
  [/stock_reservations/, 'stock_reservations'],
];
for (const [pattern, table] of reachable) {
  check(`the bookmark routes cannot reach ${table}`, !pattern.test(bookmarkRoutes));
}
check('bookmarking writes no read receipt and no unread bookkeeping',
  !/is_read/.test(bookmarkRoutes) && !/\bread_at\b/.test(bookmarkRoutes));

// ── 6. The schema keeps a bookmark to one person ──
const server = stripComments(read('server.js'));
const migration = (server.match(/CREATE TABLE IF NOT EXISTS message_bookmarks[\s\S]*?`\)\)/) || [''])[0];
check('the message_bookmarks table is created', Boolean(migration));
check('a bookmark is keyed by the person and the message',
  /PRIMARY KEY \(user_id, message_id\)/.test(migration));
check('a bookmark cannot outlive its user or its message',
  /user_id UUID REFERENCES users\(id\) ON DELETE CASCADE NOT NULL/.test(migration)
  && /message_id UUID REFERENCES messages\(id\) ON DELETE CASCADE NOT NULL/.test(migration));
check('the list has an index matching its ordering',
  /CREATE INDEX IF NOT EXISTS idx_message_bookmarks_user_created\s*\n\s*ON message_bookmarks\(user_id, created_at DESC\)/.test(server));

// ── 7. The app offers it, and never claims it is shared ──
const chat = stripComments(read('src/screens/ChatScreen.tsx'));
const inbox = stripComments(read('src/screens/InboxScreen.tsx'));
const saved = stripComments(read('src/screens/SavedMessagesScreen.tsx'));
const app = stripComments(read('App.tsx'));
const nav = stripComments(read('src/navigation.ts'));
const api = stripComments(read('src/api.ts'));

check('the message menu offers saving and removing',
  /onPress=\{handleToggleBookmark\}/.test(chat)
  && /t\(actionMenuMessage\?\.bookmarked \? 'chat.removeBookmark' : 'chat.saveBookmark'\)/.test(chat));
check('the menu icon distinguishes saved from unsaved',
  /actionMenuMessage\?\.bookmarked \? 'bookmark' : 'bookmark-outline'/.test(chat));
check('an optimistic flip is rolled back on failure',
  /apply\(!wasBookmarked\);/.test(chat) && /apply\(wasBookmarked\);/.test(chat));
check('the client calls the caller-scoped endpoints only',
  /bookmarkMessage = \(messageId: string\)/.test(api)
  && /unbookmarkMessage = \(messageId: string\)/.test(api)
  && /\/messages\/\$\{messageId\}\/bookmark/.test(api));
check('the saved list explains that it is private and not an order change',
  /savedMessages\.explainer/.test(saved));
check('a deleted saved message is shown as deleted, not as its old text',
  /item\.isDeleted && styles\.excerptDeleted/.test(saved));
check('the saved list is reachable from the Inbox',
  /t\('inbox\.savedMessages'\)/.test(inbox) && /nav\.navigate\('SavedMessages'\)/.test(inbox));
check('the screen is registered',
  /SavedMessages: undefined;/.test(nav) && /name="SavedMessages" component=\{SavedMessagesScreen\}/.test(app));

// ── 8. Every string exists in EN/FR/HT ──
const locales = ['en', 'fr', 'ht'];
const keys = [
  'inbox.savedMessages', 'savedMessages.title', 'savedMessages.explainer', 'savedMessages.empty',
  'savedMessages.openChat', 'savedMessages.savedOn', 'savedMessages.truncated',
  'savedMessages.unknownPeer', 'savedMessages.loadError',
  'chat.saveBookmark', 'chat.removeBookmark', 'chat.bookmarkSaved', 'chat.bookmarkRemoved', 'chat.bookmarkFailed',
];
for (const lang of locales) {
  const messages = JSON.parse(read(`messages/${lang}.json`));
  const missing = keys.filter((key) => typeof messages[key] !== 'string' || !messages[key].trim());
  check(`every bookmark string exists in ${lang}`, missing.length === 0, missing.join(','));
  check(`the saved-on and open-chat strings keep their placeholders in ${lang}`,
    String(messages['savedMessages.savedOn']).includes('{date}')
    && String(messages['savedMessages.openChat']).includes('{name}'));
}

if (failures > 0) {
  console.log(`\nFAIL: ${failures} message-bookmark violation(s).`);
  process.exit(1);
}
console.log('OK: message-bookmark policy holds (private to the caller, separate from order terms).');
