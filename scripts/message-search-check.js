#!/usr/bin/env node
/**
 * Message-search check — Inbox/Messaging decisions.
 *
 * Ledger: "Support per-conversation search, optional safe link previews, and
 * image/voice attachments with validation, upload progress, and retry."
 *
 * The dangerous version of this feature is one line long: `content ILIKE '%' ||
 * $1 || '%'`. In a private conversation that makes a single `%` keystroke return
 * the entire thread, `_` quietly matches any character, and a query is no longer
 * a query — it is a dump. So the server matches a plain substring (`strpos`) and
 * this check refuses to let a LIKE pattern back in.
 *
 * The second failure is quieter: a search that runs before the user has typed
 * anything meaningful, or that falls back to "everything" for an empty term.
 *
 * Run: node scripts/message-search-check.js
 * Exit code 0 = clean, 1 = policy violation
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  normalizeSearchQuery,
  MESSAGE_SEARCH_LIMIT,
  MESSAGE_SEARCH_MIN_LENGTH,
  MESSAGE_SEARCH_MAX_LENGTH,
} from '../src/utils/messageSearchPolicy.js';

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

console.log('Checking message-search policy...\n');

// ── 1. The shared rules ──
check('the match limit is bounded and the minimum is more than one character',
  MESSAGE_SEARCH_LIMIT === 50 && MESSAGE_SEARCH_MIN_LENGTH === 2 && MESSAGE_SEARCH_MAX_LENGTH === 100);

const normal = normalizeSearchQuery('  hello   world  ');
check('a query is trimmed and its whitespace collapsed', normal.term === 'hello world' && normal.valid === true);
check('one character is still being typed, not a search', normalizeSearchQuery('a').valid === false);
check('an empty query is not a search', normalizeSearchQuery('').valid === false && normalizeSearchQuery('').term === '');
check('whitespace alone is not a search', normalizeSearchQuery('    ').valid === false);
check('a non-string query is not a search', normalizeSearchQuery(undefined).valid === false && normalizeSearchQuery(null).valid === false && normalizeSearchQuery(42).valid === false);
check('an over-long paste is cut, not refused',
  normalizeSearchQuery('x'.repeat(500)).term.length === MESSAGE_SEARCH_MAX_LENGTH
  && normalizeSearchQuery('x'.repeat(500)).valid === true);
check('a wildcard character is a literal character, not a special one',
  normalizeSearchQuery('%').term === '%' && normalizeSearchQuery('%').valid === false
  && normalizeSearchQuery('100% cotton').term === '100% cotton');

const messaging = stripComments(read('src/routes/messaging.js'));
const api = stripComments(read('src/api.ts'));
const chat = stripComments(read('src/screens/ChatScreen.tsx'));

// ── 2. The route matches a literal substring and nothing else ──
const route = (messaging.match(/router\.get\('\/api\/conversations\/:id\/messages\/search'[\s\S]*?\n\}\);/) || [''])[0];
check('the search route exists', Boolean(route));
check('search refuses a conversation the caller is not part of',
  /WHERE id = \$1 AND \(buyer_id = \$2 OR seller_id = \$2\)/.test(route));
check('search matches a literal substring via strpos, never a LIKE pattern',
  /strpos\(lower\(m\.content\), lower\(\$2\)\) > 0/.test(route));
check('no ILIKE/LIKE can creep back in (one "%" would return the whole private thread)',
  !/ILIKE/i.test(route) && !/\bLIKE\b/.test(route) && !/'%/.test(route) && !/%'/.test(route));
check('search skips deleted messages and rows with no text',
  /m\.is_deleted = false/.test(route) && /m\.content IS NOT NULL/.test(route));
check('the result count is clamped to the shared limit',
  /const limit = Math\.min\(Math\.max\([\s\S]{0,120}MESSAGE_SEARCH_LIMIT/.test(route) && /LIMIT \$3/.test(route));
check('it fetches one row past the limit so "more matches" is honest',
  /limit \+ 1/.test(route) && /const truncated = rows\.rows\.length > limit;/.test(route));
check('an unfinished query returns nothing, not the whole conversation',
  /if \(!valid\) return res\.json\(\{ query: term, results: \[\], truncated: false, limit: MESSAGE_SEARCH_LIMIT \}\)/.test(route));
check('the query is normalised by the shared helper',
  /const \{ term, valid \} = normalizeSearchQuery\(req\.query\.q\);/.test(route));
check('the route is scoped by conversation, not by participant alone',
  /WHERE m\.conversation_id = \$1/.test(route));

// ── 3. The app searches the same way ──
check('the api encodes the query rather than pasting it into the URL',
  /searchConversationMessages = \(conversationId: string, query: string\) =>/.test(api)
  && /encodeURIComponent\(query\)/.test(api));
check('the chat validates the term with the same helper before searching',
  /const searchTermValid = normalizeSearchQuery\(messageSearchTerm\)\.valid;/.test(chat)
  && /const \{ term, valid \} = normalizeSearchQuery\(messageSearchTerm\);/.test(chat));
check('a half-typed term never reaches the network',
  /if \(!valid\) \{\n\s*setSearchResults\(\[\]\);/.test(chat));
check('results are shown in place of the thread, so the cursor is never disturbed',
  /data=\{messageSearchOpen \? searchResults : messages\}/.test(chat));
check('paging older history is disabled while search results are on screen',
  /if \(!messageSearchOpen && nativeEvent\.contentOffset\.y < 72 && hasMore && !loadingOlder\)/.test(chat));
check('closing search restores the thread and its scroll behaviour',
  /const closeMessageSearch = \(\) => \{[\s\S]{0,260}stickToLatest\.current = true;/.test(chat));
check('the banner says what is happening without shouting',
  chat.includes("t('chat.searchHint')") && chat.includes("t('chat.searchNoResults')")
  && chat.includes("t('chat.searchResultsCount', { count: searchResults.length })"));

// ── 4. Every string exists in EN/FR/HT ──
const locales = ['en', 'fr', 'ht'];
const keys = [
  'chat.searchMessages', 'chat.searchMessagesPlaceholder', 'chat.searchResultsCount',
  'chat.searchNoResults', 'chat.searchHint', 'chat.exitSearch',
];
for (const lang of locales) {
  const messages = JSON.parse(read(`messages/${lang}.json`));
  const missing = keys.filter((key) => typeof messages[key] !== 'string' || !messages[key].trim());
  check(`every search string exists in ${lang}`, missing.length === 0, missing.join(','));
  check(`the result count keeps its placeholder in ${lang}`,
    JSON.parse(read(`messages/${lang}.json`))['chat.searchResultsCount'].includes('{count}'));
}

if (failures > 0) {
  console.log(`\nFAIL: ${failures} message-search violation(s).`);
  process.exit(1);
}
console.log('OK: message-search policy holds (literal substring, bounded, scoped to the conversation).');
