import { describe, it, expect, afterEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  kycV2Enabled,
  attestationRequired,
  loadServiceAccount,
  buildServiceAccountAssertion,
  parseIntegrityPayload,
  evaluateDeviceSignals,
  normalizePin,
  verifyAppPinClaim,
} from '../../src/utils/appIntegrity.js';
import {
  REVIEW_DUPLICATE_FACE_THRESHOLD,
  normalizeEmbedding,
  cosineSimilarity,
  normalizeDeviceResults,
} from '../../src/utils/kycSignals.js';

const envSnapshot: Record<string, string | undefined> = {};
const setEnv = (key: string, value: string | undefined) => {
  if (!(key in envSnapshot)) envSnapshot[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

afterEach(() => {
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    delete envSnapshot[key];
  }
});

describe('feature flags', () => {
  it('KYC_V2_ENABLED is strictly opt-in (string "true" only)', () => {
    setEnv('KYC_V2_ENABLED', undefined);
    expect(kycV2Enabled()).toBe(false);
    setEnv('KYC_V2_ENABLED', 'false');
    expect(kycV2Enabled()).toBe(false);
    setEnv('KYC_V2_ENABLED', 'true');
    expect(kycV2Enabled()).toBe(true);
  });

  it('KYC_ATTEST_FULL (Play Console upgrade flip) is off until set', () => {
    setEnv('KYC_ATTEST_FULL', undefined);
    expect(attestationRequired()).toBe(false);
    setEnv('KYC_ATTEST_FULL', 'true');
    expect(attestationRequired()).toBe(true);
  });
});

describe('evaluateDeviceSignals', () => {
  it('treats an empty verdict list as unattested (sideloaded first builds)', () => {
    expect(evaluateDeviceSignals([])).toEqual({ attested: null, flags: ['unattested'], verdicts: [] });
    expect(evaluateDeviceSignals(null).attested).toBeNull();
    expect(evaluateDeviceSignals(null).flags).toContain('unattested');
  });

  it('accepts MEETS_DEVICE_INTEGRITY and MEETS_STRONG_INTEGRITY', () => {
    expect(evaluateDeviceSignals(['MEETS_DEVICE_INTEGRITY']).attested).toBe(true);
    expect(evaluateDeviceSignals(['MEETS_STRONG_INTEGRITY']).attested).toBe(true);
    expect(evaluateDeviceSignals(['MEETS_DEVICE_INTEGRITY', 'MEETS_BASIC_INTEGRITY']).attested).toBe(true);
  });

  it('flags basic-only as advisory, not fully attested', () => {
    const result = evaluateDeviceSignals(['MEETS_BASIC_INTEGRITY']);
    expect(result.attested).toBe('basic');
    expect(result.flags).toContain('basic_integrity_only');
  });

  it('flags emulators via MEETS_VIRTUAL_INTEGRITY even alongside hardware verdicts', () => {
    const result = evaluateDeviceSignals(['MEETS_VIRTUAL_INTEGRITY', 'MEETS_DEVICE_INTEGRITY']);
    expect(result.attested).toBe(true);
    expect(result.flags).toContain('emulator');
  });

  it('flags unknown verdict strings without crashing', () => {
    const result = evaluateDeviceSignals(['MEETS_SOMETHING_NEW']);
    expect(result.attested).toBeNull();
    expect(result.flags).toContain('no_integrity_verdict');
    expect(result.flags).toContain('MEETS_SOMETHING_NEW');
  });
});

describe('normalizePin / verifyAppPinClaim', () => {
  it('accepts bare, colon-separated, prefixed, and array digests', () => {
    const digest = 'a'.repeat(64);
    expect(normalizePin(digest)).toBe(digest);
    expect(normalizePin(digest.toUpperCase())).toBe(digest);
    expect(normalizePin(digest.match(/.{2}/g)!.join(':'))).toBe(digest);
    expect(normalizePin(`sha256=${digest}`)).toBe(digest);
    expect(normalizePin([null, digest])).toBe(digest);
  });

  it('rejects non-hex, short, and non-string claims', () => {
    expect(normalizePin('not-a-digest')).toBeNull();
    expect(normalizePin('ab'.repeat(10))).toBeNull();
    expect(normalizePin(12345)).toBeNull();
    expect(normalizePin(null)).toBeNull();
    expect(normalizePin([])).toBeNull();
  });

  it('is unconfigured (advisory) until APP_SIGNING_CERT_SHA256 is set', () => {
    setEnv('APP_SIGNING_CERT_SHA256', undefined);
    const result = verifyAppPinClaim('a'.repeat(64));
    expect(result.configured).toBe(false);
    expect(result.match).toBeNull();
  });

  it('matches only the exact expected digest when configured', () => {
    const expected = 'b'.repeat(64);
    setEnv('APP_SIGNING_CERT_SHA256', expected);
    expect(verifyAppPinClaim(`sha256:${expected.split('').join(':')}`).match).toBe(true);
    expect(verifyAppPinClaim('c'.repeat(64)).match).toBe(false);
    expect(verifyAppPinClaim('garbage').match).toBe(false);
    expect(verifyAppPinClaim(undefined).match).toBe(false);
  });
});

describe('parseIntegrityPayload', () => {
  it('extracts request/app/device fields defensively', () => {
    const parsed = parseIntegrityPayload({
      requestDetails: { requestHash: 'hash1', timestampMillis: 1729160000000, nonce: 'n' },
      appIntegrity: {
        appRecognitionVerdict: 'UNRECOGNIZED_VERSION',
        packageName: 'com.maurmaket.app',
        certificateSha256Digest: ['abc'],
      },
      deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
    });
    expect(parsed).toMatchObject({
      requestHash: 'hash1',
      appRecognitionVerdict: 'UNRECOGNIZED_VERSION',
      packageName: 'com.maurmaket.app',
      deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'],
    });
    expect(parsed!.certificateSha256Digest).toEqual(['abc']);
  });

  it('returns null for non-objects and fills missing groups', () => {
    expect(parseIntegrityPayload(null)).toBeNull();
    expect(parseIntegrityPayload('nope' as unknown as object)).toBeNull();
    const parsed = parseIntegrityPayload({});
    expect(parsed!.appRecognitionVerdict).toBeNull();
    expect(parsed!.deviceRecognitionVerdict).toEqual([]);
  });

  it('drops non-string verdict entries', () => {
    const parsed = parseIntegrityPayload({
      deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_BASIC_INTEGRITY', 42, null] },
    });
    expect(parsed!.deviceRecognitionVerdict).toEqual(['MEETS_BASIC_INTEGRITY']);
  });
});

describe('buildServiceAccountAssertion', () => {
  it('signs a three-part RS256 JWT with the service-account claims', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const nowMs = 1729160000000;
    const jwt = buildServiceAccountAssertion(
      { client_email: 'sa@maurinex.iam.gserviceaccount.com', private_key: pem },
      nowMs,
    );
    const [header, claims, signature] = jwt.split('.');
    expect(signature).toBeTruthy();

    const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    const headerObj = decode(header);
    const claimsObj = decode(claims);
    expect(headerObj).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(claimsObj.iss).toBe('sa@maurinex.iam.gserviceaccount.com');
    expect(claimsObj.scope).toBe('https://www.googleapis.com/auth/playintegrity');
    expect(claimsObj.aud).toBe('https://oauth2.googleapis.com/token');
    expect(claimsObj.iat).toBe(Math.floor(nowMs / 1000));
    expect(claimsObj.exp).toBe(Math.floor(nowMs / 1000) + 3600);
  });

  it('refuses an incomplete service account', () => {
    expect(() => buildServiceAccountAssertion({} as never)).toThrow('incomplete');
    expect(() =>
      buildServiceAccountAssertion({ client_email: 'x@y.iam.gserviceaccount.com' } as never),
    ).toThrow('incomplete');
  });
});

describe('loadServiceAccount', () => {
  it('returns null when unset or malformed', () => {
    expect(loadServiceAccount(undefined)).toBeNull();
    expect(loadServiceAccount('')).toBeNull();
    expect(loadServiceAccount('   ')).toBeNull();
    expect(loadServiceAccount('{"type":"user"}')).toBeNull();
    expect(loadServiceAccount('{not json')).toBeNull();
    expect(loadServiceAccount('C:\\no\\such\\file.json')).toBeNull();
  });

  it('accepts inline JSON with the service-account shape', () => {
    const sa = loadServiceAccount(
      JSON.stringify({
        type: 'service_account',
        client_email: 'sa@maurinex.iam.gserviceaccount.com',
        private_key: 'pk',
      }),
    );
    expect(sa).toMatchObject({ type: 'service_account' });
  });
});

// ── kycSignals (pure, zero-import) ──

describe('normalizeEmbedding', () => {
  it('accepts a finite vector in the 64–1024 range', () => {
    const vector = Array.from({ length: 128 }, (_, i) => i / 1000);
    expect(normalizeEmbedding(vector)).toEqual(vector);
  });

  it('rejects wrong sizes, non-numbers, and non-arrays', () => {
    expect(normalizeEmbedding(Array(63).fill(0.1))).toBeNull();
    expect(normalizeEmbedding(Array(1025).fill(0.1))).toBeNull();
    expect(normalizeEmbedding([...Array(64).fill(0.1).slice(0, 63), NaN])).toBeNull();
    expect(normalizeEmbedding('nope')).toBeNull();
    expect(normalizeEmbedding(null)).toBeNull();
    expect(normalizeEmbedding({})).toBeNull();
  });

  it('coerces numeric strings', () => {
    const vector = Array(64).fill('0.5');
    expect(normalizeEmbedding(vector)).toEqual(Array(64).fill(0.5));
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors and 0 for orthogonal ones', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1);
  });

  it('returns null on mismatched lengths, empty vectors, zeros, and non-numbers', () => {
    expect(cosineSimilarity([1, 2], [1])).toBeNull();
    expect(cosineSimilarity([], [])).toBeNull();
    expect(cosineSimilarity([0, 0], [1, 1])).toBeNull();
    expect(cosineSimilarity([NaN, 1], [1, 1])).toBeNull();
    expect(cosineSimilarity(null, [1])).toBeNull();
  });

  it('exposes a sane duplicate-face threshold', () => {
    expect(REVIEW_DUPLICATE_FACE_THRESHOLD).toBeGreaterThan(0.5);
    expect(REVIEW_DUPLICATE_FACE_THRESHOLD).toBeLessThan(0.95);
  });
});

type DeviceResults = {
  faceMatchScore?: number;
  livenessScore?: number;
  livenessLive?: boolean;
  cinFields?: Record<string, string>;
};

describe('normalizeDeviceResults', () => {
  it('keeps known fields and clamps scores to [0, 1]', () => {
    const out = normalizeDeviceResults({
      faceMatchScore: 1.7,
      livenessScore: -0.2,
      livenessLive: true,
      cinFields: { last_name: 'TITAN', cin_number: '123' },
    }) as DeviceResults;
    expect(out.faceMatchScore).toBe(1);
    expect(out.livenessScore).toBe(0);
    expect(out.livenessLive).toBe(true);
    expect(out.cinFields).toEqual({ last_name: 'TITAN', cin_number: '123' });
  });

  it('drops unknown keys and oversized strings', () => {
    const out = normalizeDeviceResults({
      faceMatchScore: 0.5,
      rawPayload: 'should never be stored',
      inner: { evil: true },
      cinFields: { ok: 'yes', bad: 'x'.repeat(501), empty: '' },
    }) as DeviceResults;
    expect(out).not.toHaveProperty('rawPayload');
    expect(out).not.toHaveProperty('inner');
    expect(out.cinFields).toEqual({ ok: 'yes' });
  });

  it('caps the number of stored CIN fields at 30', () => {
    const cinFields: Record<string, string> = {};
    for (let i = 0; i < 40; i++) cinFields[`k${i}`] = 'v';
    const out = normalizeDeviceResults({ cinFields }) as DeviceResults;
    expect(Object.keys(out.cinFields!)).toHaveLength(30);
  });

  it('returns an empty object for junk input', () => {
    expect(normalizeDeviceResults(null)).toEqual({});
    expect(normalizeDeviceResults(undefined)).toEqual({});
    expect(normalizeDeviceResults('str')).toEqual({});
    expect(normalizeDeviceResults([1, 2])).toEqual({});
  });
});
