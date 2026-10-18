# RFC: On-Device KYC with Platform Attestation

**Status:** DECIDED (2026-10-17) — **free-budget stack, explicitly TEMPORARY**
**Context:** supersedes the Lightning AI cloudspace KYC pipeline
**Upgrade trigger:** when Philippe says he has the **$25 Play Console fee**,
re-open this RFC: register the app (internal track is enough), enable Play
App Signing, flip `KYC_ATTEST_FULL=true`, and replace the human-review final
layer with Play Integrity app-recognition (`requestHash`-bound Standard API).
The build below is designed so that upgrade is a flag flip + client addition,
not a rebuild. Future instances: search this file and AGENTS.md for
"**$25 Play Console trigger**".

---

## 1. Problem

The current KYC pipeline (`src/routes/verification.js`) downloads the user's CIN
front photo and selfie, base64-encodes them, and POSTs them to a **Lightning AI
cloudspace** (`/verify`) for OCR + face match + liveness. This has three
structural defects:

1. **Shared tenancy.** Raw biometric + national-ID images transit to a
   multi-tenant GPU platform's workspace. During the October 2026 Lightning
   security incident (credential compromise, platform-wide lockout), we could
   not audit what an attacker could reach inside that workspace, and cannot
   today verify whether anything from those sessions ever persisted on their
   disk.
2. **Availability is not ours.** The KYC service is down whenever Lightning is
   down. There is no control plane, no status visibility, no failover —
   a third party's incident page is our SLA.
3. **Retention is weak.** `verification_attempts` stores `lightning_raw` and
   photo URLs indefinitely (only the *access log* has a 365-day purge). The
   longer raw biometrics live in a system, the larger the breach surface.

Alternatives evaluated and rejected:

- **Lightning AI / Hugging Face Spaces / free GPU clouds** — same shared-tenancy
  defect; Spaces also sleep. HF ruled out explicitly by decision-maker.
- **Render free tier** — 512MB + auto-sleep cannot hold OCR/face models in
  RAM; this is what pushed the project to Lightning originally.
- **Supabase Edge Functions** — Deno/JS only, ~256MB, short CPU budgets;
  cannot run PaddleOCR/InsightFace-class models at acceptable accuracy.
  Supabase remains the storage + results layer, not the processor.
- **Dedicated VPS worker (Hetzner/Vultr, ~$8–12/mo)** — viable fallback
  (CPU inference works: MobileFaceNet/ArcFace + PaddleOCR need no GPU at
  this volume), retained in this design as the *fallback path* for devices
  that fail attestation or cannot run the models.
- **Commercial KYC vendors (Veriff/Onfido class)** — best compliance posture,
  ~$1–3 per check; deferred on cost grounds.

## 2. Decision (FINAL — free stack, temporary)

**Ship now on a $0 stack; the human-review layer is a stopgap until the
$25 Play Console upgrade.** Budget constraint is real (2026-10-17), so no
paid worker, no Play Console, no vendor. Trust is layered, weakest-link
explicit:

1. **Phone (UX + advisory):** capture, face detect, liveness challenge UX,
   CIN OCR via ML Kit (on-device, offline, free), preliminary match score.
   Instant retake feedback. All advisory — never the final word.
2. **In-app anti-tamper (tollbooth, free):** signing-cert pin
   (`PackageManager.getSigningCertificates` hash vs pinned SHA-256) + dex/
   asset digests. Kills mass-distributed "skip-KYC" modded APKs. NOT a
   wall — a determined attacker patches the check (client code lives on
   their phone). Documented as such; worth building anyway.
3. **Play Integrity device verdicts (free, already credentialled):**
   sideloaded builds set the cloud project number explicitly; device
   verdicts (`MEETS_DEVICE_INTEGRITY` etc.) still evaluate → rooted /
   emulator / custom-ROM detection. `appRecognitionVerdict` will read
   `UNRECOGNIZED_VERSION` until the Play upgrade — expected, logged.
4. **Server (Render, existing plan):** verify pin claim, decode integrity
   token with the existing service account, rate limits, policy checks,
   pgvector duplicate-face on device-sent embeddings (advisory), **enqueue
   for review**. No Lightning. No new paid service.
5. **Human review (THE TEMPORARY FINAL LAYER — Philippe at launch):**
   admin review queue shows selfie + CIN + advisory scores + device
   verdict + anomalies; approve/reject, audit-logged via
   `kyc_evidence_access`. Admin *website* UI not built yet (2026-10-17) —
   API + schema ship first; UI plugs in later.

**Explicitly temporary:** steps 2–3 are best-effort signals; step 5 scales
only to launch volume. The permanent end-state is the Play Console upgrade
(§ upgrade trigger) replacing step 5's authority with app-recognition
attestation; a paid face-match worker (Render/VPS, ~$6–10/mo) may replace
the human step when volume outgrows eyeballs. Both upgrades are additive.

**Lightning is retired** for KYC. No GPU, no always-on worker, no third
party in the biometric path. Raw biometrics never again touch shared
multi-tenant compute.

## 3. Threat model

| Threat | Mitigation |
| --- | --- |
| Mass-distributed "skip-KYC" modded APKs | **Signing-cert pin + dex digests** (client self-check + server-verified pin claim). Tollbooth: stops the lazy 95%. **TEMPORARY** — patchable by a determined attacker; Play upgrade closes this properly. |
| Repackaged app fakes `face_match_score` | **Accepted residual risk until Play upgrade.** Compensating: human review is the final authority (looks at evidence, not scores), pgvector duplicate-face, rate limits, rooted-device flags, phone binding. Re-verify scores in review; never auto-verify on device claim alone. |
| Rooted/emulator/custom-ROM device | **Play Integrity device verdicts** — work on sideloaded builds with explicit cloud project number (credentials already provisioned, project `maurinex`). Flag + manual review, not auto-reject (configurable). |
| Replay of a verdict token | Google-managed replay protection on Standard API decrypt; server also rejects reused tokens (cleared-verdict detection). |
| MITM proxy rewrites the KYC payload | TLS everywhere (already). Full payload binding arrives with Play upgrade (`requestHash`). Until then: pin claim + review layer. |
| User A submits User B's ID photos | Existing policy engine (name/DOB match vs profile) + pgvector duplicate-face check across accounts + manual review queue for conflicts. |
| Device cannot attest (old phone, no Play Services, sideload) | **Fallback:** submission routes to manual review (staff decision), not auto-reject. Attestation failure is itself a fraud *signal*, logged. Optional fallback: server-side worker (VPS) processes the images for these rare cases. |
| Staff misuse of stored evidence | Unchanged: `kyc_evidence_access` append-only log with CHECK-constrained purposes, 365-day purge (migration step 90). |
| Supply-chain: malicious model file in app bundle | Models pinned by hash in the repo; bundled via EAS build (reproducible, signed by Play App Signing); app binary integrity covered by attestation. |

Non-goals: this does not make KYC *legally* certified (e.g. eIDAS-level);
it raises the technical bar and the privacy posture appropriate to MaurMaket's
stage. Regulatory counsel remains separate.

## 4. System design

### 4.1 On-device (Expo/RN)

- `react-native-vision-camera` + ML Kit frame processors:
  - face detection + landmarks (liveness: blink, slight head-turn challenge)
  - text recognition V2 (CIN OCR) → feed extracted fields into a
    **Haitian CIN layout parser** (port of the current server-side field
    mapping from the Lightning response shape — `last_name`, `first_names`,
    `date_of_birth`, `cin_number`, `sex`)
- `react-native-fast-tflite`:
  - **MobileFaceNet (~5MB)** or **ArcFace-Mobile (~13MB)** for 512-d
    embeddings; cosine similarity between selfie face and ID-card face;
    server sets the threshold (policy lives server-side, device only reports
    the score)
  - optional: lightweight anti-spoof model (photo-of-photo detection) as a
    first line; liveness challenge remains the primary
- Liveness UX: on-screen challenge (blink once / turn head slightly) with
  frame-processor capture of the required frames; result = pass/fail + quality
  signals, not just a boolean
- All models bundled in the app binary (signed); no runtime model downloads
  (download = tampering surface + offline Haiti connectivity win)

### 4.2 Attestation

**Android — Play Integrity Standard API (recommended over Classic for new
integrations, 2026):**
1. Cloud project created, Play Integrity API enabled, linked in Play Console
   — **done/reusing the Google Sign-In Cloud project** (2026-10-17: API
   enabled by Philippe; OAuth client id/secret for Sign-In is a *different*
   credential and is not used by Play Integrity)
2. App must be distributed via **Google Play with Play App Signing**
   (internal testing track suffices for development) — **confirmed present**,
   package `com.maurmaket.app`
3. Client: warm up → request integrity token with `requestHash` =
   SHA-256 of the canonical KYC payload. (Play-linked apps do not set the
   cloud project number in the request.)
4. Server: decrypt/verify via Google Play Integrity server API using a
   **service account JSON key** (Render env var); require at least
   `MEETS_DEVICE_INTEGRITY`; log the full verdict; enforce requestHash match

   Service-account setup (Cloud Console, in the linked project):
   - IAM & Admin → Service Accounts → Create (e.g. `play-integrity-decoder`)
   - Grant role: **Service Usage Consumer** (`roles/serviceusage.serviceUsageConsumer`)
     — decode authorization comes from the Play Console project linkage,
     not from an IAM role; the SA only needs to call the enabled API
   - Keys → Add key → Create new key → **JSON** → download (treat as a password)
   - Server calls
     `POST playintegrity.googleapis.com/v1/{packageName}:decodeIntegrityToken`
     with an access token minted from the JSON using the `playintegrity` scope
   - Full JSON contents go to Render as env var `PLAY_INTEGRITY_SA_JSON`
     (same pattern as other secrets); never commit it
5. Quota: 10k req/day default, free increase on request — far above KYC volume

**iOS — App Attest: DEFERRED** (2026-10-17: Android-only launch; no Apple
Developer membership. Revisit when iOS ships.)

### 4.3 Server contract (`POST /verification/submit` v2)

```jsonc
{
  "attestation": {
    "platform": "android" | "ios",
    "token": "<integrity token / assertion>",
    "requestHash": "<sha256 of canonical payload>"   // android
  },
  "device_results": {
    "face_match_score": 0.93,
    "liveness": { "passed": true, "challenge": "blink", "quality": 0.88 },
    "ocr": { "last_name": "...", "first_names": "...",
             "date_of_birth": "...", "cin_number": "...", "sex": "..." }
  },
  "images": {
    "id_front": "<base64 | signed Supabase upload ref>",
    "selfie":   "<...>"
  },
  "app": { "version": "x.y.z", "model_version": "facenet-v1" }
}
```

Server order of operations (fail-closed on attestation, fail-open-to-review on
policy ambiguity):

1. Verify attestation (Google/Apple) → reject or flag on failure
2. Verify `requestHash` covers exactly `device_results` + `images` refs
3. Run policy engine (ported from current `verification.js` stages 1–3)
4. pgvector duplicate-face check
5. Persist attempt + decision; images → private Supabase bucket; purge raw
   images after the retention window (embeddings + scores + audit kept)

### 4.4 Data retention (hardening, applies regardless of transport)

- Raw CIN/selfie images: stored for the dispute window (recommend **90 days**),
  then purged by the existing 03:00 cron — *new*, currently missing
- `lightning_raw` equivalent (`device_results`): keep, but treat as PII;
  CIN number + DOB columns encrypted at rest (Supabase disk encryption is
  on by default; column-level encryption optional hardening)
- Embeddings: kept for account lifetime (needed for duplicate detection);
  exportable/deletable per rights-claim flow already in `dataExport.js`

## 5. Rollout plan (free stack — build authorized 2026-10-17)

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| 1 | Server: schema step 91 (device_verdict, pin, review_status, embeddings), `appIntegrity` module (token decode via SA JSON, pin check — zero new npm deps), v2 submit → `pending_review` queue, admin queue API (website UI later), 90-day image purge | v2 submissions land in queue; Lightning not called when `KYC_V2_ENABLED=true` |
| 2 | Client: capture + ML Kit CIN OCR + TFLite face match + liveness UX + signing-cert pin; requests device verdict with project number `maurinex` | device verdict received on a real sideloaded install |
| 3 | Admin website: review UI (list, evidence viewer, approve/reject) — Philippe's surface, when ready | first real KYC decided end-to-end by review |
| 4 | **$25 Play Console trigger** (when funds exist): Play entry + App Signing + internal track; client requests app-recognition verdict with `requestHash`; `KYC_ATTEST_FULL=true` | app verdict recognized; review demoted to exceptions-only |
| 5 (optional) | Paid worker (Render/VPS) for face-match at volume — replaces human step when eyeballs are the bottleneck | worker decisions + sampled human audit |

**Phase 1 was built 2026-10-17** (feature branch; Lightning path retained for rollback, gated by env flag).

## 6. Status of open questions (updated 2026-10-17)

1. **Play Console status** — RESOLVED: app is on Play with Play App Signing;
   existing Google Sign-In OAuth env creds confirmed (separate from — not
   usable as — Play Integrity credentials).
2. **Apple Developer membership** — RESOLVED: none; iOS deferred, Android-only
   launch (App Attest out of critical path).
3. **Google Cloud** — RESOLVED: reuse the Sign-In project; Play Integrity API
   enabled there by Philippe. **Remaining:** (a) Play Console →
   Protected with Play → Link Cloud project (if not already linked);
   (b) create `play-integrity-decoder` service account + JSON key (§4.2).
4. **Dispute window** — default **90 days** unless Philippe objects.
5. **Volume estimate** — pending (informs review-queue staffing only).
6. **Android-first** — RESOLVED: Android-only for now.

## 7. Cost summary

| Item | Cost |
| --- | --- |
| Play Integrity API | $0 (10k req/day default; free quota increase) |
| App Attest | $0 (Apple Developer $99/yr already required for EAS prod) |
| On-device inference | $0 (user hardware) |
| Supabase | unchanged (existing plan) |
| Render | unchanged (existing plan; no new always-on service) |
| Fallback VPS (optional, Phase 6) | ~$8–12/mo |

Recurring KYC infrastructure cost after cutover: **$0 marginal** (existing
plans only), vs ~$10/mo VPS-only and vs Lightning's GPU cloudspace.
