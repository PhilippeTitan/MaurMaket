#!/usr/bin/env node
/**
 * Conversation-list check — Inbox/Messaging decisions.
 *
 * "Keep per-conversation mute, archive, and a small capped set of pinned chats.
 * Active order conversations/actions stay reachable from Orders and cannot be
 * buried; order-critical alerts remain available even when a chat is muted."
 *
 * and: "Add an Unread Inbox filter and a synced personal mark-unread reminder
 * without changing the other participant's read receipt."
 *
 * Three things are easy to get wrong here and all three are silent:
 *   - archiving that writes a shared row would file the chat away for BOTH people;
 *   - "mark unread" spelled as `messages.is_read = false` is not a private reminder
 *     at all — it is a write to the sender's read receipt (and to the reader's own
 *     unread bookkeeping);
 *   - an archived chat that hides a live offer, or a new message that lands in a
 *     filed-away conversation and is never seen again.
 *
 * The shared rules live in src/utils/conversationListPolicy.js, so this script
 * exercises them directly and then asserts the server and the app actually call them.
 *
 * Run: node scripts/conversation-list-check.js
 * Exit code 0 = clean, 1 = policy violation
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  staysInInbox,
  normalizeMarkUnread,
  unreadState,
  inboxUnreadTotal,
} from '../src/utils/conversationListPolicy.js';

const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');
const stripComments = (src) => src
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

console.log('Checking conversation-list policy...\n');

// ── 1. The shared rules themselves ──
check('a normal chat stays in the inbox', staysInInbox({}) === true);
check('an archived chat leaves the inbox', staysInInbox({ isArchived: true }) === false);
check('an archived chat with a live offer stays visible', staysInInbox({ isArchived: true, hasActiveOffer: true }) === true);

check('mark-unread is a set, not a toggle — repeating it changes nothing',
  normalizeMarkUnread(true) === true
  && normalizeMarkUnread(false) === false
  && normalizeMarkUnread(undefined) === false
  && normalizeMarkUnread('true') === false);

check('a real unread outranks a personal reminder, and either means "not read"',
  unreadState({ unreadCount: 2, markedUnread: true }) === 'unread'
  && unreadState({ markedUnread: true }) === 'marked'
  && unreadState({ unreadCount: 1 }) === 'unread'
  && unreadState({}) === 'read');

check('the badge sums real unread and reminders, and cannot go negative',
  inboxUnreadTotal({ unreadMessages: 3, markedConversations: 2 }) === 5
  && inboxUnreadTotal({}) === 0
  && inboxUnreadTotal({ unreadMessages: -4, markedConversations: -1 }) === 0);

const server = read('server.js');
const messaging = stripComments(read('src/routes/messaging.js'));
const inbox = stripComments(read('src/screens/InboxScreen.tsx'));
const chat = stripComments(read('src/screens/ChatScreen.tsx'));
const api = stripComments(read('src/api.ts'));

// ── 2. The two flags exist, privately, defaulting to "nothing changed" ──
const step94 = server.match(/await step\('Conversation archive and mark-unread', \(\) => c\.query\(`([\s\S]*?)`\)\);/);
const migration = step94 ? step94[1] : '';
check('migration step 94 exists', Boolean(step94));
check('both flags are booleans that default to off, so nobody is archived or flagged silently',
  /is_archived BOOLEAN NOT NULL DEFAULT false/.test(migration)
  && /marked_unread BOOLEAN NOT NULL DEFAULT false/.test(migration));
check('both columns are added idempotently', (migration.match(/ADD COLUMN IF NOT EXISTS/g) || []).length === 2);
check('both flags hang off the per-user settings row, never the shared conversation',
  (migration.match(/ALTER TABLE conversation_user_settings ADD COLUMN IF NOT EXISTS/g) || []).length === 2
  && !/\bconversations\b/.test(migration));

// ── 3. Archive is private to the caller ──
const archiveRoute = (messaging.match(/router\.put\('\/api\/conversations\/:id\/archive'[\s\S]*?\n\}\);/) || [''])[0];
check('archive refuses a conversation the caller is not part of',
  /\(buyer_id = \$2 OR seller_id = \$2\)/.test(archiveRoute));
check('archive writes only the caller\'s own settings row',
  /INSERT INTO conversation_user_settings \(conversation_id, user_id, is_archived\)/.test(archiveRoute)
  && /\[req\.params\.id, req\.user\.id, archived\]/.test(archiveRoute));
check('archive cannot reach the message tables (so it cannot change a receipt or a badge)',
  !/\bmessages\b/.test(archiveRoute) && !/message_deliveries/.test(archiveRoute));
check('archive is a set, not a blind toggle, and reports the new state',
  /req\.body\?\.archived === undefined \? true : req\.body\.archived === true/.test(archiveRoute)
  && /res\.json\(\{ archived \}\)/.test(archiveRoute));

// ── 4. Mark-unread is a reminder, not a read-receipt edit ──
const markRoute = (messaging.match(/router\.put\('\/api\/conversations\/:id\/mark-unread'[\s\S]*?\n\}\);/) || [''])[0];
check('mark-unread refuses a conversation the caller is not part of',
  /\(buyer_id = \$2 OR seller_id = \$2\)/.test(markRoute));
check('mark-unread writes only the caller\'s own settings row',
  /INSERT INTO conversation_user_settings \(conversation_id, user_id, marked_unread\)/.test(markRoute)
  && /\[req\.params\.id, req\.user\.id, markedUnread\]/.test(markRoute));
check('mark-unread never touches messages.is_read or message_deliveries — the other side cannot see this',
  !/\bmessages\b/.test(markRoute) && !/message_deliveries/.test(markRoute));
check('mark-unread normalises through the shared helper', /normalizeMarkUnread\(/.test(markRoute));

// ── 5. A new message can never sit buried ──
const unarchiveOnMessage = (messaging.match(/UPDATE conversation_user_settings SET is_archived = false, marked_unread = false[\s\S]{0,300}?\[req\.params\.id, recipientId\]/) || [''])[0];
check('a new message lifts the archive and the reminder',
  Boolean(unarchiveOnMessage) && /user_id = \$2 AND \(is_archived OR marked_unread\)/.test(unarchiveOnMessage));
check('the lift happens on the recipient\'s row only, never the sender\'s',
  /const recipientId = conv\.rows\[0\]\.buyer_id === req\.user\.id \? conv\.rows\[0\]\.seller_id : conv\.rows\[0\]\.buyer_id;/.test(messaging)
  && /\n\s*\[req\.params\.id, recipientId\]/.test(unarchiveOnMessage));
check('the lift is scoped to chats that actually have something to clear',
  /AND \(is_archived OR marked_unread\)/.test(unarchiveOnMessage));

// ── 6. The Inbox list, the badge, and reading ──
check('the inbox list carries both flags', /COALESCE\(cus\.is_archived, false\) AS is_archived,/.test(messaging)
  && /COALESCE\(cus\.marked_unread, false\) AS marked_unread,/.test(messaging));
check('the list GROUP BY includes both flags', /GROUP BY[^\n]*cus\.is_archived, cus\.marked_unread/.test(messaging));
check('the list splits out an archived section', /res\.json\(\{ conversations: result\.rows, pinned, active, offers, archived \}\)/.test(messaging));
check('the partition uses the shared rule, not a second copy of it',
  /if \(!staysInInbox\(\{ isArchived: conv\.is_archived, hasActiveOffer: conv\.has_active_offer \}\)\) archived\.push\(conv\);/.test(messaging));
check('a live offer is checked before the archive, so it is never filed away',
  messaging.indexOf('if (!staysInInbox(') < messaging.indexOf('else if (conv.has_active_offer) offers.push(conv);'));
check('the tab badge adds the chats the user flagged as reminders',
  /inboxUnreadTotal\(\{/.test(messaging)
  && /markedConversations: parseInt\(markedConversations\.rows\[0\]\.count\)/.test(messaging)
  && /cus\.user_id = \$1 AND cus\.marked_unread = true AND \(c\.buyer_id = \$1 OR c\.seller_id = \$1\)/.test(messaging));
check('opening the chat satisfies the user\'s own reminder',
  /UPDATE conversation_user_settings SET marked_unread = false, updated_at = CURRENT_TIMESTAMP[\s\S]{0,200}WHERE conversation_id = \$1 AND user_id = \$2 AND marked_unread/.test(messaging));
check('the chat is told whether it is archived', /isArchived: !!mySettings\.rows\[0\]\?\.is_archived,/.test(messaging));

// ── 7. The app behaves on the same rules ──
check('the inbox filters with the same shared archive rule',
  /staysInInbox\(\{ isArchived: \(c as any\)\.is_archived, hasActiveOffer: \(c as any\)\.has_active_offer \}\)/.test(inbox));
check('the inbox shows an entry for archived chats and a way back out',
  inbox.includes("t('inbox.archivedCount'") && inbox.includes("t('inbox.backToInbox')"));
check('an inbox row opens its actions on long press',
  /onLongPress=\{\(\) => setActionTarget\(item\)\}/.test(inbox)
  && /applyMarkUnread\(!\(actionTarget as any\)\?\.marked_unread\)/.test(inbox)
  && /applyArchive\(!\(actionTarget as any\)\?\.is_archived\)/.test(inbox));
check('the row marks a reminder differently from a real unread, not by colour alone',
  /unreadState\(\{ unreadCount: item\.unread_count, markedUnread: \(item as any\)\.marked_unread \}\)/.test(inbox)
  && /const isMarkedUnread = attention === 'marked';/.test(inbox)
  && /convoMarkedBadge/.test(inbox));
check('the Unread filter includes a chat the user flagged',
  /unreadState\(\{ unreadCount: c\.unread_count, markedUnread: \(c as any\)\.marked_unread \}\) !== 'read'/.test(inbox));
check('both actions report failure instead of failing silently',
  (inbox.match(/toast\.error\(t\('chat\.actionFailed'\)\)/g) || []).length >= 2);
check('the api exposes both actions', /export const archiveConversation =/.test(api)
  && /export const markConversationUnread =/.test(api));
check('the chat menu can archive and restore', chat.includes("t('chat.archiveChat')")
  && chat.includes("t('chat.unarchiveChat')")
  && /const toggleArchive = async \(\) => \{/.test(chat));
check('the row flags are typed on the client', /is_archived\?: boolean;/.test(read('src/types.ts'))
  && /marked_unread\?: boolean;/.test(read('src/types.ts')));

// ── 8. Every string exists in EN/FR/HT ──
const locales = ['en', 'fr', 'ht'];
const keys = [
  'inbox.archivedCount', 'inbox.backToInbox', 'inbox.noArchived',
  'inbox.markUnread', 'inbox.markRead', 'inbox.archive', 'inbox.unarchive',
  'inbox.archived', 'inbox.unarchived', 'inbox.markedUnread',
  'chat.archiveChat', 'chat.unarchiveChat',
];
for (const lang of locales) {
  const messages = JSON.parse(read(`messages/${lang}.json`));
  const missing = keys.filter((key) => typeof messages[key] !== 'string' || !messages[key].trim());
  check(`every archive/mark-unread string exists in ${lang}`, missing.length === 0, missing.join(','));
}
const en = JSON.parse(read('messages/en.json'));
check('the archived count keeps its placeholder in every language',
  locales.every((lang) => JSON.parse(read(`messages/${lang}.json`))['inbox.archivedCount'].includes('{count}')));

if (failures > 0) {
  console.log(`\nFAIL: ${failures} conversation-list violation(s).`);
  process.exit(1);
}
console.log('OK: conversation-list policy holds (archive is private, mark-unread is a reminder, nothing is buried).');
