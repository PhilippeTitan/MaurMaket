#!/usr/bin/env node
/**
 * Read-receipts check — Inbox/Messaging decisions.
 *
 * "Show quiet sent / delivered / read states with configurable read receipts for
 * ordinary chats."
 *
 * A read receipt is information about the READER, so an opt-out has to hold in
 * four separate places or it leaks: when the read is recorded, when the sender
 * polls for statuses, when the conversation is loaded, and in the realtime event
 * that flips the sender's ticks. Missing any one of them means a reader who
 * switched receipts off still shows as "read".
 *
 * The fifth failure is subtler and destructive: `messages.is_read` drives the
 * other participant's unread badges, so withdrawing old receipts by clearing it
 * would resurrect messages they have already read. Only `message_deliveries`
 * may be touched.
 *
 * Run: node scripts/read-receipts-check.js
 * Exit code 0 = clean, 1 = policy violation
 */

import { readFileSync } from 'fs';
import { join } from 'path';

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

console.log('Checking read-receipts policy...\n');

const server = read('server.js');
const auth = stripComments(read('src/routes/auth.js'));
const messaging = stripComments(read('src/routes/messaging.js'));
const privacy = stripComments(read('src/screens/PrivacySettingsScreen.tsx'));
const chat = stripComments(read('src/screens/ChatScreen.tsx'));

// ── 1. The preference exists, and defaults to on ──
const step93 = server.match(/await step\('Read receipts preference', \(\) => c\.query\(`([\s\S]*?)`\)\);/);
check('migration step 93 exists', Boolean(step93));
check('the preference is a boolean that defaults to on, so nothing changes silently',
  /read_receipts_enabled BOOLEAN NOT NULL DEFAULT true/.test(step93 ? step93[1] : ''));
check('the column is added idempotently', /ADD COLUMN IF NOT EXISTS read_receipts_enabled/.test(step93 ? step93[1] : ''));
check('the preference is returned with the account', /read_receipts_enabled/.test(auth));
check('the profile route accepts the preference and notifies nothing else',
  /readReceiptsEnabled, language, pinnedProductId/.test(auth)
  && /read_receipts_enabled = COALESCE\(\$26, read_receipts_enabled\)/.test(auth)
  && /readReceiptsEnabled !== undefined \? readReceiptsEnabled : null/.test(auth));

// ── 2. Switching off withdraws the receipts already sent, and only those ──
const withdrawal = auth.match(/UPDATE message_deliveries SET[\s\S]*?\[req\.user\.id\]/);
check('turning receipts off withdraws the receipts this account already sent',
  Boolean(withdrawal) && /status = 'delivered', read_at = NULL/.test(withdrawal[0]));
check('the withdrawal only targets receipts this account sent as the reader',
  Boolean(withdrawal) && /recipient_id = \$1 AND status = 'read'/.test(withdrawal[0]));
check('the withdrawal never touches messages.is_read (that column is the other person\u2019s unread badge)',
  Boolean(withdrawal) && !/\bmessages\b/.test(withdrawal[0]));
check('the withdrawal runs only on an explicit off', /if \(readReceiptsEnabled === false\)/.test(auth));
check('the number withdrawn is reported back', /receiptsWithdrawn: withdrawn/.test(auth)
  && /withdrawn = cleared\.rowCount/.test(auth));

// ── 3. Nothing is reported to the other participant while receipts are off ──
check('the read route checks the reader\u2019s own preference',
  /const receiptsOff = mine\.rows\[0\]\?\.read_receipts_enabled === false;/.test(messaging)
  && /SELECT read_receipts_enabled FROM users WHERE id = \$1', \[req\.user\.id\]/.test(messaging));
check('no delivery receipt is written when they are off',
  /const deliveries = receiptsOff\s*\?\s*\{ rows: \[\] \}\s*:\s*await pool\.query\(/.test(messaging));
check('the realtime read tick is not emitted when they are off',
  /if \(!receiptsOff\) \{/.test(messaging) && /type: 'messages_read'/.test(messaging));
check('the reader\u2019s own unread badges are still cleared',
  /WHERE conversation_id = \$1 AND sender_id != \$2 AND is_read = false\n\s*RETURNING id/.test(messaging));
check('the response says whether receipts were off',
  /marked: Math\.max\(result\.rows\.length, deliveries\.rows\.length\), readReceiptsOff: receiptsOff/.test(messaging));

// ── 4. Both sender-facing read paths mask a stored 'read' ──
check('the status poll masks a read receipt from someone who opted out',
  /row\.status === 'read' \? 'delivered' : row\.status/.test(messaging) && /res\.json\(\{ statuses, readReceiptsOff \}\)/.test(messaging));
check('the conversation payload masks it too',
  /if \(msg\.delivery_status === 'read'\) msg\.delivery_status = 'delivered';/.test(messaging)
  && /msg\.is_read = false;/.test(messaging));
check('the mask only applies to the caller\u2019s own outgoing rows',
  /if \(msg\.sender_id !== req\.user\.id\) continue;/.test(messaging));
check('the chat is told receipts are off so it can say so quietly',
  /readReceiptsOff: otherReceiptsOff/.test(messaging));
// Both masks must key off the OTHER participant: reading the caller's own
// preference there would leak the wrong person's setting in both directions.
check('both masks read the other participant\u2019s preference',
  (messaging.match(/SELECT read_receipts_enabled FROM users WHERE id = \$1', \[otherId\]\)/g) || []).length === 2
  && /const otherReceiptsOff = otherPrefs\.rows\[0\]\?\.read_receipts_enabled === false;/.test(messaging));

// ── 5. The app: one switch, and a chat that does not pretend ──
check('the privacy screen offers the switch', privacy.includes("t('privacy.readReceipts')")
  && privacy.includes('onValueChange={handleToggleReadReceipts}'));
check('the switch writes the preference and rolls back on failure',
  /updateProfile\(\{ readReceiptsEnabled: next \}\)/.test(privacy) && /setReadReceipts\(!next\);\n\s*toast\.error/.test(privacy));
check('the switch defaults to on for accounts that predate it', /user\?\.read_receipts_enabled !== false/.test(privacy));
check('the switch says what turning it off does', privacy.includes("t('privacy.readReceiptsNote')"));
check('the chat notes that receipts are off, in one quiet line', chat.includes("t('chat.readReceiptsOff')")
  && /readReceiptsOff && \(/.test(chat));
check('the chat reads that state from the conversation context',
  /res\.context\.readReceiptsOff/.test(chat));
check('the realtime tick cannot flip a chat with receipts off',
  /if \(!readReceiptsOffRef\.current\) \{/.test(chat));

// ── 6. Every string exists in EN/FR/HT ──
const locales = ['en', 'fr', 'ht'];
const keysFor = (lang) => JSON.parse(read(`messages/${lang}.json`));
const used = [...privacy.matchAll(/t\('(privacy\.readReceipts[a-zA-Z]*)'/g), ...chat.matchAll(/t\('(chat\.readReceiptsOff)'/g)]
  .map((m) => m[1]);
check('the app uses the read-receipt strings', used.length > 0, `found ${used.length}`);
for (const lang of locales) {
  const messages = keysFor(lang);
  const missing = used.filter((key) => typeof messages[key] !== 'string');
  check(`every read-receipt string exists in ${lang}`, missing.length === 0, missing.join(','));
  const ids = Object.keys(messages).filter((key) => key.startsWith('privacy.readReceipts')).sort();
  check(`${lang} has the full read-receipts key set`, ids.length === 10, `${ids.length} keys`);
}

if (failures > 0) {
  console.log(`\nFAIL: ${failures} read-receipts violation(s).`);
  process.exit(1);
}
console.log('OK: read-receipts policy holds (off means the reader stays unread to the other side, in all four places).');
