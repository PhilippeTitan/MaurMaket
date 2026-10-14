#!/usr/bin/env node
/**
 * Optional-analytics consent check — Batch 77 (APP-Q416, APP-Q432).
 *
 * Ledger: "separate optional analytics from essential reliability/security
 * measurements, with a clear opt-out that does not remove core features", and
 * "stop future optional collection/use and delete or irreversibly aggregate
 * prior optional event data where feasible; retain essential security/reliability
 * records under their separate purpose."
 *
 * The app collects no optional analytics, and that is precisely why this check is
 * written the way it is. The promise is not "we have a toggle"; it is that the
 * separation is a mechanism, so that the day someone adds instrumentation the
 * answer already exists and defaults to no:
 *
 *   1. **Two closed lists.** Essential processing (security, reliability,
 *      billing, fulfilment, support) is never gated by a preference; optional
 *      product-usage classes are gated.
 *   2. **Unknown means no.** An unclassified event class is refused, so a new
 *      event type cannot become trackable by being added at a call site and
 *      forgotten in the policy.
 *   3. **Off until asked.** The stored preference defaults to opted out, the
 *      client treats an absent field as opted out, and no optional event storage
 *      or analytics SDK exists to record into.
 *   4. **The seller's own business stats are not optional tracking.** They are
 *      the seller's data about their own listings, so they must stay unaffected by
 *      this preference, and the toggle is read in exactly one place.
 *
 * Run: node scripts/analytics-consent-check.js
 * Exit code 0 = clean, 1 = policy violation
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  analyticsEventClass,
  shouldRecordAnalytics,
  analyticsConsent,
  ESSENTIAL_EVENT_CLASSES,
  OPTIONAL_EVENT_CLASSES,
} from '../src/utils/analyticsConsentPolicy.js';

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

console.log('Checking analytics-consent policy...\n');

// ── 1. The two lists, and what they mean ──
check('the essential list is closed and complete',
  ESSENTIAL_EVENT_CLASSES.join(',') === 'security,reliability,billing,fulfillment,support',
  ESSENTIAL_EVENT_CLASSES.join(','));
check('the optional list is closed and complete',
  OPTIONAL_EVENT_CLASSES.join(',') === 'screen_view,search_refinement,feature_usage,content_engagement',
  OPTIONAL_EVENT_CLASSES.join(','));
check('no class is on both sides of the line',
  !ESSENTIAL_EVENT_CLASSES.some((c) => OPTIONAL_EVENT_CLASSES.includes(c)));
for (const c of ESSENTIAL_EVENT_CLASSES) {
  check(`${c} is classified essential`, analyticsEventClass(c) === 'essential');
}
for (const c of OPTIONAL_EVENT_CLASSES) {
  check(`${c} is classified optional`, analyticsEventClass(c) === 'optional');
}
for (const unknown of ['purchase_intent', '', undefined, null, 'Screen_View']) {
  check(`an unclassified class ("${String(unknown)}") is refused, not assumed`,
    shouldRecordAnalytics({ optOut: false, eventClass: unknown }) === false);
}

// ── 2. What the choice can and cannot switch off ──
for (const c of ESSENTIAL_EVENT_CLASSES) {
  check(`${c} records while opted out (a preference never switches off essential processing)`,
    shouldRecordAnalytics({ optOut: true, eventClass: c }) === true
    && shouldRecordAnalytics({ optOut: false, eventClass: c }) === true);
}
for (const c of OPTIONAL_EVENT_CLASSES) {
  check(`${c} stops when opted out and only records when explicitly allowed`,
    shouldRecordAnalytics({ optOut: true, eventClass: c }) === false
    && shouldRecordAnalytics({ optOut: false, eventClass: c }) === true);
}
check('a missing preference is treated as opted out',
  shouldRecordAnalytics({ eventClass: 'screen_view' }) === false
  && shouldRecordAnalytics() === false);
check('the consent state reports the default and the class split',
  analyticsConsent().optional_analytics === 'off'
  && analyticsConsent().default === 'off'
  && analyticsConsent({ optOut: false, decidedAt: '2026-10-07T00:00:00Z' }).optional_analytics === 'allowed'
  && analyticsConsent({ optOut: false }).decided_at === null
  && analyticsConsent().essential_processing.length === ESSENTIAL_EVENT_CLASSES.length
  && analyticsConsent().optional_uses.length === OPTIONAL_EVENT_CLASSES.length);

// ── 3. There is nothing optional being collected today, and nothing to collect
//       into. If instrumentation is ever added, this section is what fails first. ──
const server = stripComments(read('server.js'));
const tables = [...server.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/g)].map((m) => m[1]);
check('no optional-usage event storage exists',
  !tables.some((t) => /analytic|telemetr|tracking|screen_view|pageview|clickstream|usage_event/.test(t)),
  tables.filter((t) => /analytic|telemetr|tracking|screen_view|pageview|clickstream|usage_event/.test(t)).join(','));

const pkg = JSON.parse(read('package.json'));
const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
check('no analytics or tracking SDK is installed',
  !deps.some((d) => /analytic|track|telemetr|sentry|posthog|mixpanel|amplitude|segment|umami|plausible|matomo/i.test(d)),
  deps.filter((d) => /analytic|track|telemetr|sentry|posthog|mixpanel|amplitude|segment|umami|plausible|matomo/i.test(d)).join(','));

const routeFiles = readdirSync(join(process.cwd(), 'src/routes')).filter((n) => n.endsWith('.js'));
const preferenceReaders = routeFiles.filter((name) => /analytics_opt_out/.test(stripComments(read(`src/routes/${name}`))));
check('the preference is stored in exactly one route file, so no route invents its own gate',
  preferenceReaders.join(',') === 'auth.js', preferenceReaders.join(','));

const sellerAnalytics = stripComments(read('src/routes/analytics.js'));
check("the seller's own business stats are not gated by the privacy preference",
  !/analytics_opt_out|shouldRecordAnalytics/.test(sellerAnalytics));
check('the seller analytics endpoint stays read-only reporting',
  /router\.get\('\/api\/seller\/analytics'/.test(sellerAnalytics)
  && !/\bINSERT\b|\bUPDATE\b|\bDELETE\b/.test(sellerAnalytics));

// ── 4. The stored preference ──
check('migration step 97 adds the opt-out, defaulting to opted out',
  /ALTER TABLE users ADD COLUMN IF NOT EXISTS analytics_opt_out BOOLEAN NOT NULL DEFAULT true/.test(server));
check('the decision date is stored alongside the choice',
  /ADD COLUMN IF NOT EXISTS analytics_decision_at TIMESTAMPTZ/.test(server));

const auth = stripComments(read('src/routes/auth.js'));
check('the profile update accepts the choice',
  /analyticsOptOut\b/.test(auth) && /analytics_opt_out = COALESCE\(\$27, analytics_opt_out\)/.test(auth));
check('the choice is written to the caller, never to a user id from the body',
  /WHERE id = \$6/.test(auth) && /req\.user\.id/.test(auth));
check('the decision date only moves when the value actually changes',
  /IS DISTINCT FROM analytics_opt_out/.test(auth) && /THEN CURRENT_TIMESTAMP ELSE analytics_decision_at END/.test(auth));
check('the account read returns the choice and its date',
  /read_receipts_enabled, analytics_opt_out, analytics_decision_at, language, pinned_product_id/.test(auth)
  && (auth.match(/analytics_opt_out, analytics_decision_at, language, pinned_product_id/g) || []).length === 2);

// ── 5. The app records the decision and explains it honestly ──
const screen = stripComments(read('src/screens/PrivacySettingsScreen.tsx'));
check('an absent preference means opted out in the client too',
  /useState\(user\?\.analytics_opt_out === false\)/.test(screen));
check('the switch writes the choice to the server, in opt-out terms',
  /await updateProfile\(\{ analyticsOptOut: !next \}\)/.test(screen));
check('the local account copy is updated from the saved value',
  /analytics_opt_out: !next/.test(screen) && /store\.setUser/.test(screen));
check('a failed save rolls the switch back instead of lying',
  /setAnalyticsAllowed\(!next\)/.test(screen) && /t\('privacy\.analyticsFailed'\)/.test(screen));
check('the control is offered with its own explanation, not as a bare toggle',
  /t\('privacy\.analyticsGroup'\)/.test(screen) && /t\('privacy\.analyticsGroupDesc'\)/.test(screen)
  && /t\('privacy\.analyticsNote'\)/.test(screen));
check('the screen shows when the choice was last changed',
  /user\?\.analytics_decision_at \?/.test(screen) && /t\('privacy\.analyticsDecided', \{ date:/.test(screen));
check('the switch is accessible and toggle-shaped',
  /accessibilityLabel=\{t\('privacy\.analyticsToggle'\)\}/.test(screen) && /<SettingsToggle/.test(screen));

// ── 6. Every string exists in EN/FR/HT, and each states the default honestly ──
const keys = [
  'privacy.analyticsGroup', 'privacy.analyticsGroupDesc', 'privacy.analyticsToggle',
  'privacy.analyticsOn', 'privacy.analyticsOff', 'privacy.analyticsNote',
  'privacy.analyticsDecided', 'privacy.analyticsToastOn', 'privacy.analyticsToastOff',
  'privacy.analyticsFailed',
];
// The default is the part that must not get lost in translation.
const defaultMarker = { en: /off by default/i, fr: /par défaut/i, ht: /pa defo/i };
for (const lang of ['en', 'fr', 'ht']) {
  const messages = JSON.parse(read(`messages/${lang}.json`));
  const missing = keys.filter((key) => typeof messages[key] !== 'string' || !messages[key].trim());
  check(`every analytics string exists in ${lang}`, missing.length === 0, missing.join(','));
  check(`${lang} states that optional analytics are off unless the user allows them`,
    defaultMarker[lang].test(String(messages['privacy.analyticsGroupDesc'])));
  check(`${lang} does not claim a restriction the toggle cannot make`,
    !/security|securit|sekirite/i.test(String(messages['privacy.analyticsOn']))
    && !/security|securit|sekirite/i.test(String(messages['privacy.analyticsOff'])));
}
const en = JSON.parse(read('messages/en.json'));
check('the copy says plainly that nothing optional is collected today',
  /does not collect optional usage analytics today/i.test(en['privacy.analyticsNote']));
check('the copy says no feature depends on the choice',
  /No feature depends on it/i.test(en['privacy.analyticsNote']));

if (failures > 0) {
  console.log(`\nFAIL: ${failures} analytics-consent violation(s).`);
  process.exit(1);
}
console.log('OK: analytics-consent policy holds (essential processing never gated, optional use off until allowed, unknown refused).');
