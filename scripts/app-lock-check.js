#!/usr/bin/env node
/**
 * App-lock check — Batch 75 / APP-Q116.
 *
 * "Should device biometrics be allowed to unlock an existing MaurMaket session?"
 * Answered: "allow local convenience on trusted device; not server auth or KYC
 * proof."
 *
 * Two things about this feature are easy to get wrong and impossible to notice:
 * locking when the user cannot unlock (a lockout), and locking in a case the
 * decision never allowed (no session, no recorded clock, a clock that moved
 * backwards). Neither shows up in a type check, and both are silent in a bundle.
 * So the policy gets a truth table here, and the wiring gets pinned to it.
 *
 * Run: node scripts/app-lock-check.js
 * Exit code 0 = clean, 1 = policy violation
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  shouldLockNow,
  normalizeAppLockDelay,
  parseAppLockEnabled,
  parseAppLockTimestamp,
  APP_LOCK_DELAYS,
  APP_LOCK_IMMEDIATE,
  APP_LOCK_ONE_MINUTE,
  APP_LOCK_FIVE_MINUTES,
  DEFAULT_APP_LOCK_DELAY,
  APP_LOCK_ENABLED_KEY,
  APP_LOCK_DELAY_KEY,
  APP_LOCK_LAST_ACTIVE_KEY,
} from '../src/utils/appLockPolicy.js';
import {
  selectAccountDeviceKeys,
  DEVICE_LOCAL_KEYS,
  ACCOUNT_EXACT_KEYS,
  ACCOUNT_KEY_PREFIXES,
} from '../src/utils/signOutPolicy.js';

const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

// Assertions about what a file does NOT contain must ignore prose: a comment may
// say the word "email" where the code never would.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) return;
  failures++;
  console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
};

const NOW = 1_800_000_000_000;
const MINUTE = 60 * 1000;
const lock = (overrides = {}) => shouldLockNow({
  hasSession: true,
  enabled: true,
  delayMs: APP_LOCK_ONE_MINUTE,
  lastActiveAt: NOW - 10 * MINUTE,
  now: NOW,
  ...overrides,
});

console.log('Checking app-lock policy...\n');

// ── 1. When the app locks ──
check('locks after the grace period has passed', lock() === true);
check('does not lock inside the grace period', lock({ lastActiveAt: NOW - 30 * 1000 }) === false);
check('locks exactly at the boundary', lock({ lastActiveAt: NOW - APP_LOCK_ONE_MINUTE }) === true);
check('"immediately" locks on any return', lock({ delayMs: APP_LOCK_IMMEDIATE, lastActiveAt: NOW }) === true);
check('"5 minutes" leaves a short absence alone', lock({ delayMs: APP_LOCK_FIVE_MINUTES, lastActiveAt: NOW - MINUTE }) === false);
check('"5 minutes" locks after a long absence', lock({ delayMs: APP_LOCK_FIVE_MINUTES, lastActiveAt: NOW - 6 * MINUTE }) === true);
check('accepts a stored timestamp that arrives as a string', lock({ lastActiveAt: String(NOW - 10 * MINUTE) }) === true);

// ── 2. When it must never lock ──
check('never locks without a session', lock({ hasSession: false }) === false);
check('never locks when the user turned it off', lock({ enabled: false }) === false);
check('never locks when the setting is only loosely truthy', lock({ enabled: 'yes' }) === false);
check('never locks without a recorded moment of last use', lock({ lastActiveAt: null }) === false);
check('never locks on a zero or negative stamp', lock({ lastActiveAt: 0 }) === false && lock({ lastActiveAt: -1 }) === false);
check('never locks on an unreadable stamp', lock({ lastActiveAt: 'whenever' }) === false);
check('never locks without a clock', lock({ now: undefined }) === false && lock({ now: NaN }) === false);
check('never locks when the clock moved backwards', lock({ lastActiveAt: NOW + 60 * MINUTE }) === false);
check('the safe default is "do not lock"', shouldLockNow() === false && shouldLockNow({}) === false);

// ── 3. Stored values are normalised, never trusted ──
check('the three offered delays are accepted', APP_LOCK_DELAYS.every((ms) => normalizeAppLockDelay(ms) === ms));
check('offered delays survive a string round-trip', APP_LOCK_DELAYS.every((ms) => normalizeAppLockDelay(String(ms)) === ms));
check('an invented delay falls back to the default', normalizeAppLockDelay(1234) === DEFAULT_APP_LOCK_DELAY && normalizeAppLockDelay(-1) === DEFAULT_APP_LOCK_DELAY);
check('junk delays fall back to the default', ['abc', null, undefined, NaN, {}, [], false, true, ' '].every((v) => normalizeAppLockDelay(v) === DEFAULT_APP_LOCK_DELAY),
  `null → ${normalizeAppLockDelay(null)}, false → ${normalizeAppLockDelay(false)}`);
check('the default is one of the offered delays', APP_LOCK_DELAYS.includes(DEFAULT_APP_LOCK_DELAY));
check('the default is not "immediately"', DEFAULT_APP_LOCK_DELAY !== APP_LOCK_IMMEDIATE);
check('only true and "true" enable the lock', parseAppLockEnabled(true) === true && parseAppLockEnabled('true') === true && [false, 'false', 'yes', 1, null, undefined].every((v) => parseAppLockEnabled(v) === false));
check('timestamps normalise to a positive number or null', ['123', 123].every((v) => parseAppLockTimestamp(v) === 123) && [null, 'nope', 0, -5, undefined].every((v) => parseAppLockTimestamp(v) === null));

// ── 4. Wiring: the decision stays connected ──
const app = read('App.tsx');
const gate = read('src/components/AppLockGate.tsx');
const appLock = read('src/appLock.ts');
const security = read('src/screens/SecuritySettingsScreen.tsx');
const signOutPolicy = read('src/utils/signOutPolicy.js');

check('the app asks the policy whether to lock', app.includes('shouldLockNow('));
check('the app refuses to lock a signed-out app', app.includes('if (!store.isLoggedIn) return false;'));
check('the app checks the device can actually unlock', app.includes('getDeviceAuthAvailability()'));
check('the app skips the decision while already locked', app.includes('if (appLockedRef.current) return;'));
check('the clock is stamped when the app is backgrounded', app.includes("if (status === 'background') void recordAppLockActivity();"));
check('the prompt\'s own return does not re-lock', app.includes('justUnlockedRef.current = false;'));
check('a successful unlock restarts the clock', app.includes('void recordAppLockActivity();'));
check('the lock screen is mounted last, above the other modals',
  /<AppLockGate[\s\S]*<\/ErrorBoundary>/.test(app) && app.indexOf('<AppLockGate') > app.indexOf('paymentFailed &&'));
check('signing out from the lock clears the clock', app.includes('await clearAppLockActivity();'));
check('the settings screen writes the setting through the module', security.includes('saveAppLockEnabled(') && security.includes('saveAppLockDelay('));
check('the delay choices come from the policy', security.includes('APP_LOCK_DELAYS.map('));
check('enabling the lock does not lock the user out of the screen', security.includes('await recordAppLockActivity();'));

// The lock screen must show nothing about the account.
const gateCode = stripComments(gate);
check('the lock screen reveals no account data', !/store\.(user|token)/.test(gateCode) && !/avatar|profile|email/i.test(gateCode));
check('the lock screen does not reach into the session store at all', !/from '\.\.\/store'/.test(gateCode));
check('the lock screen offers a way out without device auth', gate.includes('signOutInstead') && gate.includes('ConfirmModal'));
check('device passcode counts as device authentication', appLock.includes('disableDeviceFallback: false'));
check('web and missing hardware degrade to "no lock"', appLock.includes("if (isWeb) return { available: false") && appLock.includes('catch {\n    return { available: false'));
check('every failure path returns false instead of throwing', appLock.includes('return result?.success === true;'));

// ── 5. Cross-links ──
check('the app-lock keys are device-local at sign-out', [APP_LOCK_ENABLED_KEY, APP_LOCK_DELAY_KEY, APP_LOCK_LAST_ACTIVE_KEY].every((k) => DEVICE_LOCAL_KEYS.includes(k)));
const lockKeys = [APP_LOCK_ENABLED_KEY, APP_LOCK_DELAY_KEY, APP_LOCK_LAST_ACTIVE_KEY];
check('the app-lock keys are never swept as an authenticated cache',
  !lockKeys.some((k) => ACCOUNT_EXACT_KEYS.includes(k) || ACCOUNT_KEY_PREFIXES.some((p) => k.startsWith(p))));
check('the whole device-local set survives a sign-out', selectAccountDeviceKeys(DEVICE_LOCAL_KEYS).length === 0);
check('the sign-out policy takes the lock keys from their one definition', signOutPolicy.includes("from './appLockPolicy.js'"));
const locales = ['en', 'fr', 'ht'];
const localeLockKeys = locales.map((lang) => Object.keys(JSON.parse(read(`messages/${lang}.json`))).filter((k) => k.startsWith('appLock.')).sort());
check('the lock screen is fully localised in EN/FR/HT', localeLockKeys[0].length > 0 && localeLockKeys.every((keys) => JSON.stringify(keys) === JSON.stringify(localeLockKeys[0])), `sizes ${localeLockKeys.map((k) => k.length).join('/')}`);

if (failures > 0) {
  console.log(`\nFAIL: ${failures} app-lock violation(s).`);
  process.exit(1);
}
console.log('OK: app-lock policy holds (never locks without a session, a clock, or a way out).');
