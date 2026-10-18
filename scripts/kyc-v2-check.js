#!/usr/bin/env node
/**
 * KYC v2 guardrail — docs/rfc/kyc-on-device.md (DECIDED 2026-10-17).
 *
 * The free stack is explicitly TEMPORARY: on-device client signals + Play
 * Integrity device verdicts are advisory, and a human (Philippe) is the final
 * authority via the admin review queue until the $25 Play Console upgrade
 * flips attestation authority on. This check pins the parts that would
 * silently rot back into an auto-approving pipeline or a leaky review:
 *
 *   1. The submit path queues for review instead of deciding (flag-gated,
 *      Lightning kept for rollback but unreachable when the flag is on).
 *   2. The queue/decide SQL: pending starts pending, approved unlocks exactly
 *      what v1 unlocked, decisions are idempotent, every decision is audited.
 *   3. Evidence reads are audited and images expire in 90 days (the purge
 *      must actually be wired into the nightly cron — a disclosure backed by
 *      behaviour, not a comment).
 *   4. The migration exists with its CHECK constraint and pending index.
 *   5. The zero-dependency constraint: appIntegrity.js imports only node
 *      builtins (the local npm 10 lockfile bug makes new deps a CI hazard),
 *      and package.json gains no new dependency.
 *   6. The $25 PLAY CONSOLE TRIGGER stays documented for future instances.
 *
 * Pure functions are exercised for real (they are importable without a
 * DATABASE_URL); DB-touching modules are checked as source text, matching the
 * other guardrail scripts.
 *
 * Run: node scripts/kyc-v2-check.js
 * Exit code 0 = clean, 1 = violation
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { createVerify, createPublicKey, generateKeyPairSync } from 'crypto';

const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) return;
  failures++;
  console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
};

const appIntegritySrc = read('src/utils/appIntegrity.js');
const kycReviewSrc = read('src/utils/kycReview.js');
const kycSignalsSrc = read('src/utils/kycSignals.js');
const verificationSrc = read('src/routes/verification.js');
const adminSrc = read('src/routes/admin.js');
const jobsSrc = read('src/jobs/index.js');
const serverSrc = read('server.js');
const packageSrc = read('package.json');
const agentsSrc = read('AGENTS.md');
const rfcSrc = read('docs/rfc/kyc-on-device.md');

// ── 1. Zero new dependencies (importable module really is builtin-only) ──
const importLines = (appIntegritySrc.match(/^import .*$/gm) || []).join('\n');
check('appIntegrity imports only node builtins',
  /^import .*from 'node:(crypto|fs)'/.test(importLines) && !/from ['"](?!node:)/.test(importLines),
  importLines.replace(/\n/g, ' | '));
check('appIntegrity declares no third-party import',
  !/require\(|from ['"]pg|from ['"]express/.test(appIntegritySrc));
const packageObj = JSON.parse(packageSrc);
const forbidden = ['googleapis', 'google-auth-library', 'gtoken', 'play-integrity'];
const added = Object.keys({ ...packageObj.dependencies, ...packageObj.devDependencies })
  .filter((name) => forbidden.some((f) => name.includes(f)));
check('package.json gains no Play Integrity / Google auth dependency', added.length === 0, added.join(','));

// ── 2. The submit path queues, never decides ──
check('submit is flag-gated on KYC_V2_ENABLED', /kycV2Enabled\(\)/.test(verificationSrc));
check('the v2 branch returns before the Lightning call',
  verificationSrc.indexOf('return submitV2') < verificationSrc.indexOf('attemptLightning'));
check('v2 enqueues via queueKycAttempt', /queueKycAttempt\(\{/.test(verificationSrc));
check('v2 never computes an auto verdict (no issues/policy engine in submitV2)',
  (() => {
    const start = verificationSrc.indexOf('async function submitV2');
    const body = verificationSrc.slice(start, verificationSrc.indexOf('// ─── GET /verification/evidence-access'));
    return start > 0 && !/finalStatus/.test(body) && !/issues\.push/.test(body);
  })());
check('v2 responds with pending_review copy', /reason_codes: \['pending_review'\]/.test(verificationSrc));
check('a failed integrity decode is stored as a signal, never thrown',
  /integrity = \{ error: err\.message \}/.test(verificationSrc));

// ── 3. The queue starts pending; decide maps approved → verified ──
check("queue inserts review_status 'pending'", /'pending_review', 'pending'/.test(kycReviewSrc));
check('queue inserts no verified_at (nothing is approved at submit)',
  !/verified_at/.test(kycReviewSrc.slice(kycReviewSrc.indexOf('INSERT INTO verification_attempts'), kycReviewSrc.indexOf('RETURNING id, status, review_status'))));
check('decide refuses non-pending cases (FOR UPDATE + not_pending)',
  /FOR UPDATE/.test(kycReviewSrc) && /not_pending/.test(kycReviewSrc));
check('decide accepts only approved/rejected',
  /\['approved', 'rejected'\]\.includes\(decision\)/.test(kycReviewSrc));
check("approved maps status to v1's 'verified'",
  /CASE WHEN \$2 = 'approved' THEN 'verified' ELSE 'rejected' END/.test(kycReviewSrc));
check('approved unlocks id_verified and the casual → verified tier promotion (same as v1)',
  /id_verified = true/.test(kycReviewSrc) && /seller_tier = CASE WHEN seller_tier = 'casual' THEN 'verified'/.test(kycReviewSrc));
check('rejected stamps id_verification_result = rejected',
  /id_verification_result = 'rejected'/.test(kycReviewSrc));
check('decisions run in a transaction with rollback',
  /BEGIN/.test(kycReviewSrc) && /ROLLBACK/.test(kycReviewSrc) && /COMMIT/.test(kycReviewSrc));

// ── 4. Every decision and evidence read is audited ──
check('decideReview records a case_review access',
  /purpose: 'case_review'/.test(kycReviewSrc) &&
  kycReviewSrc.slice(kycReviewSrc.indexOf('await client.query(\'COMMIT\')')).includes("purpose: 'case_review'"));
check('evidence image reads record scope document/selfie',
  /scope: which === 'selfie' \? 'selfie' : 'document'/.test(kycReviewSrc));
check('the queue list never selects reviewed_by (reviewer identity stays out of payloads)',
  (() => {
    const start = kycReviewSrc.indexOf('export async function getReviewQueue');
    const body = kycReviewSrc.slice(start, kycReviewSrc.indexOf('export async function getReviewCase'));
    return start > 0 && !/reviewed_by/.test(body);
  })());
check('admin case detail strips reviewed_by before responding',
  /const \{ reviewed_by, \.\.\.safe \} = attempt/.test(adminSrc));

// ── 5. Retention: 90-day purge actually wired ──
check('KYC_IMAGE_RETENTION_DAYS is 90', /KYC_IMAGE_RETENTION_DAYS = 90/.test(kycReviewSrc));
check('the purge deletes storage objects and nulls the columns',
  /deleteTemporaryStorageUpload/.test(kycReviewSrc) &&
  /SET id_front_url = NULL, id_back_url = NULL, selfie_url = NULL/.test(kycReviewSrc));
check('the purge is self-catching (nightly cron cannot die on it)',
  (() => {
    const start = kycReviewSrc.indexOf('export async function purgeExpiredKycImages');
    const body = kycReviewSrc.slice(start);
    return start > -1 && /catch \(err\)/.test(body) && /return 0/.test(body);
  })());
check('the 3 AM cron calls the purge', /await purgeExpiredKycImages\(\);/.test(jobsSrc));
check('review images are re-registered under the long TTL (else reviewers see expired files)',
  /expirationSeconds: KYC_IMAGE_RETENTION_DAYS \* 86400/.test(kycReviewSrc));

// ── 6. The migration (step 99) holds ──
check('step 99 exists with the review_status CHECK',
  /review_status TEXT\s+CHECK \(review_status IN \('pending','approved','rejected'\)\)/.test(serverSrc));
check('step 99 adds reviewed_at/reviewed_by/review_note',
  /ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ/.test(serverSrc) &&
  /ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users\(id\)/.test(serverSrc) &&
  /ADD COLUMN IF NOT EXISTS review_note TEXT/.test(serverSrc));
check('step 99 adds the advisory signal columns',
  ['device_verdict JSONB', 'app_pin_sha256 TEXT', 'client_device_results JSONB', 'selfie_embedding JSONB']
    .every((col) => serverSrc.includes(`ADD COLUMN IF NOT EXISTS ${col}`)));
check('a partial index serves the pending queue',
  /idx_verification_attempts_pending_review[\s\S]{0,120}WHERE review_status = 'pending'/.test(serverSrc));

// ── 7. Admin endpoints: auth + audit seams ──
for (const path of [
  '/api/admin/kyc/review-queue',
  '/api/admin/kyc/review-queue/:attemptId',
  '/api/admin/kyc/review-queue/:attemptId/evidence-image/:which',
  '/api/admin/kyc/review-queue/:attemptId/decide',
]) {
  const at = adminSrc.indexOf(path);
  check(`admin route exists: ${path}`, at > -1);
  if (at > -1) {
    const line = adminSrc.slice(at, adminSrc.indexOf('async', at));
    check(`route guarded: ${path}`, /authRequired/.test(line) && /adminRequired/.test(line));
  }
}
check('the evidence-image route streams via readAttemptEvidenceImage (the audited read)',
  /readAttemptEvidenceImage\(attempt\.user_id/.test(adminSrc));
check('the decide route validates the decision value',
  /\['approved', 'rejected'\]\.includes\(decision\)/.test(adminSrc));

// ── 8. The pin claim stays a tollbooth, and flags stay env-gated ──
check('pin comparison is normalised hex (case/colon tolerant)',
  /normalizePin/.test(appIntegritySrc) && /HEX64/.test(appIntegritySrc));
check('an unconfigured pin env is advisory, not a hard reject',
  /if \(!expected\) return \{ configured: false, match: null/.test(appIntegritySrc));
check('attestationRequired reads KYC_ATTEST_FULL (the Play Console flip)',
  /KYC_ATTEST_FULL/.test(appIntegritySrc));

// ── 9. Real executions of the importable pure logic ──
const integrity = await import('../src/utils/appIntegrity.js');
check('empty verdicts → unattested',
  integrity.evaluateDeviceSignals([]).attested === null &&
  integrity.evaluateDeviceSignals([]).flags.includes('unattested'));
check('MEETS_DEVICE_INTEGRITY → attested', integrity.evaluateDeviceSignals(['MEETS_DEVICE_INTEGRITY']).attested === true);
check('basic-only → advisory "basic"', integrity.evaluateDeviceSignals(['MEETS_BASIC_INTEGRITY']).attested === 'basic');
check('virtual → emulator flag',
  integrity.evaluateDeviceSignals(['MEETS_VIRTUAL_INTEGRITY']).flags.includes('emulator'));

check('pin: configured env, matching digest passes',
  (() => {
    process.env.APP_SIGNING_CERT_SHA256 = 'd'.repeat(64);
    const ok = integrity.verifyAppPinClaim('DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD:DD').match === true;
    const bad = integrity.verifyAppPinClaim('e'.repeat(64)).match === false;
    delete process.env.APP_SIGNING_CERT_SHA256;
    const unset = integrity.verifyAppPinClaim('e'.repeat(64)).configured === false;
    return ok && bad && unset;
  })());

check('service-account JWT is a structurally valid RS256 assertion',
  (() => {
    try {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      const jwt = integrity.buildServiceAccountAssertion(
        { client_email: 'sa@maurinex.iam.gserviceaccount.com', private_key: pem },
        1729160000000,
      );
      const [h, c, s] = jwt.split('.');
      const header = JSON.parse(Buffer.from(h, 'base64url').toString());
      const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
      const verifier = createVerify('RSA-SHA256');
      verifier.update(`${h}.${c}`);
      const validSig = verifier.verify(createPublicKey(pem), s, 'base64url');
      return header.alg === 'RS256'
        && claims.scope === 'https://www.googleapis.com/auth/playintegrity'
        && claims.aud === 'https://oauth2.googleapis.com/token'
        && claims.exp - claims.iat === 3600
        && validSig;
    } catch {
      return false;
    }
  })());

const signals = await import('../src/utils/kycSignals.js');
check('cosine: identical = 1, orthogonal = 0',
  Math.abs(signals.cosineSimilarity([1, 0], [1, 0]) - 1) < 1e-9 &&
  Math.abs(signals.cosineSimilarity([1, 0], [0, 1])) < 1e-9);
check('cosine: mismatched/empty shapes → null', signals.cosineSimilarity([1], [1, 2]) === null && signals.cosineSimilarity([], []) === null);
check('embedding: 64–1024 finite numbers only',
  signals.normalizeEmbedding(Array(64).fill(0.1)) !== null &&
  signals.normalizeEmbedding(Array(63).fill(0.1)) === null &&
  signals.normalizeEmbedding('x') === null);
check('device results: unknown keys dropped, scores clamped',
  (() => {
    const out = signals.normalizeDeviceResults({ faceMatchScore: 3, raw: 'never' });
    return out.faceMatchScore === 1 && !('raw' in out);
  })());

// ── 10. The decision record stays for the next instance ──
check('AGENTS.md carries the $25 PLAY CONSOLE TRIGGER', /\$25 PLAY CONSOLE TRIGGER/.test(agentsSrc));
check('AGENTS.md marks the architecture temporary', /KYC ARCHITECTURE/.test(agentsSrc) && /TEMPORAR/i.test(agentsSrc));
check('RFC documents the upgrade trigger', /PLAY CONSOLE TRIGGER|\$25/.test(rfcSrc));
check('RFC header says DECIDED', /DECIDED/.test(rfcSrc.slice(0, 2000)));

if (failures > 0) {
  console.log(`\nFAIL: ${failures} KYC v2 violation(s).`);
  process.exit(1);
}
console.log('OK: KYC v2 holds (flag-gated queue, human-decides, 90-day retention enforced, zero new deps, trigger documented).');
