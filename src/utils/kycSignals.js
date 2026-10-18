// KYC v2 — pure client-signal helpers (docs/rfc/kyc-on-device.md).
// Zero imports on purpose: these must load in unit tests without a DATABASE_URL
// (the CI `unit` job runs with no DB service), unlike kycReview.js which pulls
// in the pool at import time.

/** Advisory cosine similarity between two face embeddings (MobileFaceNet-ish). */
export const REVIEW_DUPLICATE_FACE_THRESHOLD = 0.68;

/** Accept a finite-number array in a sane embedding range, else null. */
export function normalizeEmbedding(value) {
  if (!Array.isArray(value) || value.length < 64 || value.length > 1024) return null;
  const vector = [];
  for (const entry of value) {
    const n = Number(entry);
    if (!Number.isFinite(n)) return null;
    vector.push(n);
  }
  return vector;
}

/** Cosine similarity; null when shapes disagree or a vector is empty. */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return null;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]);
    const y = Number(b[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return null;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Whitelist the client-supplied advisory signals. Unknown keys are dropped
 * (never stored raw), strings are length-capped, scores clamped to [0, 1].
 */
export function normalizeDeviceResults(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  const face = Number(input.faceMatchScore);
  if (Number.isFinite(face)) out.faceMatchScore = Math.min(Math.max(face, 0), 1);
  const live = Number(input.livenessScore);
  if (Number.isFinite(live)) out.livenessScore = Math.min(Math.max(live, 0), 1);
  if (typeof input.livenessLive === 'boolean') out.livenessLive = input.livenessLive;
  if (input.cinFields && typeof input.cinFields === 'object' && !Array.isArray(input.cinFields)) {
    const fields = {};
    let kept = 0;
    for (const [key, value] of Object.entries(input.cinFields)) {
      if (kept >= 30) break;
      if (typeof value === 'string' && value.length > 0 && value.length <= 200) {
        fields[String(key).slice(0, 40)] = value.slice(0, 200);
        kept++;
      }
    }
    if (kept > 0) out.cinFields = fields;
  }
  return out;
}
