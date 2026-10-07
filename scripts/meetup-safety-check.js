#!/usr/bin/env node
/**
 * Meetup-safety check — Batch 81/82/83.
 *
 * "A warning is useful safety context, not a verdict. Reports are private
 * allegations; they never cancel an order and never label a place safe."
 *
 * This is the one feature in the app where being slightly too eager causes real
 * harm: a warning shown after a review closed, a warning that survives its own
 * review window, a seller penalised by an unreviewed report, or a shopper told
 * their order changed when it did not. None of that shows up in a type check, so
 * the policy gets a truth table and the wiring is pinned to it.
 *
 * The second half is honesty: there is no Support risk service yet, so the
 * gateway must answer "not connected" and the app must show nothing rather than
 * invent a risk or promise that an area is safe.
 *
 * Run: node scripts/meetup-safety-check.js
 * Exit code 0 = clean, 1 = violation
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  meetupSafetyAdvisory,
  advisoryFromNotice,
  areaSafetyLabel,
  normalizeRiskStatus,
  normalizeCondition,
  MEETUP_RISK_STATUSES,
  SAFETY_REPORT_HANDLING,
} from '../src/utils/meetupSafetyPolicy.js';

const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

// Assertions about what a file does NOT contain must ignore prose: a comment may
// name a table the code never touches.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/^\s*\/\/\/.*$/gm, '');

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};
const same = (label, actual, expected) => check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);

console.log('Checking meetup safety policy...\n');

// ── 1. When a warning may appear at all ──
const NONE = { level: 'none', pauseRecommendations: false, expired: false, reason: 'no_risk' };
same('nothing reviewed means nothing shown', meetupSafetyAdvisory({}), NONE);
same('an unknown review state never produces a warning', meetupSafetyAdvisory({ status: 'maybe' }), NONE);
same('a dismissed report stops warning immediately', meetupSafetyAdvisory({ status: 'dismissed' }),
  { ...NONE, reason: 'closed' });
same('a resolved report stops warning immediately', meetupSafetyAdvisory({ status: 'resolved' }),
  { ...NONE, reason: 'closed' });
same('an unresolved review shows an advisory and pauses recommendations',
  meetupSafetyAdvisory({ status: 'under_review', reviewUntil: new Date(Date.now() + 86400000).toISOString() }),
  { level: 'advisory', pauseRecommendations: true, expired: false, reason: 'unresolved' });
same('a credible risk stays open until the review concludes it',
  meetupSafetyAdvisory({ status: 'credible' }),
  { level: 'advisory', pauseRecommendations: true, expired: false, reason: 'unresolved' });
same('a lapsed review window ends the warning on its own',
  meetupSafetyAdvisory({ status: 'credible', reviewUntil: new Date(Date.now() - 1000).toISOString() }),
  { level: 'none', pauseRecommendations: false, expired: true, reason: 'expired' });
same('a lapsed window in epoch milliseconds ends it too',
  meetupSafetyAdvisory({ status: 'under_review', reviewUntil: Date.now() - 1000 }),
  { level: 'none', pauseRecommendations: false, expired: true, reason: 'expired' });
same('an unparseable window does not silently close an open review',
  meetupSafetyAdvisory({ status: 'under_review', reviewUntil: 'soon' }).level, 'advisory');
check('every recognised status is covered by the truth table',
  MEETUP_RISK_STATUSES.every((status) => typeof meetupSafetyAdvisory({ status })?.level === 'string'));
check('statuses normalise, junk does not', normalizeRiskStatus('credible') === 'credible' && normalizeRiskStatus('CREDIBLE') === null);
check('a condition is temporary, ongoing, or nothing', normalizeCondition('ongoing') === 'ongoing'
  && normalizeCondition('temporary') === 'temporary' && normalizeCondition('forever') === null);

// ── 2. What may be shown, and what may never leak ──
check('no notice means no advisory', advisoryFromNotice(null) === null && advisoryFromNotice(undefined) === null);
check('a closed notice is dropped, not softened', advisoryFromNotice({ status: 'dismissed', note: 'x' }) === null);
check('an expired notice is dropped', advisoryFromNotice({ status: 'under_review', reviewUntil: '2000-01-01T00:00:00.000Z' }) === null);
const shown = advisoryFromNotice({
  status: 'credible',
  areaLabel: 'Delmas 33',
  condition: 'ongoing',
  note: 'Reviewed by Support',
  reviewUntil: new Date(Date.now() + 86400000).toISOString(),
  reporterId: 'should-never-surface',
  reporter: 'someone',
});
check('a reviewed risk becomes a displayable advisory', shown?.level === 'advisory' && shown?.areaLabel === 'Delmas 33');
check('the advisory carries exactly the display-safe fields',
  JSON.stringify(Object.keys(shown).sort()) === JSON.stringify(['areaLabel', 'condition', 'level', 'note', 'pauseRecommendations', 'reviewUntil']));
check('no reporter identity can ride along', !JSON.stringify(shown).includes('should-never-surface') && !JSON.stringify(shown).includes('someone'));
check('blank labels and notes become null rather than empty strings',
  advisoryFromNotice({ status: 'under_review', areaLabel: '   ', note: '' })?.areaLabel === null);

// ── 3. What the feature may never claim ──
check('a report can never label an area safe', areaSafetyLabel() === null && areaSafetyLabel({ reports: 99 }) === null);
same('a report is an allegation that penalises nobody', {
  isAllegation: SAFETY_REPORT_HANDLING.isAllegation,
  penalisesAutomatically: SAFETY_REPORT_HANDLING.penalisesAutomatically,
  changesOrderState: SAFETY_REPORT_HANDLING.changesOrderState,
}, { isAllegation: true, penalisesAutomatically: false, changesOrderState: false });
check('reports are handled by the live private channel', SAFETY_REPORT_HANDLING.handledBy === 'help-support');

// ── 4. The policy is inert: no marketplace state can move ──
const policy = read('src/utils/meetupSafetyPolicy.js');
const policyCode = stripComments(policy);
check('the policy module imports nothing', !/^\s*import\s/m.test(policyCode) && !/require\(/.test(policyCode));
check('the policy never touches orders, payments, stock or listings',
  !/\b(orders?|payments?|stock|products?|listings?)\b/i.test(policyCode));
check('the policy contains no SQL', !/\b(SELECT|UPDATE|INSERT|DELETE|FROM)\b/.test(policyCode));

// ── 5. The gateway stays a disconnected cable ──
const gateway = read('src/support/meetupSafetyGateway.ts');
const gatewayCode = stripComments(gateway);
// The declared return type contains both halves of the union on purpose, so a
// check that matched the file as a whole would pass on the type alone. Only the
// implementation is relevant here.
const gatewayImpl = gatewayCode.slice(gatewayCode.indexOf('export const meetupSafetyGateway'));
check('the gateway implementation is present', gatewayImpl.length > 0);
check('the gateway answers "not connected"', /connected: false/.test(gatewayImpl));
check('the gateway never claims a live connection', !/connected: true/.test(gatewayImpl));
check('it never invents an advisory while disconnected', /advisory: null/.test(gatewayImpl));
check('it offers no function that pretends a case was filed',
  !/createCase|submitReport|reportConcern|fileCase/.test(gatewayCode));
check('it says where a report actually goes today', /support@maurmaket\.com/.test(gateway));
check('it takes its rules from the policy module', /advisoryFromNotice/.test(gatewayCode));

// ── 6. The screens show the warning only when there is one, and say what it is ──
const screen = read('src/screens/MeetupProposalScreen.tsx');
const screenCode = stripComments(screen);
check('the advisory only renders when the service returned one',
  screenCode.includes('{advisory && (') && screenCode.includes('setAdvisory(read.advisory)') && screenCode.includes('if (active && read.connected)'));
check('a disconnected service leaves the screen silent',
  /connected: false/.test(gateway) && !/advisory\s*\?\?/.test(screenCode));
check('the warning is announced without interrupting', screenCode.includes('accessibilityLiveRegion="polite"'));
check('the screen tells the shopper their order is unchanged', screenCode.includes("t('meetupSafety.advisoryUnchanged')"));
check('the warning never carries an order action',
  !/cancel|removePendingCheckoutSeller|decideBuyerFulfillment/.test(
    screenCode.slice(screenCode.indexOf('{advisory && ('), screenCode.indexOf('snapshot.agreements.map'))
  ));
check('the report path leads to the live Help & Support channel',
  screenCode.includes("navigation.navigate('HelpSupport', { topic: 'safety' })"));
check('the safety path writes nothing to the map-issue report table',
  !/meetup_place_reports|reportPlace/.test(screenCode));

const help = read('src/screens/HelpSupportScreen.tsx');
const helpCode = stripComments(help);
check('Help & Support recognises the safety topic', /topic === 'safety'/.test(helpCode));
check('the email it opens is a private safety report', /private meetup safety report/.test(helpCode));
check('it explains how a report is handled before it is written', helpCode.includes("t('meetupSafety.reportPrivate')"));
check('it never claims a case was filed',
  !/case (was )?(filed|created|submitted)|caseId/i.test(helpCode));

// ── 7. Cross-links with the flow that already exists ──
const orders = read('src/routes/orders.js');
check('the existing spot-suggestion pause is untouched', /suggestionPaused: reports\.rows\[0\]\.count >= 2/.test(orders));
check('suggestions still require both sides to confirm the spot', /meetup_place_confirmations/.test(orders)
  && /COUNT\(DISTINCT user_id\)/.test(orders));

// ── 8. Every string a shopper reads exists in EN/FR/HT ──
const locales = ['en', 'fr', 'ht'];
const keysFor = (lang) => Object.keys(JSON.parse(read(`messages/${lang}.json`))).filter((k) => k.startsWith('meetupSafety.')).sort();
const perLocale = locales.map(keysFor);
check('the safety strings are localised in all three languages',
  perLocale[0].length === 8 && perLocale.every((keys) => JSON.stringify(keys) === JSON.stringify(perLocale[0])),
  `sizes ${perLocale.map((k) => k.length).join('/')}`);
check('every safety string the screens use exists',
  [...screen.matchAll(/t\('(meetupSafety\.[a-zA-Z]+)'\)/g), ...help.matchAll(/t\('(meetupSafety\.[a-zA-Z]+)'\)/g)]
    .map((match) => match[1])
    .every((key) => keysFor('en').includes(key)));

if (failures > 0) {
  console.log(`\nFAIL: ${failures} meetup-safety violation(s).`);
  process.exit(1);
}
console.log('OK: meetup-safety policy holds (advisory while unresolved, gone when closed, never a verdict, never a promise).');
