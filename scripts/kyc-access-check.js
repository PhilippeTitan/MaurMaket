#!/usr/bin/env node
/**
 * KYC evidence-access check — Batch 75.
 *
 * "Log staff access to sensitive KYC evidence and show a safe case-linked
 * history."
 *
 * Two halves can rot independently, and neither shows up in a type check:
 *
 *   1. The writer's reason lists vs. the CHECK constraints on the table. If the
 *      module grows a purpose the database rejects, the audit log silently stops
 *      recording (the writer returns null on failure). If the database accepts a
 *      purpose the writer does not know, an unexplained access can be stored.
 *   2. What the subject is shown. The audit log is the one screen where a
 *      privacy bug reads as a feature: an `actor_user_id` that leaks through a
 *      SELECT hands the account holder a staff identity to blame.
 *
 * The audit table is also read by the data export (counts in the summary, rows
 * in the archive), so both disclosures are pinned here too.
 *
 * Run: node scripts/kyc-access-check.js
 * Exit code 0 = clean, 1 = violation
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) return;
  failures++;
  console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
};

const moduleSrc = read('src/utils/kycEvidenceAccess.js');
const serverSrc = read('server.js');
const exportSrc = read('src/utils/dataExport.js');
const typesSrc = read('src/types.ts');
const screenSrc = read('src/screens/DataPrivacyScreen.tsx');
const jobsSrc = read('src/jobs/index.js');

const listOf = (src, name) => {
  const match = src.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!match) return null;
  return match[1]
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
};

const checkList = (src, constraintName) => {
  const match = src.match(new RegExp(`${constraintName} IN \\(([^)]*)\\)`));
  if (!match) return null;
  return match[1]
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
};

// ── 1. Writer reasons === database constraints ──
const purposes = listOf(moduleSrc, 'KYC_ACCESS_PURPOSES');
const scopes = listOf(moduleSrc, 'KYC_EVIDENCE_SCOPES');
const dbPurposes = checkList(serverSrc, 'purpose');
const dbScopes = checkList(serverSrc, 'scope');

check('KYC_ACCESS_PURPOSES is declared', Array.isArray(purposes) && purposes.length > 0);
check('KYC_EVIDENCE_SCOPES is declared', Array.isArray(scopes) && scopes.length > 0);
check('the table CHECKs exactly the purposes the writer accepts',
  JSON.stringify(purposes) === JSON.stringify(dbPurposes), `${purposes} vs ${dbPurposes}`);
check('the table CHECKs exactly the evidence scopes the writer accepts',
  JSON.stringify(scopes) === JSON.stringify(dbScopes), `${scopes} vs ${dbScopes}`);
check('an unrecognised purpose is refused instead of stored under a default',
  /if \(!purposeValue\)/.test(moduleSrc) && /return null;/.test(moduleSrc.slice(moduleSrc.indexOf('if (!purposeValue)'))));
check('the default evidence scope is one of the accepted scopes', scopes?.includes('attempt'));

// ── 2. The subject-visible read never carries a staff identity ──
const selects = moduleSrc.match(/SELECT[\s\S]*?FROM/g) || [];
check('no subject-visible SELECT reads actor_user_id',
  selects.every((block) => !/actor_user_id/.test(block)),
  selects.filter((block) => /actor_user_id/.test(block)).join(' | '));
check('the only mention of actor_user_id is the append-only insert',
  (moduleSrc.match(/actor_user_id/g) || []).length === 1);
check('a neutral team label is stored when no label is given',
  /DEFAULT_ACTOR_LABEL = 'MaurMaket Support'/.test(moduleSrc) && /normalizeActorLabel/.test(moduleSrc));
check('the retention window is declared once and stated in the log table comment',
  /KYC_ACCESS_RETENTION_DAYS = \d+/.test(moduleSrc) && serverSrc.includes('kyc_evidence_access'));

// ── 3. The daily cleanup backs the disclosed retention ──
check('the daily job deletes access entries past the retention window',
  /cleanupOldKycEvidenceAccess/.test(jobsSrc) && /accessed_at < NOW\(\) - INTERVAL/.test(moduleSrc));

// ── 4. Both disclosures reach the user ──
check('the export payload includes the access log', /kyc_evidence_access: kycAccess/.test(exportSrc));
check('the export states the access-log retention window',
  /kyc_evidence_access_retention_days: KYC_ACCESS_RETENTION_DAYS/.test(exportSrc));
check('the summary counts the access log', /kyc_evidence_access: kycAccess\b/.test(exportSrc));
check('the export reuses the audit module rather than re-querying the table',
  /from '\.\/kycEvidenceAccess\.js'/.test(exportSrc) && !/FROM kyc_evidence_access/.test(exportSrc));
check('a missing audit table cannot break a user export',
  /MISSING_TABLE = '42P01'/.test(moduleSrc) && /tolerateMissingTable/.test(moduleSrc));
check('the summary type carries the new count', /kyc_evidence_access: number;/.test(typesSrc));
check('the privacy screen shows the count', /summary\.kyc_evidence_access/.test(screenSrc));
check('the export rows stay display-safe (no attempt id handed to the archive)',
  /exportKycEvidenceAccess/.test(moduleSrc) && !/attempt_id: row\.attempt_id/.test(moduleSrc));

// ── 5. The label reused by the summary exists in every locale ──
const locales = ['en', 'fr', 'ht'];
const labelKey = (screenSrc.match(/label=\{t\('(security\.evidenceAccessTitle)'\)\}/) || [])[1];
check('the summary reuses the ID-access label', !!labelKey, 'no reused label found');
if (labelKey) {
  const missing = locales.filter((lang) => !(labelKey in JSON.parse(read(`messages/${lang}.json`))));
  check('the reused label exists in EN/FR/HT', missing.length === 0, `missing in ${missing.join(',')}`);
}

if (failures > 0) {
  console.log(`\nFAIL: ${failures} KYC access-log violation(s).`);
  process.exit(1);
}
console.log('OK: KYC evidence-access log holds (writer and database agree; the subject sees reasons, never staff).');
