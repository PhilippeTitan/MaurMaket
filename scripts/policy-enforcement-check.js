#!/usr/bin/env node
/**
 * Policy-enforcement check — Batch 72 (APP-Q356–APP-Q365).
 *
 * Ledger: "require renewed agreement **only when needed**", and "If a user
 * declines a material update, explain the resulting access limits, preserve
 * account help and existing obligations, and provide closure/export paths."
 *
 * The failure this guards against is a gate that quietly becomes a lockout. A
 * policy change is not a reason to take away someone's account: it is a reason to
 * pause what they would *newly* commit to until they have decided. So the check
 * holds three lines:
 *
 *   1. **Only three things pause**, and the list is closed: creating a listing,
 *      placing an order, making an offer.
 *   2. **Everything else keeps working**, and that list is explicit — help,
 *      existing orders and their messages, security settings, data export,
 *      account closure, and reading the policy itself.
 *   3. **A decision is recorded, not remembered locally.** Declining is written
 *      against the exact version the user read, the same way acceptance is, and
 *      the server states the resulting limits instead of silently applying them.
 *
 * It also holds the signup rule: a kind that has only ever had one version is the
 * baseline, so nobody is ever asked to re-accept the terms they agreed to when
 * they created their account.
 *
 * Run: node scripts/policy-enforcement-check.js
 * Exit code 0 = clean, 1 = policy violation
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  policyDecisions,
  policyAccessState,
  policyGateReason,
  policyGateMessage,
  POLICY_GATED_ACTIONS,
  POLICY_PRESERVED_ACTIONS,
} from '../src/utils/policyAcceptancePolicy.js';

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

console.log('Checking policy-enforcement policy...\n');

const decision = (overrides = {}) => policyDecisions({
  versions: [
    { id: 1, kind: 'terms', version: '1.0', is_material: true },
    { id: 2, kind: 'terms', version: '2.0', is_material: true },
  ],
  acceptances: [],
  declines: [],
  ...overrides,
});

// ── 1. Who owes a decision ──
check('a kind with only its baseline version asks nothing of anyone',
  policyGateReason(policyDecisions({
    versions: [{ id: 1, kind: 'terms', version: '1.0', is_material: true }],
  })) === null);
check('a newer material version with no decision recorded is pending',
  policyGateReason(decision()) === 'pending');
check('accepting the current version clears the gate',
  policyGateReason(decision({ acceptances: [{ kind: 'terms', version: '2.0' }] })) === null);
check('an acceptance of the older version does not clear it',
  policyGateReason(decision({ acceptances: [{ kind: 'terms', version: '1.0' }] })) === 'pending');
check('declining the current version is recorded as declined',
  policyGateReason(decision({ declines: [{ kind: 'terms', version: '2.0' }] })) === 'declined');
check('a decline of an older version does not count against the new one',
  policyGateReason(decision({ declines: [{ kind: 'terms', version: '1.0' }] })) === 'pending');
check('a non-material change never gates anything',
  policyGateReason(policyDecisions({
    versions: [
      { id: 1, kind: 'privacy', version: '1.0', is_material: false },
      { id: 2, kind: 'privacy', version: '1.1', is_material: false },
    ],
  })) === null);

// ── 2. What a decision pauses, and what it must never pause ──
const access = policyAccessState(decision({ declines: [{ kind: 'terms', version: '2.0' }] }));
check('the gated list is exactly the three new commitments',
  POLICY_GATED_ACTIONS.length === 3
  && POLICY_GATED_ACTIONS.join(',') === 'create_listing,place_order,make_offer');
check('a pending decision pauses those same three, no more',
  policyAccessState(decision()).gated_actions.join(',') === 'create_listing,place_order,make_offer');
check('nothing is paused when nothing is owed',
  policyAccessState(policyDecisions({
    versions: [{ id: 1, kind: 'terms', version: '1.0', is_material: true }],
  })).restricted === false
  && policyAccessState(policyDecisions({
    versions: [{ id: 1, kind: 'terms', version: '1.0', is_material: true }],
  })).gated_actions.length === 0);
for (const preserved of ['sign_in', 'existing_orders', 'order_messages', 'support', 'data_export', 'account_closure']) {
  check(`${preserved} is on the preserved list`, POLICY_PRESERVED_ACTIONS.includes(preserved));
}
check('the preserved list is carried in the state, not left implicit',
  access.preserved_actions.length === POLICY_PRESERVED_ACTIONS.length);
check('both reasons explain the limits without claiming the account changed',
  policyGateMessage('declined').includes('declined') && policyGateMessage('declined').includes('existing orders')
  && policyGateMessage('pending').includes('existing orders'));
check('no gate message claims a closure, freeze, or ban',
  !/closed|frozen|suspended account|terminated/i.test(policyGateMessage('declined'))
  && !/closed|frozen|suspended account|terminated/i.test(policyGateMessage('pending')));

// ── 3. The gate exists, and it answers instead of assuming ──
const middleware = stripComments(read('src/middleware/policyAcceptance.js'));
const policies = stripComments(read('src/routes/policies.js'));
const server = stripComments(read('server.js'));
check('the gate is a factory taking the action it protects',
  /export function policyCurrentRequired\(action\)/.test(middleware));
check('it reads this account\'s recorded decisions',
  /FROM user_policy_declines WHERE user_id = \$1/.test(middleware)
  && /FROM user_policy_acceptances WHERE user_id = \$1/.test(middleware));
check('an undecided or declined policy is a 409 with a machine-readable code',
  /res\.status\(409\)\.json\(\{[\s\S]{0,160}code: 'POLICY_ACCEPTANCE_REQUIRED'/.test(middleware));
check('the refusal states the limits and the URL keeps working otherwise',
  /policyGateMessage\(reason\)/.test(middleware)
  && /preserved_actions: access\.preserved_actions/.test(middleware)
  && /needs_decision: access\.needs_decision/.test(middleware));
check('the gate proceeds when nothing is owed',
  /if \(reason\) \{/.test(middleware) && /\n      next\(\);/.test(middleware));
check('the gate decides with the shared model, not its own copy',
  /policyDecisions\(\{/.test(middleware) && /policyGateReason\(decisions\)/.test(middleware));

// ── 4. Exactly three routes are gated, and no others ──
const routeFiles = readdirSync(join(process.cwd(), 'src/routes')).filter((name) => name.endsWith('.js'));
const usages = [];
for (const name of routeFiles) {
  const src = stripComments(read(`src/routes/${name}`));
  const matches = src.match(/policyCurrentRequired\('[a-z_]+'\)/g) || [];
  for (const match of matches) usages.push(`${name}: ${match}`);
}
check('exactly three actions are gated in the whole server',
  usages.length === 3, usages.join(' | '));
check('creating a listing is gated',
  usages.some((u) => u.startsWith('products.js') && u.includes("'create_listing'")));
check('placing an order is gated',
  usages.some((u) => u.startsWith('orders.js') && u.includes("'place_order'")));
check('making an offer is gated',
  usages.some((u) => u.startsWith('offers.js') && u.includes("'make_offer'")));
check('the gate is applied to the real creating routes',
  /router\.post\('\/products', authRequired, verifiedSellerRequired, dobRequired, accountActive, policyCurrentRequired\('create_listing'\)/.test(stripComments(read('src/routes/products.js')))
  && /router\.post\('\/orders', authRequired, dobRequired, policyCurrentRequired\('place_order'\)/.test(stripComments(read('src/routes/orders.js')))
  && /router\.post\('\/api\/conversations\/:id\/offer', authRequired, msgLimiter, policyCurrentRequired\('make_offer'\)/.test(stripComments(read('src/routes/offers.js'))));
// The preserved list is a promise, so it is checked against the routes that must
// never carry the gate.
// Sign-in itself lives outside src/routes, so the exactly-three count above is
// what proves it is ungated; these are the in-repo promises that must stay open.
const preservedRoutes = [
  ['src/routes/messaging.js', /router\.post\('\/api\/conversations\/:id\/messages'/],
  ['src/routes/messaging.js', /router\.put\('\/api\/conversations\/:id\/read'/],
  ['src/routes/dataExport.js', /router\.post\('\/api\/user\/export'/],
  ['src/routes/dataExport.js', /router\.get\('\/api\/user\/export\/summary'/],
];
for (const [file, pattern] of preservedRoutes) {
  const src = stripComments(read(file));
  check(`${file} keeps its preserved route ungated`, pattern.test(src) && !/policyCurrentRequired/.test(src));
}

// ── 5. Declining is recorded, against the version the user read ──
check('the declines table exists with one row per person, kind, and version',
  /CREATE TABLE IF NOT EXISTS user_policy_declines[\s\S]{0,400}UNIQUE \(user_id, kind, version\)/.test(server));
check('a decline cannot outlive its account',
  /user_id UUID NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/.test(
    (server.match(/CREATE TABLE IF NOT EXISTS user_policy_declines[\s\S]*?`\)\)/) || [''])[0]
  ));
check('the decline route exists',
  /router\.post\('\/api\/policies\/:kind\/decline', authRequired/.test(policies));
// The accept path carries the same stale-version guard, so searching the whole
// file would let the decline route quietly lose its own copy while the twin in
// `accept` keeps the pattern alive. Scope the behavioural assertions to the
// decline handler itself (found by the negative-test harness).
const declineRoute = policies.slice(
  policies.indexOf("router.post('/api/policies/:kind/decline'"),
  policies.indexOf('export default router;')
);
check('the decline handler could be located for scoped assertions',
  declineRoute.includes('user_policy_declines'));
check('recording the same decline twice is not an error',
  /INSERT INTO user_policy_declines \(user_id, kind, version\)[\s\S]{0,120}ON CONFLICT \(user_id, kind, version\) DO NOTHING/.test(declineRoute));
check('a stale client cannot decline a version it never saw',
  /if \(current\.rows\[0\]\.version !== version\)/.test(declineRoute)
  && /POLICY_VERSION_STALE/.test(declineRoute));
check('the decline reply states the limits rather than only applying them',
  /access: state\.access/.test(policies) && /preserved_actions: state\.access\.preserved_actions/.test(policies));
check('the screen and the gate share one decision model',
  /policyDecisions\(\{/.test(policies) && /decisionByKind/.test(policies));
check('the documents endpoint exposes the access state',
  /access: policyAccessState\(decisions\)/.test(policies));

// ── 6. The app records the decision and explains it ──
const legal = stripComments(read('src/screens/LegalPrivacyScreen.tsx'));
const api = stripComments(read('src/api.ts'));
check('the client has a decline call',
  /export const declinePolicy = \(kind: string, version: string\)/.test(api)
  && /\/policies\/\$\{encodeURIComponent\(kind\)\}\/decline/.test(api));
check('the screen records the decline on the server, not in local state',
  /await declinePolicy\(doc\.kind, doc\.version\)/.test(legal));
check('the confirm action explains before it records',
  /styles\.declineConfirm/.test(legal) && /t\('legal\.declineConfirm'\)/.test(legal));
check('a recorded decline is shown as declined',
  /doc\.declined \? \(/.test(legal) && /t\('legal\.declined'\)/.test(legal));
check('the resulting limits are shown to the user',
  /state\?\.access\?\.restricted \? \(/.test(legal) && /t\('legal\.accessLimits'\)/.test(legal));
check('export, account, and help paths stay offered while restricted',
  /navigate\('DataPrivacy'\)/.test(legal) && /navigate\('AccountDashboard'\)/.test(legal) && /navigate\('HelpSupport'\)/.test(legal));
check('a stale version after declining reloads instead of lying',
  /POLICY_VERSION_STALE/.test(legal));

// ── 7. Every string exists in EN/FR/HT ──
const locales = ['en', 'fr', 'ht'];
const keys = ['legal.accessLimits', 'legal.declined', 'legal.declinedToast', 'legal.declineFailed', 'legal.declineConfirm', 'legal.declining'];
for (const lang of locales) {
  const messages = JSON.parse(read(`messages/${lang}.json`));
  const missing = keys.filter((key) => typeof messages[key] !== 'string' || !messages[key].trim());
  check(`every policy-enforcement string exists in ${lang}`, missing.length === 0, missing.join(','));
  check(`${lang} states the limits without claiming the account changed`,
    !/suspendu\b.*compte|account is (closed|frozen)|kont .*fèmen/i.test(String(messages['legal.accessLimits'])));
}

if (failures > 0) {
  console.log(`\nFAIL: ${failures} policy-enforcement violation(s).`);
  process.exit(1);
}
console.log('OK: policy-enforcement policy holds (three new commitments pause, everything else keeps working).');
