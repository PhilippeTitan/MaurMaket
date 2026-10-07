# The Maurinex Product Discovery Engine
> **A Drop-In Autonomous Q&A Protocol for AI Coding Agents**  
> *Tested across 500+ decisions in MaurMaket with Codex & Gemini.*

---

## 1. What This Is

The **Product Discovery Engine** is an iterative question-and-answer workflow run by an AI agent before writing product code. Instead of the AI making unvalidated architectural assumptions or rushing into premature implementation, it systematically scans the current codebase, identifies UX and backend logic gaps, and conducts a disciplined back-and-forth Q&A with the founder/developer.

When completed, the resulting **Decision Ledger** becomes an **implementation-ready specification** that any AI or human engineer can execute without ambiguity or semantic drift.

---

## 2. Core Operational Rules for the AI Agent

Whenever an AI starts discovery in any project, it must obey these 5 golden rules:

1. **No Premature Implementation:** Do NOT change product code during discovery unless explicitly ordered to fix an urgent bug. Treat discovery as a first-class engineering milestone.
2. **Audit Before Asking:** Never ask generic or hypothetical questions. Inspect the actual codebase (UI components, schemas, API endpoints, error handling, state stores) to find real logic gaps.
3. **Opinionated Recommendations:** Every question must explain trade-offs in plain language and provide a clear, justified **Recommendation**.
4. **Strict Deduplication:** Always maintain a canonical registry. Compare proposed questions against settled decisions by *intent and domain*, not just keywords. Never re-ask settled topics unless scope has fundamentally changed.
5. **Continuous Cadence & Checkpoints:**
   - **Phase 1 (Warm-up):** 3 focused questions per round to establish direction and tone.
   - **Phase 2 (Deep Discovery):** 10 focused questions per round for broad app-wide coverage.
   - **Cadence:** Log and checkpoint progress after every **9 unique answered questions** into the ledger before continuing.

---

## 3. The 4-Step Discovery Loop

```
┌────────────────────────────────────────────────────────┐
│ 1. Codebase Scan & Gap Analysis                        │
│    (Audit models, UX flows, offline, error states)    │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. Deduplication & Round Generation                    │
│    (Check ledger -> 3 or 10 questions with recommendations) │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. User Response & Triage                              │
│    (Accept / Reject / Clarify / Back-pocket)           │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 4. Append to Ledger & Checkpoint (Every 9 answers)     │
│    (Immutable records -> Next round OR Final handoff)   │
└────────────────────────────────────────────────────────┘
```

### Step 1: Codebase Scan & Domain Mapping
The AI analyzes the repo across these standard product domains:
- **Strategy & Boundaries:** Target user, core value promise, launch constraints, anti-features.
- **Onboarding & Auth:** Entry paths, guest vs signed-in privileges, session recovery, step-up security.
- **Core Buyer / User Journey:** Discovery, search ranking, filters, bookmarks/cart, item comparisons.
- **Core Seller / Creator Journey:** Publishing lifecycle, inventory, drafts, KYC/verification tiers.
- **Transactions & Fulfillment:** Commitments, locks, payment state transitions, refunds, handoffs/meetups.
- **Messaging & Notifications:** Chat rules, read receipts, delivery channels, noise throttling.
- **Safety, Disputes & Edge Cases:** Reporting, moderation, data retention, timeouts, offline recovery.
- **Accessibility & Reliability:** Low bandwidth/data saver, screen readers, responsive keyboard navigation.

### Step 2: Formulating Questions
Each question in a round must follow this format:

```markdown
### [Q-ID]: [Short, punchy title]
* **Context / Logic Gap:** [Where the current code or flow is silent or ambiguous]
* **Trade-offs:** [Option A vs Option B explained simply]
* **Recommendation:** (Recommended) [Clear opinion with rationale]
```

### Step 3: Checkpointing & Ledgering
Every 9 unique answers, the AI pauses to record decisions into `docs/discovery/qna-ledger.md` (or equivalent) using this schema:

| ID | Canonical Intent | Domain Tags | Status / Disposition | Decision Note |
|---|---|---|---|---|
| Q001 | Browse without login or force auth at entry? | auth, onboarding | Answered | Browse first; auth required for write actions. |
| Q002 | Offline cart persistence policy | cart, offline | Answered | Cache locally; revalidate price/stock on reconnect. |

---

## 4. How to Drop This into ANY New Project

When starting a new project or feature, copy the snippet below directly into your project's agent prompt file (e.g. `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, or chat prompt):

```markdown
# Product Discovery Protocol
We are conducting an intentional Product Discovery Q&A before implementing code.
Treat this as a product-design and architectural workflow, not a request to code immediately.

### Instructions:
1. Scan the repository to understand current architecture, UI components, data models, and logic gaps.
2. Initialize or consult `docs/discovery/qna-ledger.md`.
3. Screen all candidate questions against previously settled decisions (semantic deduplication).
4. Present questions in batches:
   - First 2 rounds: Exactly 3 focused questions per round.
   - Subsequent rounds: Exactly 10 focused questions per round.
5. For every question: explain the tradeoff in plain language and provide a clear "(Recommended)" choice.
6. After every 9 unique answered questions, update the ledger and summarize progress.
7. Only transition to coding when I signal that discovery is concluded and request an implementation handoff.
```

---

## 5. Transition to Implementation (The Handoff)

Once the target question count is reached (e.g., 50, 100, or 500) or all domain gaps are closed:
1. **Coverage Audit:** Review domain checklist to ensure no high-risk blind spots remain.
2. **Back-Pocket Summary:** List deferred features so they aren't lost or mixed into MVP.
3. **Execution Roadmap:** Group settled decisions into chronological development slices (e.g., Slice 1: Database schemas & state machines; Slice 2: Core endpoints; Slice 3: UI screens & error states).
4. **Handoff:** The implementing agent treats the ledger as absolute ground truth and begins building.
