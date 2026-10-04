# MaurMaket App-Wide Product Q&A Ledger

## Operating state

- Status: Active discovery; product-code implementation is paused except for separately requested fixes.
- Goal: At least 500 unique, answered questions across MaurMaket; continue beyond 500 if meaningful unresolved topics remain.
- Cadence: Starting at APP-Q144, ask ten questions per round and give a recommendation for each. Keep the established decision-log update cadence of every nine answered questions.
- Progress: 511 / 500 unique questions answered, including a three-question focused design-system follow-up after the whole-app discovery concluded. Existing discovery work is indexed below as already covered and will not be counted again.
- Current range: APP-Q256–APP-Q553 screened; APP-Q405–APP-Q553 are answered or covered. APP-Q473–Q482, Q485, Q488, Q492, Q499, Q500, Q502–Q504, and Q528 are covered. APP-Q539 was the 497-answer checkpoint; APP-Q549 was the 507-answer checkpoint. The whole-app discovery concluded after its coverage audit; APP-Q551–APP-Q553 are linked design-system follow-up decisions. If a further discovery round is requested, next checkpoint is APP-Q559 (517 total).
- Duplicate checking: Compare canonical decision intent and domain tags, not wording alone. Check this ledger, prior answer/decision records, and relevant AGENTS.md discovery sections before proposing a round. Mark overlapping candidates covered with references and replace them. Any valid revisit must identify a materially changed scope and link to the earlier decision.

## Question registry

| ID | Canonical intent | Domain tags | Status / disposition | Decision note |
|---|---|---|---|---|
| APP-Q001 | For a first-time visitor, should MaurMaket allow browsing before account creation or require sign-in at entry? | entry, onboarding, auth, discovery | Answered: browse without sign-in; account required for follow/message, cross-device saving, or transaction start | Accepted recommendation. |
| APP-Q002 | Should first-run onboarding use a blocking product tour or contextual guidance as people encounter features? | entry, onboarding, UX | Answered: no blocking tour; contextual, dismissible hints | Accepted recommendation; do not repeat a dismissed hint. |
| APP-Q003 | When a returning user opens the app, should it restore their last destination or always start on a fixed home surface? | entry, navigation, personalization | Answered: restore last main tab; route pending urgent tasks appropriately | Accepted recommendation; pending safety/payment/order action may route to its destination. |
| APP-Q004 | What primary user promise should MaurMaket make across the app? | strategy, value, trust, launch | Answered: local discovery and clear, safer transactions | Accepted recommendation. |
| APP-Q005 | Should launch growth prioritize strong choice and reliable handoffs in a focused area, or broad geographic coverage with thinner inventory? | strategy, launch, marketplace liquidity | Answered: focus on density in a launch area | Accepted recommendation; does not set seller radius. |
| APP-Q006 | Which outcome should define early product success: signups/listings, or completed and repeat transactions? | strategy, metrics, trust | Answered: safe completed and repeat transactions | Accepted recommendation; signups/listings are diagnostics. |
| APP-Q007 | Which broad catalog-integrity rule should apply to counterfeit, illegal, or dangerous goods? | safety, catalog policy, moderation | Answered: prohibit counterfeit, illegal, dangerous goods; clear rules and listing guidance | Accepted recommendation. |
| APP-Q008 | After a user reports a listing, should it disappear immediately or remain available during review? | safety, moderation, reporting | Answered: routine review leaves it visible; credible immediate serious harm can temporarily hide it | Accepted recommendation; appeal path. |
| APP-Q009 | When MaurMaket restricts an account for policy or safety reasons, what notice and review path should it provide? | safety, moderation, account enforcement | Answered: explain reason/duration where possible, paused access, review/appeal; preserve transaction support | Accepted recommendation. |
| APP-Q010 | On a fresh install, how should the app choose the interface language when the device language is supported or unsupported? | localization, onboarding, accessibility | Answered: use supported device language; otherwise Haitian Creole; make switching visible | Accepted recommendation. |
| APP-Q011 | Should product descriptions be translated automatically or only when a buyer requests translation? | localization, listings, buyer experience | Answered: translate only on request, keep original accessible, label translation | Accepted recommendation. |
| APP-Q012 | Should user-authored chat messages be automatically translated into each recipient's app language? | localization, messaging, negotiation | Answered: offer per-message translation; never silently replace original | Accepted recommendation, with special care for prices and order terms. |
| APP-Q013 | Should account closure be self-service in the app or require contacting support? | account lifecycle, privacy, support | Answered: offer self-service closure after re-authentication and a clear impact preview | Accepted recommendation. |
| APP-Q014 | How should closure work while orders, disputes, payouts, subscriptions, or balances remain unresolved? | account lifecycle, orders, payments, safety | Answered: pause new activity; retain limited access to resolve existing obligations before final closure | Accepted recommendation. |
| APP-Q015 | What should happen to a user's public listings, profile, chat history, and transaction records after closure? | account lifecycle, privacy, records, messaging | Answered: unpublish listings/remove public profile; preserve necessary order/chat context and operational/legal records | Accepted recommendation; apply appropriate retention rules. |
| APP-Q016 | Should users be able to export a copy of their information before account closure? | account lifecycle, privacy, data portability | Answered: provide a self-service export, excluding others' private data and credentials | Accepted recommendation. |
| APP-Q017 | Should a closure request have a short cancellation window before final deletion? | account lifecycle, privacy, security | Answered: provide short undo window; stop new activity immediately; finalize only after window and obligations | Accepted recommendation. |
| APP-Q018 | How should a closed user's old messages appear in another person's chat history? | account lifecycle, messaging, privacy, records | Answered: preserve transaction-relevant messages with closed-account state; retain required identity snapshots | Accepted recommendation. |
| APP-Q019 | Should the Buying/Selling order workspace remain role-separated or become one combined order list? | orders, navigation, buyer/seller journeys | Answered: retain separate Buying and Selling views | Accepted recommendation; share visual patterns and make switching obvious. |
| APP-Q020 | How should the order list prioritize active orders versus completed/canceled history? | orders, status, task prioritization | Answered: active orders first; completed/canceled behind History | Accepted recommendation; time-sensitive actions first in active orders. |
| APP-Q021 | Should buyer and seller see a shared event timeline for each order, or role-specific timelines? | orders, transparency, privacy, UX | Answered: shared transaction timeline with private notes/evidence excluded | Accepted recommendation. |
| APP-Q022 | Should order statuses use one generic label or role-aware plain language describing the next step? | orders, content, buyer/seller journeys | Answered: use role-aware plain language and consistent underlying state | Accepted recommendation; state tells the relevant user who acts next. |
| APP-Q023 | Should payment and fulfillment be combined into one status or displayed as separate progress tracks? | orders, payments, fulfillment, transparency | Answered: display separate payment and fulfillment progress plus overall state | Accepted recommendation. |
| APP-Q024 | Should each order provide a downloadable/shareable receipt with the agreed terms and payment/fulfillment summary? | orders, receipts, records, support | Answered: provide in-app receipt and export/share; exclude secrets | Accepted recommendation; include seller identity snapshot and applicable fee details. |
| APP-Q025 | How should users find an order in a large active/history list: status/date filters, search, or both? | orders, navigation, findability | Answered: status/date filters plus safe search by item, counterparty, or reference | Accepted recommendation; exclude secrets/private evidence. |
| APP-Q026 | Should order detail open the existing Inbox thread or create a separate order-only conversation? | orders, messaging, navigation | Answered: link to one persistent Inbox thread; Orders remains canonical for state | Accepted recommendation. |
| APP-Q027 | Should sellers be able to apply actions to several orders at once? | orders, seller tools, transaction safety | Answered: consequential actions per-order; only safe reversible housekeeping could be bulk | Accepted recommendation. |
| APP-Q028 | What should an order card show at a glance? | orders, information hierarchy, privacy | Answered: item/quantity, counterparty, total/payment status, fulfillment method, status, next deadline/action; omit sensitive payment details | Accepted recommendation. |
| APP-Q029 | Should both participants be able to add private notes to an order? | orders, privacy, personal organization | Answered: yes, each user gets private notes not visible to the other party | Accepted recommendation; clearly label private. |
| APP-Q030 | How should users remove completed/canceled orders from their default view? | orders, history, navigation | Answered: archive from default view; preserve in History; never hide unresolved action | Accepted recommendation. |
| APP-Q031 | What happens when a user starts but does not confirm an order action? | orders, reliability, transaction safety | Answered: order remains unchanged; briefly preserve draft input for resumption | Accepted recommendation; drafts never commit an action. |
| APP-Q032 | Should shared order changes show who made them and when? | orders, auditability, transparency | Answered: yes, append-only shared activity timeline with actor and timestamp | Accepted recommendation; excludes private notes/staff-only records. |
| APP-Q033 | How should the app preserve evidence when parties disagree about agreed terms? | orders, disputes, records | Answered: preserve terms and revision history; offer report/review route | Accepted recommendation; no automatic fault decision. |
| APP-Q034 | Can accepted order terms change unilaterally when quantity, price, or fulfillment changes? | orders, negotiation, consent | Answered: no; require the other party to accept material changes | Accepted recommendation; retain original terms in history. |
| APP-Q035 | How should payment be handled after a mutually accepted order change? | orders, payments, consent | Answered: recalculate and disclose the difference before confirmation | Accepted recommendation; no silent charge/refund/balance change. |
| APP-Q036 | Should order details have a canonical summary of the latest mutually accepted terms? | orders, transparency, records | Answered: yes, show current agreed terms and earlier versions | Accepted recommendation. |
| APP-Q037 | Where should confirmed meetup details appear in an order? | orders, meetups, privacy | Answered: fulfillment section with location name/map link; details visible to participants | Accepted recommendation. |
| APP-Q038 | Should confirmed order location remain stable after saved profile/location changes? | orders, meetups, data integrity | Answered: preserve a snapshot of confirmed location and terms | Accepted recommendation; unrelated settings edits do not rewrite the order. |
| APP-Q039 | Can a confirmed meetup location be replaced by one party alone if unavailable? | orders, meetups, consent | Answered: no; propose replacement, require other party confirmation, preserve prior agreement | Accepted recommendation. |
| APP-Q040 | Should the order show voluntary travel/arrival updates? | orders, meetups, coordination, privacy | Answered: yes, voluntary “On my way” / “I’m here” updates | Accepted with clarification: coordination only; no live tracking or required location sharing. |
| APP-Q041 | When should handoff confirmation unlock? | orders, meetups, proximity, fulfillment | Answered: when both parties are at the agreed meetup and ready | Accepted with clarification: proximity unlocks handoff step as helpful signal, not proof of delivery/receipt. |
| APP-Q042 | What is required to mark a handoff complete? | orders, fulfillment, disputes | Answered: each party confirms separately; one confirmation alone leaves order pending | Accepted recommendation; offer problem-report route. |
| APP-Q043 | When should a one-time handoff code become visible? | orders, meetups, fulfillment, security | Answered: explain steps in advance; reveal code only when proximity unlocks handoff | Accepted recommendation. |
| APP-Q044 | Can a handoff be finalized while a participant is offline? | orders, reliability, payments | Answered: no; preserve pending state and retry after connectivity returns | Accepted recommendation; don't claim success or release payment offline. |
| APP-Q045 | Should users see which party's handoff confirmation is pending? | orders, fulfillment, transparency | Answered: yes, show each side's status without location details or blame | Accepted recommendation. |
| APP-Q046 | What should happen when someone is late to a meetup? | orders, meetups, fairness | Answered: remain pending; show agreed window and voluntary arrival status | Accepted recommendation; don't infer fault from lateness alone. |
| APP-Q047 | When should “Can't make it” be available? | orders, meetups, support | Answered: any time before completion; notify other party and open support path | Accepted recommendation; no silent cancellation/payment change. |
| APP-Q048 | What if neither party confirms before meetup window ends? | orders, meetups, disputes | Answered: move to “Meetup unresolved” and guide follow-up/reporting | Accepted recommendation; no auto-completion/refund/fault. |
| APP-Q049 | What minimum details should a completed order show in History? | orders, history, receipts | Answered: outcome, item, date, counterparty; full timeline and receipt available | Accepted recommendation. |
| APP-Q050 | Should canceled and unresolved orders use one generic history outcome? | orders, history, transparency | Answered: no; preserve distinct outcomes (canceled, unresolved, completed, reviewed dispute) | Accepted recommendation; avoid implying unsupported certainty. |
| APP-Q051 | Where should an order remain while a dispute is under review? | orders, disputes, support | Answered: active order area as “Under review”; move to History after resolution with outcome/timeline | Accepted recommendation. |
| APP-Q052 | Can a user delete an order from personal history? | orders, records, privacy | Answered: no; archive from default view, preserve transaction record | Accepted recommendation. |
| APP-Q053 | How long should users have access to the full order timeline? | orders, records, retention | Answered: while account exists, subject to applicable retention and closure obligations | Accepted recommendation; user access does not extend retention beyond needs. |
| APP-Q054 | What should the counterpart see if order details are later removed/anonymized? | orders, records, privacy | Answered: retain minimum facts needed for their own record and label unavailable details | Accepted recommendation; avoid broken links or misleading record. |
| APP-Q055 | If one line item in a multi-item order becomes unavailable before handoff, should the entire order fail or can the parties preserve the rest? | orders, inventory, partial changes | Answered: permit proposed line-item removal with recalculated total and buyer approval | Accepted recommendation; retain original terms. |
| APP-Q056 | Should the handoff flow show a checklist of every item and quantity in a multi-item order? | orders, fulfillment, item verification | Answered: yes, shared checklist before each party's completion confirmation | Accepted recommendation. |
| APP-Q057 | Can one multi-item order be completed across multiple meetups? | orders, fulfillment, payment state | Answered: no, one agreed handoff per order in v1 | Accepted recommendation. |
| APP-Q058 | What should the default ordering of search results prioritize? | discovery, search, relevance | Answered: relevance and listing-quality signals with transparent sort options | Accepted recommendation; no undisclosed paid priority. |
| APP-Q059 | Should recent searches be remembered for convenience? | discovery, search, privacy | Answered: sync signed-in search history with a clear erase control; guest history stays on device | Accepted recommendation. |
| APP-Q060 | When a search has few or no matches, should the app suggest query changes? | discovery, search, usability | Answered: offer spelling/category/filter suggestions without changing query/constraints silently | Accepted recommendation. |
| APP-Q061 | What listing details should be visible on a browse/search card before a buyer opens the product? | discovery, listing cards, trust | Answered: price, condition, broad location, relevant seller trust signals | Accepted recommendation; keep card scannable. |
| APP-Q062 | Where should seller-disclosed condition notes and flaws appear on product detail? | discovery, product detail, condition transparency | Answered: near condition label and before purchase action | Accepted recommendation. |
| APP-Q063 | Should buyers be able to compare multiple listings side by side? | discovery, comparison, product detail | Answered: lightweight compare up to three, focused on price/condition/location/trust | Accepted recommendation. |
| APP-Q064 | How should buyers browse categories with nested subcategories? | discovery, categories, navigation | Answered: enter broad category then refine, preserving back navigation and filter context | Accepted recommendation. |
| APP-Q065 | What should happen when someone opens a shared listing link that is unavailable or removed? | discovery, sharing, listing lifecycle | Answered: explain current state and offer alternatives, not a dead end | Accepted recommendation; similar listings/profile when appropriate. |
| APP-Q066 | How should a user share a listing with someone who does not have MaurMaket? | discovery, sharing, onboarding | Answered: privacy-safe public preview and app/web entry path, without private account data | Accepted recommendation. |
| APP-Q067 | Should personalized recommendations use browsing and purchase activity? | discovery, personalization, privacy | Answered: use relevant first-party activity, explain it, provide reset/reduce controls, avoid sensitive inferences | Accepted recommendation. |
| APP-Q068 | Should users be able to tune what appears in recommendations? | discovery, personalization, user control | Answered: provide simple “more/less like this” controls and undo | Accepted recommendation; avoid complex v1 dashboard. |
| APP-Q069 | Should paid or promoted listings appear in ordinary discovery results? | discovery, promotions, ranking transparency | Answered: yes if labeled, relevant, safety-compliant, and organic listings remain visible | Accepted recommendation. |
| APP-Q070 | Should personalization be on by default for signed-in users? | discovery, personalization, consent | Answered: yes for low-risk MaurMaket activity, with visible opt-out; no sensitive inference/cross-app tracking | Accepted recommendation. |
| APP-Q071 | Should a recommendation explain why an item was shown? | discovery, personalization, transparency | Answered: show brief reason where useful plus direct “less like this” control | Accepted recommendation. |
| APP-Q072 | How should recommendations work for a new user with little or no history? | discovery, personalization, cold start | Answered: broad popular/recent listings using user-selected context; no false personalization | Accepted recommendation. |
| APP-Q073 | When a user turns personalization off, what should happen to existing preference signals? | discovery, personalization, privacy | Answered: stop using for ranking immediately; separately offer clearing signals/history; retain only operationally needed data | Accepted recommendation. |
| APP-Q074 | Should users be able to reset recommendations without clearing search history or saved items? | discovery, personalization, user control | Answered: yes, clear inferred recommendation signals separately; preserve explicit saves/search history unless separately cleared | Accepted recommendation. |
| APP-Q075 | Should recommendation controls be available to guests as well as signed-in users? | discovery, personalization, guest experience | Answered: yes, temporary on-device tuning with persistence limitations explained | Accepted recommendation. |
| APP-Q076 | If a listing's price changes after a buyer saves it, how should the buyer learn about it? | discovery, saved items, pricing transparency, notifications | Covered duplicate: price-change display to savers already settled in AGENTS.md Add Product Discovery; user reaffirmed item-level opt-in | Not counted; reference existing decision. |
| APP-Q077 | If a saved listing becomes reserved or temporarily unavailable, how should it appear in Saved? | discovery, saved items, inventory, notifications | Answered: retain with clear status/disabled purchase action and allow push notification | Accepted recommendation; restore actions when available again. |
| APP-Q078 | Should buyers be able to hide or remove unavailable listings from saved items in bulk? | discovery, saved items, housekeeping | Answered: individual remove and “clear unavailable” with Undo | Accepted recommendation; does not affect listing/order. |
| APP-Q079 | Should a saved-item price alert fire for both increases and decreases, or only for price drops? | discovery, saved items, pricing, notifications | Covered duplicate: opt-in price-drop alert behavior is already settled in AGENTS.md Add Product Discovery | Not counted; user's agreement reaffirms existing policy. |
| APP-Q080 | When an unavailable saved item becomes available again, should that trigger a push alert? | discovery, saved items, inventory, notifications | Answered: offer per-item “notify me when available” control | Accepted recommendation; saving alone does not imply consent. |
| APP-Q081 | Does saving a listing reserve its inventory? | discovery, saved items, inventory commitments | Answered: no, saving is a bookmark; reservation begins at the existing order commitment point | Accepted recommendation; explain stock can change. |
| APP-Q082 | If a user loses access to their sign-in email, what account-recovery path should MaurMaket offer? | account, authentication, recovery, safety | Answered: verified recovery channel with risk checks; support cannot bypass ownership based on profile/KYC details alone | Accepted recommendation. |
| APP-Q083 | How should a signed-in user change their email address? | account, authentication, recovery, privacy | Answered: re-authenticate, verify new email, notify old email when possible, review sessions | Accepted recommendation. |
| APP-Q084 | Should users be able to review and revoke their signed-in devices/sessions? | account, authentication, security | Answered: yes, recent sessions, revoke individually, sign out other devices; no sensitive fingerprints | Accepted recommendation. |
| APP-Q085 | How should browsing work when a user's connection is slow or intermittent? | reliability, discovery, performance, accessibility | Answered: prioritize text/essential controls, sized image previews, clear retry states | Accepted recommendation. |
| APP-Q086 | What should the app show when listing images fail to load? | reliability, discovery, media | Answered: retain details, neutral placeholder and explicit retry; no false product imagery | Accepted recommendation. |
| APP-Q087 | Should buyers be able to browse previously viewed or saved listings while offline? | reliability, discovery, offline behavior | Answered: allow possibly stale cached content; disable ordering until online verification | Accepted recommendation. |
| APP-Q088 | Should users be able to increase text size beyond their device default? | accessibility, typography, settings | Answered: honor system text scaling throughout; add in-app control only if needed and prevent clipping | Accepted recommendation. |
| APP-Q089 | Should key information rely on color alone to convey status? | accessibility, visual design, status communication | Answered: no; pair color with labels/icons/patterns and maintain readable contrast in both themes | Accepted recommendation. |
| APP-Q090 | On web, should keyboard users be able to reach and operate every core marketplace action? | accessibility, web, keyboard navigation | Answered: yes, logical focus order, visible focus, keyboard controls, dismissible overlays | Accepted recommendation. |
| APP-Q091 | Should a seller profile show an estimated response-time signal? | discovery, seller trust, messaging | Answered: broad estimate only with sufficient recent data, labeled estimate; do not penalize new/low-volume sellers | Accepted recommendation. |
| APP-Q092 | Should a seller's live online/last-active status be public? | discovery, privacy, messaging | Answered: off by default; any future option is explicit opt-in and coarse, not exact last-active time | Accepted recommendation. |
| APP-Q093 | Should sellers be able to show a temporary “away” message on their profile/listings? | discovery, seller availability, messaging | Answered: optional message with expiry; listings remain browseable and it does not imply orders are paused | Accepted recommendation. |
| APP-Q094 | What should a seller identity-verification badge promise to buyers? | trust, verification, profiles | Answered: identity was checked by MaurMaket; not product authenticity, endorsement, or outcome guarantee | Accepted recommendation. |
| APP-Q095 | Should tapping the verification badge explain what was checked? | trust, verification, transparency, privacy | Answered: yes, plain-language explainer and policy link; never expose KYC materials | Accepted recommendation. |
| APP-Q096 | If verification status changes later, should past order/review snapshots retain the status at the time? | trust, verification, order records | Answered: preserve historical status snapshot; show current status on profile | Accepted recommendation. |
| APP-Q097 | How should an unpurchased cart persist across sessions and devices? | cart, checkout, continuity | Answered: sync signed-in cart across devices; guest cart stays on device; cart does not reserve stock | Accepted recommendation. |
| APP-Q098 | Should buyers be able to move an item from Cart to Saved for later? | cart, saved items, buyer workflow | Answered: yes, one action; saved item does not reserve stock and checkout rechecks price/availability | Accepted recommendation. |
| APP-Q099 | How should a cart containing products from multiple sellers be organized? | cart, checkout, multi-seller orders | Answered: group by seller with subtotals and clear seller-specific fulfillment/payment requirements | Accepted recommendation. |
| APP-Q100 | Should signed-in buyers be able to save a search with its filters for reuse? | discovery, search, saved searches | Answered: yes, private saved searches with edit/delete controls | Accepted recommendation. |
| APP-Q101 | Should saved searches notify buyers when new matching listings appear? | discovery, search, notifications | Answered: yes; in-app/daily summary by default, immediate push opt-in per search | Accepted recommendation. |
| APP-Q102 | How should saved-search alerts avoid repeatedly showing the same matching listing? | discovery, search, notification quality | Answered: notify once per listing per saved search; later meaningful availability/change follows item-alert rules | Accepted recommendation; avoid duplicate alert. |
| APP-Q103 | Should users be able to pause a saved search without deleting it? | discovery, search, user control | Answered: yes, pause/resume while retaining query and filters | Accepted recommendation. |
| APP-Q104 | Should a saved search be editable after creation, or should users create a new one for changed criteria? | discovery, search, management | Answered: edit in place and preserve alert settings; applies to future matches | Accepted recommendation. |
| APP-Q105 | When a saved search finds no new matches for a long time, should MaurMaket automatically delete it? | discovery, search, retention | Answered: no silent deletion; keep until user deletes and optionally mark inactive | Accepted recommendation. |
| APP-Q106 | Should muted sellers' listings remain visible in manual search and browsing? | social, discovery, mute controls | Answered: yes; mute only controls update notifications, not intentional browsing | Accepted recommendation. |
| APP-Q107 | Should saved-search alerts include listings from sellers the buyer muted? | social, discovery, notifications | Answered: no; suppress alerts from muted sellers while keeping them searchable manually | Accepted recommendation. |
| APP-Q108 | Should blocked sellers' listings appear in saved-search alerts or manual discovery? | safety, privacy, discovery, block controls | Answered: no; suppress blocked sellers from discovery and alerts | Accepted recommendation; consistent with existing block policy. |
| APP-Q109 | What should happen to saved listings from a seller after the buyer blocks them? | safety, privacy, saved items | Answered: hide from active Saved/discovery while blocked but preserve saved state to restore if unblocked | Accepted recommendation. |
| APP-Q110 | Should blocking another user remove past order records and receipts? | safety, privacy, orders, records | Answered: no; preserve each party's transaction history/receipts while preventing new non-order contact | Accepted recommendation. |
| APP-Q111 | Should users be able to unblock someone themselves, and should the other person be notified? | safety, privacy, block controls | Answered: allow self-service unblock without notifying the other person | Accepted recommendation; follow/message remains separate. |
| APP-Q112 | Should users be able to edit their date of birth directly after signup? | account, identity data, privacy, age eligibility | Answered: no silent self-edit; re-authenticated correction request with auditable review | Accepted recommendation. |
| APP-Q113 | If signup DOB conflicts with a verified identity document, which value should determine age eligibility? | account, KYC, age eligibility, data integrity | Answered: verified document date after review determines eligibility; flag mismatch, never silently overwrite | Accepted recommendation. |
| APP-Q114 | What should happen while a DOB correction or age-eligibility discrepancy is being reviewed? | account, KYC, safety, appeals | Answered: restrict only uncertain age-gated actions; keep account/support accessible and explain private review/appeal | Accepted recommendation. |
| APP-Q115 | Should users be able to sign in with a passkey as an optional alternative to a password? | account, authentication, accessibility | Answered: offer passkeys where supported but keep existing routes; never require them | Accepted recommendation. |
| APP-Q116 | Should device biometrics be allowed to unlock an existing MaurMaket session? | account, authentication, device security | Answered: allow local convenience on trusted device; not server auth or KYC proof | Accepted recommendation. |
| APP-Q117 | Which actions should require a fresh authentication check even when the user is already signed in? | account, authentication, payments, security | Answered: step-up for account/recovery/payout changes and other high-impact actions; never request payment PIN | Accepted recommendation. |
| APP-Q118 | If a review is reported for threats or exposed private information, should it remain public while reviewed? | reviews, safety, moderation, privacy | Covered (not counted): existing Profile & Settings decision says keep it public unless there is a clear safety or privacy concern (AGENTS.md, Profile & Settings Discovery) | User agreed with the already-settled exception; no new decision. |
| APP-Q119 | When a buyer edits a published review, should the public page indicate that it was edited? | reviews, transparency, records | Covered (not counted): existing Profile & Settings decision says edited reviews are visibly marked (AGENTS.md, Profile & Settings Discovery) | User reaffirmed the existing decision; no new decision. |
| APP-Q120 | Should a seller's reply to a review notify the buyer who wrote it? | reviews, notifications, seller communication | Answered: send one in-app activity notification; no immediate push by default | Accepted recommendation; retain the single concise seller reply, not a thread. |
| APP-Q121 | Should a buyer be able to delete their own published review, or only edit it? | reviews, buyer controls, trust records | Answered: allow deletion from public view and rating averages; retain the minimum private audit/order record needed for integrity and policy | Accepted recommendation. |
| APP-Q122 | Should a buyer be able to request translation of a review written in another supported language? | reviews, localization, accessibility | Answered: offer on-demand translation; preserve and label the original | Accepted recommendation; translated text never silently replaces the author's words. |
| APP-Q123 | Should a user be able to track a support request in one case view with a reference number and current status? | support, case management, transparency | Answered: provide a private case view with reference, status, latest update, and next expected step | Accepted recommendation. |
| APP-Q124 | After opening a support case, should users be able to add follow-up evidence and context to that same case? | support, evidence, auditability | Answered: allow timestamped follow-up; label user-provided evidence clearly, including SMS not independently verified | Accepted recommendation. |
| APP-Q125 | Should MaurMaket show an expected support response window for each case? | support, service expectations, trust | Answered: show a case-priority-based estimate, update delays, and avoid an unsupported resolution guarantee | Accepted recommendation. |
| APP-Q126 | Should Support communicate with the user inside the same private case view? | support, case management, communication | Answered: yes; keep Support replies and user follow-up in the private case history, separate from marketplace chats | Accepted recommendation. |
| APP-Q127 | When a user reports another participant, what should the reported participant be told about the report? | support, privacy, fairness, disputes | Answered: explain the specific behavior needing a response and share only necessary evidence | Accepted recommendation; protect reporter contact details and unrelated/private material. |
| APP-Q128 | If Support is waiting for a user's reply or evidence, should the case close automatically after inactivity? | support, case lifecycle, fairness | Answered: send one reminder, then mark waiting/paused or close with a clear reopen path | Accepted recommendation; never silently erase a case or treat silence as proof of fault. |
| APP-Q129 | Should support requests use a small set of issue categories to help route them to the right team? | support, intake, operations | Answered: use plain-language categories; users can correct them and Support can reroute without a new request | Accepted recommendation. |
| APP-Q130 | When Support closes a case, should the user receive a concise outcome summary? | support, transparency, case resolution | Answered: give a concise outcome, key reason, and next step | Accepted recommendation; do not expose staff notes or another person's private data. |
| APP-Q131 | Should users be able to request a second review of a closed support case? | support, appeals, accountability | Answered: allow one second review for new evidence or a clear process concern, routed to another reviewer where practical | Accepted recommendation. |
| APP-Q132 | Should MaurMaket controls expose their purpose and current state to screen readers? | accessibility, assistive technology, interaction | Answered: expose clear accessible names, roles, values, and state; verify key flows with screen readers | Accepted recommendation. |
| APP-Q133 | How should the app announce important state changes to screen-reader users? | accessibility, assistive technology, feedback | Answered: announce meaningful outcomes/status changes without interrupting for routine background refreshes | Accepted recommendation. |
| APP-Q134 | Should product photos have text alternatives for buyers using screen readers? | accessibility, listings, media | Answered: offer concise image descriptions; keep ordinary-photo descriptions optional and guide descriptions for condition, variants, or safe use | Accepted recommendation. |
| APP-Q135 | Should map discovery and place selection have a usable alternative to pan/drag gestures? | accessibility, map, motor access | Answered: provide searchable/list-based place and result controls with the same area and confirmation rules, alongside the map | Accepted recommendation. |
| APP-Q136 | Should identity-verification camera steps include accessible instructions and recovery when capture is difficult? | accessibility, identity verification, onboarding | Answered: provide spoken/screen-reader instructions, specific retake guidance, and human support for barriers without weakening identity checks | Accepted recommendation. |
| APP-Q137 | How should time-sensitive tasks communicate deadlines to assistive-technology users? | accessibility, deadlines, notifications | Answered: show remaining time and absolute deadline; announce meaningful changes without ticking alerts and keep agreed reminders | Accepted recommendation. |
| APP-Q138 | Should important actions use subtle haptic feedback in addition to visual and screen-reader feedback? | accessibility, haptics, interaction | Answered: use restrained haptics for meaningful confirmations/errors, respect device setting, never rely on vibration alone | Accepted recommendation. |
| APP-Q139 | What minimum touch-target size should core mobile controls meet? | accessibility, mobile, interaction design | Answered: target at least 44–48 dp for frequent/core controls, with spacing to prevent accidental adjacent taps | Accepted recommendation. |
| APP-Q140 | Should success and error messages remain visible beyond a brief toast when users may need to act on them? | accessibility, feedback, reliability | Answered: keep consequential errors and next steps visible until corrected/dismissed; reserve brief toasts for low-impact confirmations | Accepted recommendation. |
| APP-Q141 | Should spoken app content respect the language of each individual listing/message when it differs from the interface language? | accessibility, localization, assistive technology | Answered: annotate content language for screen readers where available; keep navigation and controls in the selected interface language | Accepted recommendation. |
| APP-Q142 | Should recipients be able to request a text transcript for a voice message? | accessibility, messaging, speech | Answered: offer an automated transcript while keeping the original audio available | Accepted recommendation; label the transcript and never present it as the sender's exact recording. |
| APP-Q143 | Should accessible descriptions for listing photos be editable after publication? | accessibility, listings, seller workflow | Answered: allow description edits in listing management; apply normal review only when material claims/safety details change | Accepted recommendation. |
| APP-Q144 | Should senders see when a message was sent, delivered, and read? | messaging, transparency, privacy | Answered: show quiet sent/delivered/read states; make read receipts configurable for ordinary chats | Accepted recommendation; preserve essential order-event records independently. |
| APP-Q145 | Should a chat show a temporary typing indicator while the other person is composing? | messaging, presence, privacy | Answered: yes, show a brief animated WhatsApp-style bubble while actively typing | Accepted recommendation; use subtle motion, respect Reduce Motion, and do not expose persistent online/last-seen status. |
| APP-Q146 | Should users be able to edit a sent chat message? | messaging, trust, records | Answered: allow edits for a short window and mark them “edited” | Accepted recommendation; preserve immutable snapshots when a message becomes accepted order terms or evidence. |
| APP-Q147 | Should users be able to delete a sent message for everyone? | messaging, privacy, records | Answered: allow a short unsend window for ordinary chat and show a “message removed” marker | Accepted recommendation; never erase order terms/evidence from the audit record. |
| APP-Q148 | Should buyers be able to search within a conversation? | messaging, findability, privacy | Answered: yes, search the user's accessible conversation history | Accepted recommendation; exclude private support records and secrets. |
| APP-Q149 | Should links shared in chat display an automatic web-page preview? | messaging, privacy, security | Answered: make previews optional; show the raw domain and allow sending without a preview | Accepted recommendation; avoid fetching private/tracking URLs. |
| APP-Q150 | Which attachment types should ordinary chat support in v1? | messaging, media, safety | Answered: images and voice messages; validate size/type and show upload progress/retry | Accepted recommendation; keep transaction evidence tied to its order case. |
| APP-Q151 | Should users be able to mute notifications for one conversation without blocking the person? | messaging, notifications, user control | Answered: yes, allow a per-conversation mute | Accepted recommendation; support duration/until-unmuted and keep order-critical tasks available in Orders/Action needed. |
| APP-Q152 | Should users be able to archive a conversation from the main Inbox list? | messaging, inbox organization, order continuity | Answered: yes for ordinary chats, with easy restoration | Accepted recommendation; active order-linked chats remain reachable from Orders with required actions. |
| APP-Q153 | Should users be able to pin a small number of conversations to the top of the Inbox? | messaging, inbox organization, navigation | Answered: yes, pin a small capped number | Accepted recommendation; do not bury active order actions/deadlines. |
| APP-Q154 | Should a first message from a new person enter the main Inbox or a message-request area? | messaging, safety, inbox organization | Answered: use a lightweight Requests area for first contact with listing/order context; acceptance moves it into Inbox, while urgent order messages stay direct | Accepted recommendation. |
| APP-Q155 | Should buyers be able to report a specific message without reporting the entire conversation? | messaging, safety, reporting | Answered: allow selecting a message/reason with nearby private review context; one report alone does not trigger a penalty | Accepted recommendation. |
| APP-Q156 | Should users be able to save or bookmark an important message inside a conversation? | messaging, organization, records | Answered: permit private, user-only bookmarks; canonical order terms remain in the order summary | Accepted recommendation. |
| APP-Q157 | Should chat support sending a location pin to help arrange an in-person meetup? | messaging, location, safety | Answered: allow an explicit one-time place pin/link, never live location; confirmed order location remains canonical and participant-only | Accepted recommendation. |
| APP-Q158 | Should MaurMaket offer voice or video calls inside chat? | messaging, privacy, communication | Answered: defer in-app calls in V1; keep communication in auditable text/voice-message flows | Deferred/back pocket; avoid exposing phone numbers or adding a difficult-to-support transaction channel. |
| APP-Q159 | Should the app show a clear warning before a user shares a phone number or payment credential in chat? | messaging, privacy, fraud prevention | Answered: warn on likely sensitive payment credentials and point to in-app flows; do not block ordinary contact details or broadly scan chats | Accepted recommendation. |
| APP-Q160 | Should sent images in ordinary chat expire automatically? | messaging, media, privacy, records | Answered: do not expire ordinary chat images by default; order-submitted evidence follows its case-retention rules | Accepted recommendation. |
| APP-Q161 | Should the Inbox offer an unread-only conversation filter? | messaging, inbox organization, findability | Answered: yes, add a lightweight Unread filter and keep All as default | Accepted recommendation. |
| APP-Q162 | Should a user be able to manually mark a conversation unread after opening it? | messaging, inbox organization, user control | Answered: yes, as a synced personal reminder that does not notify the other user or alter their read receipt | Accepted recommendation. |
| APP-Q163 | Should group conversations be available in V1 for buyers, sellers, or business staff? | messaging, business tier, permissions | Answered: keep V1 one-to-one; defer staff/group conversations until permissions, attribution, and order audit history are designed | Deferred/back pocket. |
| APP-Q164 | While a first-contact message is pending, what sender information should the recipient see before accepting? | messaging, requests, privacy, safety | Answered: show chosen public identity and relevant listing/order context; hide private account/KYC data and unrelated profile details | Accepted recommendation. |
| APP-Q165 | What should a recipient be able to do with a message request? | messaging, requests, safety, block/report | Answered: offer Accept, Delete, and Report, with Block in overflow; deleting declines without affecting an order/listing | Accepted recommendation. |
| APP-Q166 | Should read receipts be sent while a conversation remains in Message Requests? | messaging, requests, privacy, read receipts | Answered: no read receipt before acceptance; show delivery, then apply ordinary read-receipt preference after acceptance | Accepted recommendation. |
| APP-Q167 | How many messages may a new sender send before their request is accepted? | messaging, requests, abuse prevention | Answered: allow one concise initial message with listing context; hold follow-ups until acceptance, preserving urgent existing-order contact | Accepted recommendation. |
| APP-Q168 | Should unanswered message requests expire automatically? | messaging, requests, retention | Answered: do not silently expire quickly; archive stale requests after a clear period with a visible restore path | Accepted recommendation; report evidence follows policy retention. |
| APP-Q169 | Which attachments should be allowed before a recipient accepts a message request? | messaging, requests, media, safety | Answered: none before acceptance; supported media becomes available after acceptance | Accepted recommendation. |
| APP-Q170 | Can a buyer send a formal offer through an unaccepted message request? | messaging, requests, offers, commerce | Answered: no; accept the conversation first, then use the established offer flow | Accepted recommendation; preserve clear terms and deadline. |
| APP-Q171 | Should accepting a message request automatically follow the sender or their shop? | messaging, requests, follows, consent | Answered: no; acceptance only opens the conversation and Follow remains a separate explicit choice | Accepted recommendation. |
| APP-Q172 | How should a sender learn that their request was declined or deleted? | messaging, requests, feedback, privacy | Answered: show a neutral status without revealing whether the recipient deleted, reported, or blocked them; no decline push | Accepted recommendation. |
| APP-Q173 | Should Message Requests have a separate unread badge from accepted Inbox conversations? | messaging, requests, badges, navigation | Answered: yes; separate Requests count from accepted chats/offers count | Accepted recommendation. |
| APP-Q174 | Should a seller see an aggregated buyer-reliability signal when considering an offer or starting an order? | trust, buyer reputation, offers, privacy | Answered: show only a private, privacy-safe signal in the relevant transaction context when sufficient reliable history exists; no public buyer score | Accepted recommendation; linked follow-up to Profile & Settings' back-pocket buyer-reputation note. |
| APP-Q175 | Should a buyer see an aggregated seller-fulfillment reliability signal in a live offer/order context in addition to public rating and completed-sales count? | trust, seller reliability, offers, orders | Answered: consider a concise, data-backed fulfillment signal when useful in the active decision; avoid unsupported guarantees | Accepted recommendation. |
| APP-Q176 | Where should any participant-reliability summary be visible? | trust, privacy, buyer/seller journeys | Answered: only in the relevant offer/order context for participants; not public buyer profiles or broad discovery cards | Accepted recommendation. |
| APP-Q177 | Which history should count toward a reliability signal? | trust, reputation, order lifecycle, fairness | Answered: use only well-defined, platform-recorded outcomes; exclude unverified claims and self-reported NatCash transfers | Accepted recommendation. |
| APP-Q178 | Should unresolved disputes or meetup reports lower a user's reliability signal? | trust, disputes, reputation, fairness | Answered: no; exclude unresolved events and use only finalized outcomes under the neutral dispute process | Accepted recommendation. |
| APP-Q179 | What minimum history should exist before showing a reliability signal? | trust, reputation, fairness, privacy | Answered: require a meaningful minimum of completed transactions; show no signal before the threshold | Accepted recommendation; exact threshold remains implementation detail. |
| APP-Q180 | Should reliability appear as a precise percentage/score or a broad label? | trust, reputation, comprehension | Answered: use plain-language bands with visible sample size; avoid false precision | Accepted recommendation. |
| APP-Q181 | How should the app present a user with no eligible transaction history? | trust, reputation, fairness, onboarding | Answered: show “New on MaurMaket” or no signal; never imply missing history is poor reliability | Accepted recommendation. |
| APP-Q182 | Should users be able to see how a reliability signal was calculated? | trust, reputation, transparency | Answered: explain included outcomes, sample size, and exclusions without exposing another user's private order details | Accepted recommendation. |
| APP-Q183 | What recourse should a user have if their reliability summary appears incorrect? | trust, reputation, appeals, support | Answered: provide a Support correction path and avoid automatic penalties while reviewed | Accepted recommendation; preserve the underlying order history. |
| APP-Q184 | If a message is composed while offline, should it send automatically when connectivity returns or wait for the user's confirmation? | messaging, reliability, offline behavior, consent | Answered: automatically send when internet returns unless the sender deletes it; keep it waiting visibly while offline | Accepted; overrides explicit-retry recommendation. |
| APP-Q185 | How should the chat distinguish an offline queued message from a sent or delivered message? | messaging, reliability, status, transparency | Answered: use WhatsApp-style check marks to distinguish message progress | Accepted; map check states clearly to queued/sent/delivered/read and honor read-receipt settings. |
| APP-Q186 | What should happen if a send times out and the app cannot tell whether the server received the message? | messaging, reliability, duplicate prevention | Answered: retry with the same message identifier and show a pending/unknown state until confirmed | Accepted recommendation; prevent duplicate messages. |
| APP-Q187 | In what order should multiple offline messages send after the user retries them? | messaging, reliability, conversation order | Answered: preserve their original compose order and show that order before retrying the batch | Accepted recommendation. |
| APP-Q188 | Can a user edit or remove a message that is queued locally but not yet sent? | messaging, reliability, user control | Answered: allow edit or discard until the server confirms receipt; distinguish local removal from unsending a delivered message | Accepted recommendation. |
| APP-Q189 | How long should an unsent offline message remain on the device? | messaging, reliability, privacy, retention | Answered: keep it until the user sends/discards it or signs out, and make unsent drafts easy to review and clear | Accepted recommendation. |
| APP-Q190 | How should image and voice attachments recover if connectivity drops mid-upload? | messaging, media, reliability, offline behavior | Answered: preserve selected file and resume/retry upload where supported; confirm only after upload and message record succeed | Accepted recommendation. |
| APP-Q191 | Should an unsent chat draft survive closing or restarting the app? | messaging, reliability, drafts, privacy | Answered: preserve it on that device with a clear unsent label, using protected local storage where available | Accepted recommendation. |
| APP-Q192 | If a user reads a conversation offline, when should its read state sync to the other participant? | messaging, reliability, read receipts, privacy | Answered: sync after reconnect only if allowed by read-receipt preference | Accepted recommendation. |
| APP-Q193 | Should queued messages sync to the user's other signed-in devices before they are sent? | messaging, reliability, multi-device, privacy | Answered: keep unsent content on the originating device; sync only after server acceptance | Accepted recommendation. |
| APP-Q194 | Should MaurMaket offer a user-controlled Low Data mode, rather than changing media behavior automatically for everyone? | data use, settings, reliability, user control | Answered: offer an optional setting and a gentle suggestion on poor connections; do not assume users want lower quality based on network speed alone | Accepted recommendation. |
| APP-Q195 | In Low Data mode, should Feed and Explore preload images for offscreen listings? | data use, Feed, Explore, performance | Answered: stop nonessential offscreen preloading but keep the visible listing clear and usable | Accepted recommendation; this qualifies normal next-item preloading under an explicit preference. |
| APP-Q196 | In Low Data mode, how should listing photos load? | data use, discovery, images, settings | Answered: show a lightweight preview first; load the full image when opened or requested | Accepted recommendation. |
| APP-Q197 | Should chat images auto-download over mobile data when Low Data mode is enabled? | data use, messaging, media, privacy | Answered: no; show a preview and let the user tap to load | Accepted recommendation. |
| APP-Q198 | How should voice messages behave when the user is on a limited connection? | data use, messaging, accessibility | Answered: start playback only on tap, stream progressively if possible, and show a clear retry/download option | Accepted recommendation. |
| APP-Q199 | Should product videos be included in Low Data mode decisions for V1? | data use, discovery, media scope | Covered (not counted): Feed & Explore Discovery already settled still product photos only; short-video upload/playback is out of scope | No changed scope; replace with APP-Q204. |
| APP-Q200 | When a seller selects listing photos on mobile data, should upload start immediately or wait for confirmation? | data use, seller workflow, uploads | Answered: disclose estimated size and ask before a large upload; preserve draft and selected files if the seller waits or connection drops | Accepted recommendation. |
| APP-Q201 | Should the app reduce listing-photo quality automatically to save a seller's data? | data use, seller workflow, media integrity | Answered: use sensible compression that preserves product details; do not silently lower quality beyond a disclosed, safe default | Accepted recommendation. |
| APP-Q202 | Should map tiles and previews use a reduced-data mode when Low Data is enabled? | data use, map, location, accessibility | Answered: yes; use a lightweight map and keep the searchable/list alternative; do not reduce confirmed-order location precision | Accepted recommendation. |
| APP-Q203 | Should Low Data mode also prevent background media downloads and uploads outside the current screen? | data use, settings, background tasks, privacy | Answered: yes; pause nonessential background media work on mobile data with visible progress and user-controlled resume | Accepted recommendation. |
| APP-Q204 | Should Low Data mode automatically cache map areas for offline use? | data use, map, offline behavior, location privacy | Answered: no broad background map downloads; keep the visible map lightweight and let the user retry when needed | Accepted recommendation. |
| APP-Q205 | Should MaurMaket restrict app access, accounts, browsing, or listing publication based on launch-region rollout? | strategy, launch, geographic access, equity | Answered: no geographic gate; MaurMaket should be available throughout Haiti, with access and listing publication not withheld by region | Accepted with explicit clarification: first focus area means local market-building/operations priority only, not a Haitian access boundary. Transaction/fulfillment eligibility follows actual mutually supported methods and seller/buyer radius rules. |
| APP-Q206 | Should a user be able to set a broad, persistent browse area independent of GPS and the map's last-viewed area? | launch, discovery, location privacy | Answered: offer an editable city/commune browse preference, separate from precise device location, private delivery address, and the map's temporary “Search this area” state | Accepted recommendation; it changes relevance, never access. |
| APP-Q207 | Should sellers across Haiti be able to create and publish listings, even outside an initial local market-building focus? | launch, seller onboarding, marketplace liquidity, equity | Answered: yes; do not block listing creation/publication by region | Accepted with clarification: explain actual transaction/fulfillment options based on the chosen seller radius and mutually supported methods; local rollout focus is not a geofence. |
| APP-Q208 | Should buyers be able to express interest in more local MaurMaket support/activity in their area? | launch, geographic coverage, feedback | Answered: yes, through a voluntary area-interest control that does not require precise GPS | This requests local market-building, not permission to access the app or buy/sell. |
| APP-Q209 | What location detail should a local-activity interest request collect? | launch, privacy, location data | Answered: commune or broad area only; explain the purpose, make it optional, and keep it separate from order location | Accepted recommendation. |
| APP-Q210 | Should area requests create a public map of where interested users live? | launch, privacy, geographic data | Answered: no; use private aggregated counts for planning and never expose individual interest locations | Accepted recommendation. |
| APP-Q211 | What signals should determine which regions MaurMaket prioritizes for local seller support and market-building, while the app remains available across Haiti? | launch, marketplace liquidity, operational readiness | Answered: require adequate local supply and demonstrated completed transactions/fulfillment reliability, not just signups or listing count | Accepted recommendation; gates investment/readiness only, never app access. |
| APP-Q212 | Should MaurMaket expand when one existing area is still sparse? | launch, marketplace liquidity, strategy | Covered (not counted): APP-Q005 already settled density-first launch focus over broad coverage with thin inventory | Same underlying expansion tradeoff; replace with APP-Q215. |
| APP-Q213 | How should users hear when MaurMaket increases local support or market-building activity in an area they requested? | launch, notifications, consent | Answered: send one useful update only with the user's opt-in; do not turn area interest into ongoing promotional pushes | This does not announce a change in app access; Haiti-wide access remains. |
| APP-Q214 | If MaurMaket does not increase local activity in an area soon, what should happen to the user's interest request? | launch, privacy, retention | Answered: retain only for a disclosed, limited planning period, then ask whether they still want updates or remove it; provide immediate opt-out | Accepted recommendation; this planning request never affects access. |
| APP-Q215 | Should area-interest requests let users optionally name the types of listings they hope to find? | launch, marketplace liquidity, privacy, discovery | Answered: yes, broad optional category choices can guide supply planning; do not collect detailed personal wishlists or imply requested items will be available | Accepted recommendation. |
| APP-Q216 | Should marketplace search normalize accents and common spelling variations across Haitian Creole, French, and English? | localization, search, discovery | Answered: match common variations when useful while preserving the user's entered and displayed spelling | Accepted recommendation. |
| APP-Q217 | Should listing categories and product attributes use localized labels while retaining one shared category meaning across languages? | localization, listings, catalog | Answered: yes; translate labels while maintaining shared underlying category and attribute values | Accepted recommendation. |
| APP-Q218 | How should the app show a listing's language when the description is written in a language different from the viewer's interface? | localization, listings, transparency | Answered: keep the original visible, label its language, and offer translation on request | Accepted recommendation. |
| APP-Q219 | How should prices display the Haitian gourde across listing cards, product details, and checkout? | localization, money, checkout | Answered: use a consistent HTG/G format with clear thousands grouping | Accepted recommendation. |
| APP-Q220 | Should MaurMaket accept fractional-gourde amounts, or keep prices and fees to whole gourdes? | localization, money, pricing | Answered: use whole gourdes in v1 unless a payment method requires finer precision; never silently round a payable total | Accepted recommendation. |
| APP-Q221 | Which date format should appear in orders, receipts, and activity history? | localization, dates, records | Answered: localize date order and month names to app language while keeping dates unambiguous | Accepted recommendation. |
| APP-Q222 | Should time display follow the device's 12-hour/24-hour preference or use one MaurMaket-wide format? | localization, time, orders | Answered: follow device preference and show clear date/time context for meetup deadlines | Accepted recommendation. |
| APP-Q223 | How should MaurMaket display Haitian phone numbers in profiles, order summaries, and support details? | localization, contact, privacy | Answered: format with Haiti's +509 country code and readable grouping while limiting exposure of private numbers | Accepted recommendation. |
| APP-Q224 | When translating a category, measurement, or status term, should the interface favor familiar Haitian marketplace wording or literal translation? | localization, content design, accessibility | Answered: use plain, locally familiar wording across Kreyòl, French, and English while preserving consistent meaning | Accepted recommendation. |
| APP-Q225 | If a user changes app language, should existing order and notification history immediately render in the new language? | localization, history, notifications | Answered: render system-generated content in the selected language; preserve user-authored text in its original language and offer translation | Accepted recommendation. |
| APP-Q226 | Should the Orders workspace offer a cross-role “Needs your action” view across Buying and Selling while retaining the two role tabs? | orders, UX, task management | Answered: add a cross-role shortcut/filter without replacing Buying/Selling; clearly identify the user's role and next step | Accepted recommendation. |
| APP-Q227 | What should Buying/Selling tab badges count: all active orders or only orders needing the user's action? | orders, badges, task clarity | Answered: count orders requiring the user's response; show total active orders separately | Accepted recommendation. |
| APP-Q228 | Should Orders remember each role's selected status filter independently when users switch between Buying and Selling? | orders, filters, continuity | Answered: yes, preserve each tab's filter during the session with an obvious reset | Accepted recommendation. |
| APP-Q229 | Should switching between Buying and Selling preserve the user's scroll position in each list? | orders, navigation, continuity | Answered: yes, preserve both positions | Accepted recommendation. |
| APP-Q230 | When an active order is waiting for the other participant, how should that state appear in the list? | orders, transparency, task status | Answered: identify who acts next using calm, non-blaming wording | Accepted recommendation. |
| APP-Q231 | Should the Orders list update live when an order changes, or wait until the user refreshes/reopens it? | orders, realtime, reliability | Answered: update in place when possible with a subtle cue and manual refresh fallback | Accepted recommendation. |
| APP-Q232 | If the device is offline, how should cached order status be presented in the workspace? | orders, reliability, offline behavior | Answered: label cached status and last-updated time; prevent actions requiring current server state | Accepted recommendation. |
| APP-Q233 | Should common order actions appear directly on each list card or only after opening order detail? | orders, UX, action safety | Answered: allow only clear, low-risk actions on cards; keep consequential or multi-step actions in order detail | Accepted recommendation. |
| APP-Q234 | How should a new order update be made noticeable in a busy list without disrupting the user's current task? | orders, interaction design, accessibility | Answered: use a subtle highlight or short fade, never reorder unexpectedly, and respect reduced-motion settings | Accepted recommendation. |
| APP-Q235 | Should long order timelines open compact by default or show the full event history immediately? | orders, timeline, information density | Answered: show recent events first with an option to expand the full shared history | Accepted recommendation. |
| APP-Q236 | Where should buyers discover an active seller promo code before checkout? | promotions, discovery, seller storefront | Answered: show a discreet offer cue on eligible listings and details on the seller storefront; no unrelated clutter or reliance on pushes | Accepted recommendation. |
| APP-Q237 | In a multi-seller cart, which merchandise should a seller-created promo code discount? | promotions, cart, multi-seller checkout | Answered: only that seller's eligible items; calculate minimum spend against that seller's subtotal | Accepted recommendation. |
| APP-Q238 | Should checkout accept one promo code total, or one valid promo code for each seller group? | promotions, checkout, multi-seller orders | Answered: allow one valid code per seller, itemize each discount, and prevent ambiguous stacking | Accepted recommendation. |
| APP-Q239 | Should promo discounts reduce item prices only, or may they also reduce delivery fees? | promotions, pricing, delivery | Answered: apply to eligible merchandise only in v1; delivery discounts are a distinct offer | Accepted recommendation. |
| APP-Q240 | Should a promo code stack with an accepted negotiated offer price on the same item? | promotions, offers, pricing fairness | Answered: don't stack two seller-funded price reductions by default; clearly show available final pricing | Accepted recommendation. |
| APP-Q241 | What should promo setup and buyer-facing details disclose about minimum spend, expiry, and use limits? | promotions, transparency, seller tools | Answered: disclose each active condition when creating/sharing the code and before applying it | Accepted recommendation. |
| APP-Q242 | If a promo becomes invalid between validation and order creation, how should checkout recover? | promotions, checkout, reliability | Answered: explain why, remove only the invalid discount, show the revised total, and require buyer confirmation | Accepted recommendation. |
| APP-Q243 | Should buyers be able to see which seller-issued promo reduced each seller's subtotal and order total? | promotions, receipts, multi-seller transparency | Answered: yes; itemize each seller's discount in checkout, order detail, and receipt | Accepted recommendation. |
| APP-Q244 | What promo-code redemption summary should a seller see after a campaign? | promotions, seller analytics, privacy | Answered: show aggregate uses, eligible sales, and discount total without buyer identities or histories | Accepted recommendation. |
| APP-Q245 | Should promo codes support a future start date, or be active immediately when created? | promotions, seller workflow, scheduling | Answered: support start and end times shown in local time, with an immediate-start option | Accepted recommendation. |
| APP-Q246 | How should Seller Tools distinguish MonCash withdrawable funds, pending/held MonCash order funds, and seller-confirmed NatCash direct sales? | seller finance, wallet, payment clarity | Answered: show separate labeled amounts; only eligible MonCash balance is withdrawable, while NatCash remains a direct-sale total, not platform-held funds | Accepted; linked display-level follow-up to settled NatCash accounting rules. |
| APP-Q247 | What should a seller see when opening an individual MonCash earnings entry? | seller finance, transparency, fees | Answered: itemize sale amount, MaurMaket commission, applicable gateway/payout charges, and seller net using the already-set fee rules | Accepted; does not alter fee formulas. |
| APP-Q248 | If a completed transaction later has a refund, adjustment, or dispute hold, should the earnings history rewrite the original entry or add a linked adjustment? | seller finance, audit trail, disputes | Answered: preserve the original entry and add a dated, linked adjustment/hold with a plain-language reason and current state | Accepted recommendation. |
| APP-Q249 | Should the seller finance home offer a period view of sales and fees, or focus only on current balance and lifetime totals? | seller finance, analytics presentation, information hierarchy | Answered: show current balance plus a simple recent-period summary; custom comparisons belong in detail and existing tier access to advanced analytics remains | Accepted recommendation. |
| APP-Q250 | How should sellers navigate their financial activity history? | seller finance, records, findability | Answered: newest first with simple filters for sales, payouts, refunds/adjustments, and direct NatCash sales | Accepted recommendation. |
| APP-Q251 | What should the final payout preview show before a seller confirms a MonCash withdrawal? | seller finance, payout, transparency | Answered: show requested amount, applicable already-agreed fees, expected net/charge, destination, and known timing caveats | Accepted; no fee-policy changes. |
| APP-Q252 | After leaving MaurMaket for an external MonCash step, what should payout status show until the result is confirmed? | seller finance, external payment, reliability | Answered: show “awaiting confirmation”; opening/returning from the external page alone is not proof of success | Accepted recommendation. |
| APP-Q253 | How should sellers view and change the payout destination associated with their account? | seller finance, settings, security | Answered: show a masked destination in payout preview; manage changes in Payment settings with fresh authentication and verify the new destination | Accepted; aligns with prior step-up-authentication decision. |
| APP-Q254 | What should the seller see after a payout fails or remains unconfirmed? | seller finance, support, reliability | Answered: show a stable reference, clear next step and Support route; allow retry only after confirming the prior attempt did not complete | Accepted recommendation. |
| APP-Q255 | Should sellers be able to export a statement of MaurMaket ecosystem activity? | seller finance, records, data portability | Answered: provide a downloadable date-range statement with clearly labeled MonCash settlement and seller-confirmed NatCash sections | Accepted recommendation. |
| APP-Q256 | Which marketplace mutations beyond messages and payments should use idempotency keys to prevent duplicate effects after retries? | reliability, data integrity, APIs | Answered: protect consequential creates/commits such as orders, reservations, reviews, and reports; duplicate requests return the original result | Accepted recommendation. |
| APP-Q257 | When two buyers attempt to reserve the final unit at nearly the same time, what should each experience? | reliability, inventory, checkout | Answered: server-atomic reservation; confirm one hold and clearly tell the other buyer the item is unavailable | Accepted recommendation. |
| APP-Q258 | How should the app respond when cached account or listing data is stale while a user attempts a consequential action? | reliability, cache, transaction safety | Answered: revalidate critical state, explain changes, and request renewed confirmation if price, availability, or terms changed | Accepted recommendation; 258th unique answer/checkpoint. |
| APP-Q259 | What should users see when one service (such as maps, messaging media, or payments) is degraded but the rest of the app still works? | reliability, degraded service, UX | Answered: explain the affected service and safe alternatives while keeping unrelated app areas usable | Accepted recommendation. |
| APP-Q260 | Should MaurMaket provide a public service-status page during outages? | reliability, incident communication, support | Answered: provide a lightweight status page for broad outages, linked from relevant in-app errors, without security-sensitive details | Accepted recommendation. |
| APP-Q261 | What backup and restore assurance should be required for critical marketplace records? | reliability, disaster recovery, data integrity | Answered: encrypted automated backups, scheduled restore drills, and documented recovery targets for orders, payments, and identity state | Accepted recommendation. |
| APP-Q262 | Which operational events should trigger a human incident alert rather than wait for routine monitoring? | reliability, observability, operations | Answered: alert on sustained failures or data-integrity/security risks affecting payments, orders, verification, or broad access; tune thresholds to limit noise | Accepted recommendation. |
| APP-Q263 | How should staff access to sensitive production data be recorded and reviewed? | security, operations, auditability | Answered: least-privilege access, reason-coded audit logs, and periodic review; no casual browsing of private user data | Accepted recommendation. |
| APP-Q264 | How should risky features be rolled out and rolled back if production behavior is unsafe? | reliability, release management, safety | Answered: stage releases behind server-controlled flags, monitor them, and support fast rollback without losing transaction records | Accepted recommendation. |
| APP-Q265 | What should happen when an older app version cannot safely perform a changed transaction flow? | reliability, mobile release, compatibility | Answered: require update only for affected unsafe actions; preserve read access and Support where possible | Accepted recommendation. |
| APP-Q266 | After a verification decision, should the raw ID/selfie images remain available for a limited challenge window or be deleted as soon as review no longer needs them? | KYC, privacy, data retention | Answered: keep only as long as an active review/appeal needs them, then delete | Accepted recommendation; avoid indefinite raw-evidence retention. |
| APP-Q267 | After raw verification images are deleted, which extracted OCR or matching results should remain on the account? | KYC, data minimization, records | Answered: keep only minimum decision-relevant fields/status and reason codes needed to explain outcome or prevent abuse, not full OCR text | Accepted recommendation. |
| APP-Q268 | When should verification evidence and derived records be deleted after an account is closed? | KYC, account lifecycle, privacy | Answered: use a stated, purpose-limited retention period for unresolved cases/obligations, then delete or irreversibly de-identify | Accepted recommendation; 268th unique answer/checkpoint. |
| APP-Q269 | What should users be able to see about the verification information MaurMaket has stored about them? | KYC, transparency, privacy | Answered: show submitted-data categories, status, and retention/deletion state without internal fraud signals or reviewer-only notes | Accepted recommendation. |
| APP-Q270 | How should a user correct an OCR-extracted identity field that is wrong while keeping their submitted document unchanged? | KYC, data accuracy, correction | Answered: provide explicit correction/review without silent overwrite; retain original evidence only as long as needed | Accepted; generic identity-field corrections, distinct from the settled DOB/age conflict flow. |
| APP-Q271 | Should repeated verification attempts have a limit or cooldown, and what should happen when it is reached? | KYC, abuse prevention, retry | Answered: use proportionate rate limits, explain the wait, and provide a human Support path for genuine capture/technical barriers | Accepted recommendation. |
| APP-Q272 | If a verification attempt is abandoned before submission, how should its locally captured images and draft data be handled? | KYC, client privacy, draft lifecycle | Answered: use protected temporary storage, clear discard controls, and cleanup after a short disclosed period | Accepted recommendation. |
| APP-Q273 | If a verified user reports that their identity document was lost or compromised, what should MaurMaket do with their verification status? | KYC, account security, identity theft | Answered: start a private review and apply proportionate limits to high-risk actions; do not publicly label or automatically blame the user | Accepted recommendation. |
| APP-Q274 | What should trigger a fresh identity check after a seller has already passed verification? | KYC, re-verification, seller lifecycle | Answered: re-check only after a meaningful risk signal or material identity change, not on an arbitrary recurring schedule | Accepted recommendation. |
| APP-Q275 | If a user cannot complete standard identity capture because their document is damaged or a required field is unreadable, what review path should exist? | KYC, accessibility, support | Answered: offer private assisted review with clear alternate-evidence guidance while preserving core identity assurance | Accepted recommendation. |
| APP-Q276 | Should Delivery settings support multiple saved delivery destinations or only one address? | delivery, address book, settings | Answered: provide a private address book with multiple destinations and no arbitrary low cap | Accepted recommendation. |
| APP-Q277 | How should users distinguish saved delivery destinations in checkout? | delivery, address book, UX | Answered: built-in labels such as Home/Work plus user-defined names; labels remain private | Accepted recommendation. |
| APP-Q278 | Should checkout remember an optional default delivery destination or require selection each time? | delivery, checkout, privacy | Answered: allow an optional default, but visibly reconfirm the selected destination for every order | Accepted recommendation. |
| APP-Q279 | What information should a saved Haitian delivery destination contain when formal street addressing is limited? | delivery, location, Haiti localization | Answered: broad area/commune, private map pin, and landmark/directions fields; buyer reviews them before ordering | Accepted recommendation. |
| APP-Q280 | When should MaurMaket request device-location permission while adding a delivery destination? | delivery, location privacy, permissions | Answered: ask only after the user taps “Use my location”; always allow manual entry and pin placement | Accepted recommendation. |
| APP-Q281 | Should a one-time delivery destination be automatically saved into the user's address book? | delivery, privacy, address book | Answered: keep it order-only unless the user explicitly chooses “Save this address” | Accepted recommendation. |
| APP-Q282 | Can a buyer arrange delivery to someone else, such as a family member receiving the item? | delivery, recipient, checkout | Answered: allow optional recipient name/contact, disclosed only to the relevant seller and private to that order | Accepted recommendation. |
| APP-Q283 | Should a buyer's phone number be shared with a delivery seller by default? | delivery, contact privacy, messaging | Answered: use in-app contact by default; let the buyer explicitly share their number for a specific delivery when useful | Accepted recommendation. |
| APP-Q284 | In a multi-seller checkout, which sellers should see a buyer's delivery address and recipient details? | delivery, multi-seller, privacy | Answered: only sellers fulfilling their own sub-order; no cross-seller access | Accepted recommendation; 278th unique answer/checkpoint. |
| APP-Q285 | Should saved delivery destinations sync across a signed-in user's devices or remain on the device where they were entered? | delivery, address book, sync, privacy | Answered: sync privately to the account; guest/temporary destinations stay device-local unless explicitly saved | Accepted recommendation. |
| APP-Q286 | What should count as a listing detail view in seller analytics? | seller tools, analytics, metric definitions | Answered: deduplicate repeat opens by account/device within a short window and filter obvious automated traffic; never expose viewer identities | Accepted recommendation. |
| APP-Q287 | Should the seller's saves metric show current buyers who saved the listing, cumulative save events, or both? | seller tools, analytics, saves | Answered: show current saved count plus optional period trend; never identify savers | Accepted recommendation. |
| APP-Q288 | Should seller analytics distinguish browse/search impressions from listing detail views? | seller tools, analytics, funnel | Answered: show separately named reach and open metrics | Accepted recommendation; 288th unique answer/checkpoint. |
| APP-Q289 | How should Seller Tools identify a listing's “top products”? | seller tools, analytics, ranking | Answered: allow ranking by completed sales, views, or saves rather than one opaque blended score | Accepted recommendation. |
| APP-Q290 | What time comparison should listing-performance trends use? | seller tools, analytics, trends | Answered: simple recent periods compared with the preceding same-length period; no seller-to-seller comparisons | Accepted recommendation. |
| APP-Q291 | Should Seller Tools show a view-to-sale conversion rate? | seller tools, analytics, conversion | Answered: provide an optional, clearly defined funnel rate with a minimum sample threshold and no misleading precision | Accepted recommendation. |
| APP-Q292 | Should sellers see where listing interest comes from geographically? | seller tools, analytics, location privacy | Answered: no precise or individual buyer location; consider only broad aggregated areas above a meaningful privacy threshold | Accepted recommendation. |
| APP-Q293 | Should sellers compare their performance with other sellers in their category? | seller tools, analytics, benchmarks, privacy | Answered: no direct competitor rankings in v1; consider only sufficiently large anonymous cohort benchmarks later | Accepted recommendation. |
| APP-Q294 | Should Seller Tools turn performance data into suggestions for improving a listing? | seller tools, analytics, seller guidance | Answered: offer optional, plainly explained suggestions; never change a listing automatically | Accepted recommendation. |
| APP-Q295 | Should a sudden change in listing interest generate a push alert or stay in Seller Tools? | seller tools, analytics, notifications | Answered: keep insights in Seller Tools by default; optional digest, no noisy instant alerts | Accepted recommendation. |
| APP-Q296 | Should a Business storefront display regular opening hours? | business storefront, service information, hours | Answered: optional seller-maintained weekly hours in Haiti local time; omit if not provided | Accepted recommendation. |
| APP-Q297 | Should displayed business hours change whether buyers can message or place orders? | business storefront, availability, orders | Answered: hours are guidance only; actual listing/order state and explicit seller pause control availability | Accepted recommendation. |
| APP-Q298 | Should Business sellers be able to schedule a temporary shop-closure notice in advance? | business storefront, availability, announcements | Answered: optional time-bounded notice with clear end date; never silently cancel or alter active orders | Accepted recommendation; 298th unique answer/checkpoint. |
| APP-Q299 | Should a Business storefront include a compact FAQ for common buyer questions? | business storefront, buyer education | Answered: short optional FAQ in About; separate from order chat and canonical accepted terms | Accepted recommendation. |
| APP-Q300 | May sellers publish custom return, inspection, or delivery policies on their storefront? | business storefront, policy, buyer protection | Answered: concise informational policies only; MaurMaket rules and mutually accepted order terms remain controlling | Accepted recommendation. |
| APP-Q301 | Should a Business storefront expose off-platform contact details or external website/social links? | business storefront, contact, safety | Answered: in-app Message stays primary; allow only a limited clearly labeled external website link if safety-reviewed; never imply off-platform payments are protected | Accepted recommendation. |
| APP-Q302 | Should Business sellers be able to curate named product collections within the existing Listings section? | business storefront, catalog organization | Answered: optional simple collections inside Listings; no new profile section or tabs | Accepted recommendation. |
| APP-Q303 | Should curated product collections be available only to Business sellers or to every seller? | business storefront, tiers, catalog organization | Answered: basic category filters for all; seller-created branded collections are Business-only | Accepted recommendation. |
| APP-Q304 | Should a Business storefront support a temporary announcement card for changes such as delayed service or a new collection? | business storefront, announcements, seller communication | Answered: one optional expiring notice; no promotional push and no alteration of active order commitments | Accepted recommendation. |
| APP-Q305 | Should the Business storefront let sellers choose a custom color theme beyond their logo and existing profile media? | business storefront, branding, accessibility | Answered: retain shared accessible MaurMaket design system; branding uses logo/photos, custom themes deferred | Accepted recommendation. |
| APP-Q306 | What should happen when a seller or buyer shares a listing link with someone who does not have MaurMaket installed? | sharing, listing discovery, acquisition | Covered: privacy-safe public preview and app/web entry path already settled in APP-Q066; duplicate candidate, excluded from unique count. |
| APP-Q307 | If the shared listing becomes unavailable before the recipient opens it, what should the link show? | sharing, inventory, stale links | Covered: explain unavailable/removed state and offer alternatives already settled in APP-Q065; duplicate candidate, excluded from unique count. |
| APP-Q308 | Should a shared listing link preserve the sender's language or use the recipient's language? | sharing, localization | Answered: render in recipient's selected/device language when supported; keep original listing text accessible and language labeled | Accepted recommendation. |
| APP-Q309 | If a listing is paused or unpublished, should an old share link still reveal its details? | sharing, listing visibility, seller controls | Answered: honor current visibility, explain unavailability, and do not expose details the seller withdrew | Linked follow-up to APP-Q065: this adds the changed privacy scope for seller-withdrawn listings. |
| APP-Q310 | Should MaurMaket track which user shared a listing with a recipient? | sharing, privacy, analytics | Answered: aggregate share counts only; do not identify recipients or access address books | Accepted recommendation. |
| APP-Q311 | If the app is already installed, should a MaurMaket listing link open the app or stay in the browser? | sharing, deep links, navigation | Answered: open the matching listing in the app when possible, with browser fallback if routing fails | Accepted recommendation. |
| APP-Q312 | If a user installs the app after opening a listing link, should the app return them to that listing? | sharing, deep links, onboarding | Answered: preserve and route to the original destination after install/sign-in if still valid | Accepted recommendation; linked deep-link detail to APP-Q066. |
| APP-Q313 | Should users be able to share listings directly to external apps from MaurMaket? | sharing, external apps | Answered: use the native share sheet with a stable MaurMaket link and concise preview text | Accepted recommendation; defines the share invocation UX. |
| APP-Q314 | Should the share preview include price and item photos? | sharing, listing content, privacy | Answered: include current public price and primary image, following current listing visibility and availability | Accepted recommendation; use no stale private data. |
| APP-Q315 | Should a seller be able to disable sharing for one listing? | sharing, seller controls, discovery | Answered: no separate switch in v1; published public listings are shareable, and sellers may pause/unpublish them | Accepted recommendation. |
| APP-Q316 | Should MaurMaket run a refer-a-friend program that rewards users for bringing in new buyers or sellers? | growth, referrals, incentives, marketplace integrity | Answered: referrals may begin as trackable invitations; no cash incentives until fraud controls and sustainable economics are proven | Accepted recommendation; 316th unique answer/checkpoint. |
| APP-Q317 | Should referral eligibility include dormant former users, or only people who have never had an account? | growth, referrals, eligibility | Answered: v1 applies only to people with no prior MaurMaket account | Accepted recommendation. |
| APP-Q318 | What should count as a successful referral: install, signup, or a completed marketplace action? | growth, referrals, marketplace quality | Answered: a completed qualifying marketplace action; install/signup alone is insufficient | Accepted recommendation. |
| APP-Q319 | Should a future referral reward go to the inviter, the invited person, or both? | growth, referrals, incentives | Answered: reward both sides only if economics allow; otherwise favor a clear new-user benefit without pressure | Accepted recommendation. |
| APP-Q320 | If referrals are introduced, what form should a reward take? | growth, referrals, rewards, payments | Answered: non-cash MaurMaket credit/benefit with clear value and limits; no direct wallet cash reward in v1 | Accepted recommendation. |
| APP-Q321 | What should invitees see before accepting a referral invitation? | growth, referrals, transparency | Answered: disclose eligibility, qualifying action, reward, limits/expiry, and that joining is optional | Accepted recommendation. |
| APP-Q322 | How should MaurMaket attribute a referred signup? | growth, referrals, privacy, attribution | Answered: optional invite link/code applied by invitee; no contact import or silent tracking of unrelated activity | Accepted recommendation. |
| APP-Q323 | What safeguards should stop users from referring themselves or creating duplicate accounts for rewards? | growth, referrals, abuse prevention | Answered: combine account, identity, and transaction signals with human review for edge cases; do not rely on device fingerprinting alone | Accepted recommendation. |
| APP-Q324 | Should MaurMaket cap how many referral rewards one account can earn in a period? | growth, referrals, financial controls | Answered: use a disclosed conservative cap and monitor fraud/cost before increasing it | Accepted recommendation; 316th unique answer/checkpoint. |
| APP-Q325 | What should happen to a referral reward if the qualifying transaction is canceled, refunded, or later found fraudulent? | growth, referrals, refunds, abuse prevention | Answered: award only after completion and the normal risk/return window; explain reversal rules in advance | Accepted recommendation. |
| APP-Q326 | Should referral invitations let the inviter choose whether they are inviting a buyer or a seller? | growth, referrals, marketplace roles | Answered: let sender choose a simple buyer/seller invite context; recipient may still use the app in either role | Accepted recommendation. |
| APP-Q327 | What first completed action should qualify a referred buyer versus a referred seller? | growth, referrals, buyer/seller activation | Answered: buyer's first completed order or seller's first completed sale, with separate eligibility checks | Accepted recommendation. |
| APP-Q328 | Should a single referred person be allowed to qualify both as a buyer and a seller? | growth, referrals, multi-role accounts | Answered: one account, one referral attribution, at most one reward path per person | Accepted recommendation. |
| APP-Q329 | How long should an invite link or code remain eligible after it is created? | growth, referrals, attribution, retention | Answered: use a clear, reasonably short disclosed validity window; exact duration set before launch | Accepted recommendation. |
| APP-Q330 | If a new user receives invitations from multiple people, how should MaurMaket choose the referrer? | growth, referrals, attribution fairness | Answered: invitee explicitly chooses one valid code before signup; do not silently favor the last click | Accepted recommendation. |
| APP-Q331 | Can an invitee change their chosen referrer after creating an account? | growth, referrals, attribution integrity | Answered: allow correction only before the qualifying action through confirmation or Support; no silent reassignment | Accepted recommendation. |
| APP-Q332 | What should inviters see about the progress of their invitations? | growth, referrals, privacy | Answered: show coarse states (opened/eligible/completed) without exposing private order/payment/identity details | Accepted recommendation. |
| APP-Q333 | Should referral invitations appear as a public profile badge or count? | growth, referrals, profile privacy | Answered: keep invite activity private by default; no public popularity rankings | Accepted recommendation. |
| APP-Q334 | Should an invitee receive a reminder if they open an invitation but do not join? | growth, referrals, notification fatigue | Answered: no unsolicited repeated reminders; inviter may share again manually, respecting notification preferences | Accepted recommendation; 326th unique answer/checkpoint. |
| APP-Q335 | What should happen if MaurMaket pauses or ends its referral program while invitations are still active? | growth, referrals, trust, program lifecycle | Answered: stop creating new eligibility, honor earned rewards, clearly explain outstanding-invitation validity | Accepted recommendation. |
| APP-Q336 | When should a buyer be able to cancel an order before the seller begins fulfillment? | orders, cancellation, buyer control | Covered: existing checkout rule lets the buyer cancel at any time before completion; this candidate restated that rule and does not count. |
| APP-Q337 | After a seller begins preparing or delivering an order, should the buyer still be able to cancel unilaterally? | orders, cancellation, fulfillment | Answered: use a cancellation request that requires seller response or Support review after fulfillment starts; never silently alter order/payment state | Linked follow-up to existing “buyer may cancel at any time” rule: this clarifies the post-fulfillment phase. |
| APP-Q338 | Should a seller be able to cancel an accepted order when they cannot fulfill it? | orders, cancellation, seller control | Answered: allow with required reason and immediate buyer notice; preserve records and do not assign automatic blame | Accepted recommendation. |
| APP-Q339 | Should cancellation itself require the other party's consent, or can one party end the order? | orders, cancellation, consent | Answered: distinguish unilateral pre-fulfillment cancellation from later cancellation request; order/payment effects stay explicit and auditable | Accepted recommendation. |
| APP-Q340 | In a multi-seller checkout, should canceling one seller's sub-order cancel the other sellers' sub-orders? | orders, cancellation, multi-seller checkout | Answered: cancel only affected seller sub-order unless buyer explicitly cancels the whole checkout | Accepted recommendation. |
| APP-Q341 | What should happen if a cancellation request receives no response before its deadline? | orders, cancellation, deadlines, support | Answered: keep order/payment unchanged, remind once, then use a clear unresolved state or Support path; no automatic fault/refund | Accepted recommendation. |
| APP-Q342 | What reason should users provide when canceling or requesting cancellation? | orders, cancellation, records, fairness | Answered: simple reason choices plus optional short explanation; neutral wording and no forced sensitive details | Accepted recommendation. |
| APP-Q343 | How should a buyer see the refund status after an order cancellation is accepted? | orders, cancellation, refunds, transparency | Answered: show cancellation and refund progress separately; show provider-confirmed state only and avoid unsupported timing promises | Accepted recommendation. |
| APP-Q344 | Should a user be able to withdraw a pending cancellation request before the other party responds? | orders, cancellation, consent, order state | Answered: allow withdrawal only while pending and before fulfillment/payment transition; record it in the shared timeline | Accepted recommendation; 335th unique answer/checkpoint. |
| APP-Q345 | How should repeated cancellations be handled so good-faith mistakes do not unfairly punish users? | orders, cancellation, trust, abuse prevention | Answered: privately review patterns, distinguish user cancellations from counterpart/provider failures, and require review before restrictions | Accepted recommendation. |
| APP-Q346 | Which Android/iOS versions should MaurMaket support at launch? | compatibility, launch, access | Answered: Android is the launch priority; this does not rule out later iOS support. Keep the supported Android range broad enough for reliable operation and real-device QA; never restrict access by Haitian region. | Accepted with user clarification. |
| APP-Q347 | How should MaurMaket behave on older or lower-powered phones? | compatibility, performance, inclusion | Answered: prioritize stable core browsing, messaging, checkout, and verification; reduce optional effects/work when device capability requires it. | Accepted recommendation. |
| APP-Q348 | Should MaurMaket set a strict app-download size budget? | compatibility, mobile data, install access | Answered: keep the initial install lean, lazy-load optional assets, and disclose current download size before install. | Accepted recommendation. |
| APP-Q349 | Should app updates download automatically on mobile data? | compatibility, updates, mobile data | Answered: defer large updates to Wi-Fi by default; make security-critical updates clear and user-controllable. | Accepted recommendation; the download/update website and in-app update alert remain back pocket. |
| APP-Q350 | How should image quality adapt between slower devices and constrained connections? | performance, media, mobile data | Answered: load an appropriately sized preview first, then full image on demand; never degrade or hide material condition evidence. | Accepted as a device-performance extension to APP-Q195's Low Data preview decision. |
| APP-Q351 | What should happen when the phone is nearly out of storage? | compatibility, storage, reliability | Answered: explain what can safely be cleared (re-downloadable cache); never silently delete drafts or unsent messages. | Accepted recommendation. |
| APP-Q352 | How should MaurMaket limit battery use from location and background work? | performance, battery, location privacy | Covered: no continuous background location tracking; request location only for user-started features and stop promptly. | Already settled in APP-Q040, APP-Q157, APP-Q204, APP-Q280 and Map & Checkout Discovery; not counted. |
| APP-Q353 | Should visual effects be reduced automatically on low-performance devices? | accessibility, motion, performance | Answered: use lighter transitions where needed and always honor Reduce Motion. | Accepted recommendation. |
| APP-Q354 | What should happen if a phone cannot provide a reliable camera for seller verification? | compatibility, KYC, accessibility | Answered: offer secure alternate capture/upload or assisted review under the same identity checks. | Accepted as a device-capability extension to existing KYC accessibility and assisted-review decisions. |
| APP-Q355 | Should MaurMaket provide layouts adapted for tablets and foldable phones, or simply stretch the phone layout? | compatibility, responsive design, accessibility | Answered: use responsive wider layouts while preserving touch targets, hierarchy, and readable text. | Accepted recommendation; 345th unique answer/checkpoint. |
| APP-Q356 | How should users learn that MaurMaket's Terms or Privacy Notice have materially changed? | policy UX, privacy, communication | Answered: clear in-app notice with a concise explanation and link to the full text. | Accepted recommendation. |
| APP-Q357 | Should material policy changes require explicit re-acceptance before the user continues? | policy UX, consent, account access | Answered: request deliberate confirmation when renewed agreement is needed; do not interrupt for routine editorial changes. | Accepted recommendation. |
| APP-Q358 | Should policy acceptance be stored with the exact version and time? | policy UX, auditability, privacy | Answered: keep a minimal, access-restricted record of accepted version and time. | Accepted recommendation. |
| APP-Q359 | Should users see a plain-language change summary alongside the full revised policy? | policy UX, transparency, accessibility | Answered: provide an accessible “what changed” summary and one-tap access to the full text. | Accepted recommendation. |
| APP-Q360 | What should happen if a user declines a material policy update? | policy UX, consent, account lifecycle | Answered: explain which access requires acceptance; preserve account help and existing obligations; provide account closure and data export paths. | Accepted recommendation; implementation must distinguish necessary access limits from obligations already in progress. |
| APP-Q361 | Should policy documents be available in Haitian Creole, French, and English? | policy UX, localization, accessibility | Answered: make them available in all supported app languages, identify the selected text, and disclose pending translations. | Accepted recommendation. |
| APP-Q362 | Where should users find current policies and their acceptance history? | policy UX, settings, transparency | Answered: provide a Legal & privacy area in Settings with current documents, update dates, and accepted versions. | Accepted recommendation. |
| APP-Q363 | Should users be able to open policy notices again after dismissing them? | policy UX, notices, discoverability | Answered: retain notices and summaries in Legal & privacy after dismissal. | Accepted recommendation. |
| APP-Q364 | Should existing orders retain a reference to the policy version in effect when each order began? | policy UX, orders, records | Answered: preserve a policy-version reference for historical context; never silently rewrite accepted order terms. | Accepted recommendation; 354th unique answer/checkpoint. |
| APP-Q365 | How should policy acceptance work when a user is offline or the app cannot confirm the latest version? | policy UX, offline, consent integrity | Answered: record acceptance only after server confirmation; explain the connection requirement and preserve the user's draft/navigation state. | Accepted recommendation. |
| APP-Q366 | How should users review and revoke active sessions on their account? | account security, settings, sessions | Covered: user can review recent sessions, revoke individually, or sign out other devices without sensitive fingerprints. | Already settled in APP-Q084; not counted. |
| APP-Q367 | How should MaurMaket handle a session revoked while its device is offline? | account security, offline, sessions | Answered: record revocation server-side immediately and reject the session at its next authenticated request, while keeping local drafts safe. | Accepted recommendation. |
| APP-Q368 | Should users get notified when a new device signs in? | account security, notifications, sign-in | Answered: send a prompt security alert with time/device context and a route to secure the account; avoid exposing secrets in previews. | Accepted recommendation. |
| APP-Q369 | What should happen to active sessions after a password reset or primary credential change? | account security, authentication, sessions | Answered: invalidate other sessions after a security-driven reset; for a normal credential change, let the user choose to sign out other devices and explain the effect. | Accepted recommendation. |
| APP-Q370 | How should account recovery work if the user has lost access to every verified sign-in channel? | account security, recovery, support | Covered: recovery uses a verified channel and risk checks; support cannot bypass ownership based only on profile/KYC facts. | Already settled in APP-Q082; not counted. |
| APP-Q371 | Should users be able to see a history of important account-security events? | account security, transparency, audit | Answered: show a compact private history of sign-ins, credential changes, and session revocations with a “not me” route. | Accepted recommendation. |
| APP-Q372 | How should security alerts behave if push permission is disabled? | account security, notifications, accessibility | Answered: keep alerts in-app and use verified email/SMS where available; explain if no channel is available without repeated permission prompts. | Accepted recommendation. |
| APP-Q373 | Should users be able to pause or freeze account activity when they suspect compromise? | account security, safety, account controls | Answered: provide a fast self-service freeze that blocks new sessions and consequential marketplace actions, while preserving recovery/Support access. | Accepted recommendation; 363rd unique answer/checkpoint. |
| APP-Q374 | What should happen to open orders and seller listings during a suspected account compromise? | account security, orders, seller safety | Answered: temporarily pause new listings and payout actions, review affected orders carefully, preserve recovery/Support access, and never assign fault automatically. | Accepted recommendation. |
| APP-Q375 | How should MaurMaket tell a user their account is secure again after recovery? | account security, recovery, trust | Answered: provide a resolution summary, show actions taken, and let the user review sessions and deliberately restore paused activity. | Accepted recommendation. |
| APP-Q376 | Should MaurMaket offer an optional second sign-in factor, such as a passkey or authenticator, beyond verified email? | account security, authentication, accessibility | Answered: consider optional phishing-resistant methods with accessible recovery; do not require a factor that could lock out users with limited devices/connectivity. | Accepted recommendation. |
| APP-Q377 | Should users be able to appoint a trusted person to help recover an account? | account security, recovery, privacy | Answered: defer trusted-contact recovery in v1 unless consent, revocation, abuse resistance, and ownership checks can be made strong. | Accepted recommendation. |
| APP-Q378 | Should users receive a warning before changing their account's recovery email or phone number? | account security, recovery, notifications | Covered: re-authenticate, verify the new email, and notify the old email when possible. | Already settled in APP-Q083; notification fallback follows APP-Q372. Not counted. |
| APP-Q379 | Should MaurMaket let users set a trusted-device duration or “remember this device” period? | account security, sessions, usability | Answered: keep duration bounded and visible, allow immediate revocation, and never treat a trusted device as KYC or payout proof. | Accepted recommendation. |
| APP-Q380 | How should MaurMaket respond to repeated failed sign-in attempts? | account security, abuse prevention, authentication | Answered: use rate limits and risk checks with generic error wording; offer safe recovery without revealing whether an account exists. | Accepted recommendation. |
| APP-Q381 | Should users be able to choose a longer-term account security level? | account security, settings, authentication | Covered: essential protections apply to all; optional second-factor sign-in is in APP-Q376, and high-impact actions use step-up auth in APP-Q117. | Repeats APP-Q117 and APP-Q376; not counted. |
| APP-Q382 | How should sign-in or recovery codes be delivered and protected if an additional factor is enabled? | account security, recovery, authentication | Answered: show one-time codes once, explain safe offline storage, and never reveal them again in the app or to Support. | Accepted recommendation; linked follow-up to APP-Q376's optional second-factor decision. |
| APP-Q383 | Should Support staff be able to revoke sessions for a user who cannot access the app? | account security, support, staff access | Answered: allow only through an auditable, least-privilege process with ownership checks and user notification when safe. | Accepted recommendation; consistent with APP-Q082 and APP-Q264 safeguards. |
| APP-Q384 | What should a user see before freezing their account? | account security, account controls, orders | Answered: explain effects on sign-in, listings, payouts, and open orders; require confirmation and show a recovery route. | Accepted recommendation. |
| APP-Q385 | Should a user be able to freeze only seller activity while keeping buyer browsing and orders available? | account security, seller tools, account controls | Answered: offer a scoped seller pause when appropriate, with a full account freeze available for broader compromise. | Accepted recommendation; 372nd unique answer/checkpoint. |
| APP-Q386 | How should a user unfreeze an account after securing it? | account security, recovery, safety | Covered: after recovery, show actions and let the user review sessions and deliberately restore paused activity; apply human/risk review to high-impact actions as needed. | Already settled in APP-Q374–APP-Q375; not counted. |
| APP-Q387 | Should MaurMaket notify a user's saved contact if suspicious activity is detected? | account security, privacy, notifications | Covered: security alerts use the account's verified channels; trusted-contact recovery is deferred, and no third party is notified by default. | Already settled in APP-Q372 and APP-Q377; not counted. |
| APP-Q388 | Should users be able to register more than one verified recovery channel? | account security, recovery, accessibility | Answered: yes; verify each independently, confirm clearly before removal, and retain ownership checks. | Accepted recommendation; 372nd unique answer/checkpoint. |
| APP-Q389 | How long should users be able to review their private security-event history? | account security, privacy, retention | Answered: keep a useful recent history, disclose its retention period, and avoid indefinite retention without a clear purpose. | Accepted recommendation. |
| APP-Q390 | What checks should apply before a user removes their last optional second sign-in factor? | account security, authentication, recovery | Answered: require fresh authentication and keep at least one verified recovery path; explain the change and notify the user. | Accepted recommendation. |
| APP-Q391 | How should MaurMaket protect user data-export files? | privacy, data portability, account security | Answered: require re-authentication, clearly label the private download, and explain that external copies are no longer protected by MaurMaket. | Accepted recommendation; privacy/security extension to APP-Q016. |
| APP-Q392 | Should MaurMaket provide a private dashboard showing connected devices and active sessions together? | account security, settings, sessions | Covered: users can review recent sessions, revoke individually, and sign out other devices. | Already settled in APP-Q084; not counted. |
| APP-Q393 | Should sign-in security alerts distinguish a recognized device from an unfamiliar one? | account security, notifications, risk | Answered: distinguish using transparent, privacy-conscious signals, but do not claim certainty based only on a device fingerprint. | Accepted recommendation. |
| APP-Q394 | What should happen if the user’s primary email or phone becomes unreachable during an active security review? | account security, recovery, continuity | Covered: use verified recovery channels and risk-reviewed Support without bypassing ownership checks. | Already settled in APP-Q082 and APP-Q388; not counted. |
| APP-Q395 | Should a user be able to review and correct the device labels shown in their session list? | account security, sessions, privacy | Answered: allow private friendly labels; keep system security facts distinct and do not let user labels establish trust. | Accepted recommendation. |
| APP-Q396 | How should MaurMaket handle an account freeze when the user has an active urgent order task? | account security, orders, safety | Answered: block risky changes and new commerce while preserving limited coordination or Support for existing obligations. | Accepted recommendation. |
| APP-Q397 | Should users be able to choose a delay before a requested account freeze takes effect? | account security, account controls, safety | Covered: suspected-compromise freezes are immediate; scheduled seller pauses are separate. | Already settled in APP-Q373 and APP-Q385; not counted. |
| APP-Q398 | Should account-security event history be exportable as part of the user's data export? | account security, privacy, data portability | Answered: include concise security history within its disclosed retention period and exclude others' private information. | Accepted recommendation. |
| APP-Q399 | How should the app confirm that a data export was generated and downloaded? | privacy, data portability, auditability | Answered: show private status and download-link expiry in-app; never include export contents in notifications. | Accepted recommendation. |
| APP-Q400 | Should users be able to cancel a pending data export request? | privacy, data portability, user control | Answered: allow cancellation while generation is pending; explain that MaurMaket cannot recall an already downloaded copy. | Accepted recommendation; 381st unique answer/checkpoint. |
| APP-Q401 | What should happen if data export generation fails or is interrupted? | privacy, data portability, reliability | Answered: preserve request status, allow safe retry, notify privately, and prevent duplicate or partially exposed archives. | Accepted recommendation. |
| APP-Q402 | Should users see when authorized Support staff access sensitive KYC evidence for a case? | privacy, KYC, support transparency | Answered: log each access and show a concise case-linked notice/history when safe, without exposing staff-sensitive security details. | Accepted recommendation. |
| APP-Q403 | What private account data should be removed from a device when a user signs out? | privacy, local storage, account security | Answered: clear authenticated caches and credentials; protect unsent drafts and offer a clear choice about local retention. | Accepted recommendation. |
| APP-Q404 | Should MaurMaket automatically relock the app after it stays in the background? | account security, privacy, app access | Answered: offer an optional short device-authenticated auto-lock interval, separate from server-session security. | Accepted recommendation. |
| APP-Q405 | Should users be able to see which personal data MaurMaket currently holds about them? | privacy, data access, transparency | Answered: show understandable data categories with links to correction, export, and deletion controls. | Accepted recommendation. |
| APP-Q406 | How should a user correct inaccurate profile or account information? | privacy, data accuracy, account settings | Answered: allow direct edits to low-risk fields; require re-authentication and appropriate review for identity or financial changes. | Accepted recommendation. |
| APP-Q407 | Should users be able to separately delete optional personalization data without closing the account? | privacy, personalization, user control | Covered: users can turn personalization off and separately reset inferred signals while preserving explicit saved items/searches. | Already settled in APP-Q073; not counted. |
| APP-Q408 | How should MaurMaket explain why a specific personal-data field is collected? | privacy, transparency, onboarding | Answered: explain purpose and whether required at collection time, with a concise route to the full privacy details. | Accepted recommendation. |
| APP-Q409 | Should optional data uses have separate controls from data needed to run marketplace transactions? | privacy, consent, settings | Answered: separate optional personalization/marketing choices from essential account, safety, order, and payment processing. | Accepted recommendation. |
| APP-Q410 | What should happen to optional personalization data when a user turns personalization off? | privacy, personalization, account lifecycle | Covered: turning it off stops future use immediately; clearing retained inferred signals is a separate choice. | Already settled in APP-Q073; not counted. |
| APP-Q411 | Should users be able to download their data in a machine-readable format as well as a readable report? | privacy, data portability, accessibility | Answered: offer a readable summary and structured export where practical, with clear format descriptions and secure delivery. | Accepted recommendation; 390th unique answer/checkpoint. |
| APP-Q412 | How should users access privacy controls if they can no longer sign in? | privacy, account recovery, data access | Covered: account recovery requires a verified channel and risk checks before access to account data; Support cannot bypass ownership checks. | Already settled in APP-Q082; not counted. |
| APP-Q413 | Should a user be able to withdraw consent for a specific optional data use without disabling unrelated app functions? | privacy, consent, settings | Answered: make controls purpose-specific and explain feature impact before applying a change. | Accepted recommendation. |
| APP-Q414 | How should MaurMaket explain when some records cannot be immediately deleted after an account-closure request? | privacy, data retention, account lifecycle | Answered: state record category, retention reason, expected review/cleanup point when known, and what is removed from public view. | Accepted recommendation; extension to existing account-closure retention rules. |
| APP-Q415 | Should users be able to see which categories of their data are shared with service providers? | privacy, transparency, third-party processing | Answered: explain provider categories and purposes in Legal & privacy, without implying providers own MaurMaket account authentication. | Accepted recommendation. |
| APP-Q416 | Should users have a separate control for optional product-usage analytics? | privacy, analytics, settings | Answered: separate optional analytics from essential reliability/security measurements, with a clear opt-out that does not remove core features. | Accepted recommendation. |
| APP-Q417 | How should MaurMaket notify users if a data incident may have affected their personal information? | privacy, security, incident response | Answered: provide prompt, plain-language notice through verified channels with known facts and user steps; avoid speculation. | Accepted recommendation. |
| APP-Q418 | Should users be able to review and change the visibility of each profile field from one privacy hub? | privacy, profiles, settings | Covered: Profile & Privacy already groups public-profile visibility controls in AGENTS.md; not counted. |
| APP-Q419 | Should privacy controls show a preview of what another user can currently see? | privacy, profiles, transparency | Covered: public-profile preview is already a Profile settings decision in AGENTS.md; not counted. |
| APP-Q420 | How should app permissions such as camera, photos, notifications, and location be explained? | privacy, device permissions, accessibility | Answered: request each permission in context, explain the immediate feature benefit, and provide a manual fallback when possible. | Accepted recommendation. |
| APP-Q421 | Should users be able to review which device permissions they have granted to MaurMaket? | privacy, settings, device permissions | Answered: show permission status and a direct OS Settings shortcut, while explaining that device-level permission remains controlled by the OS. | Accepted recommendation. |
| APP-Q422 | How should MaurMaket respond if a user revokes a permission while a related feature is in progress? | privacy, device permissions, recovery | Answered: stop using that capability, preserve entered data, explain the change, and offer a manual or retry path where possible. | Accepted recommendation; 399th unique answer/checkpoint. |
| APP-Q423 | Should users be able to choose whether profile information appears in search-engine results? | privacy, profiles, discoverability | Answered: keep personal profiles out of external indexing by default; only consider opt-in indexing if public discovery is later supported. | Accepted recommendation. |
| APP-Q424 | Should users be able to hide their profile from people they have blocked? | privacy, profiles, blocking | Covered: blocking already hides profiles from normal browsing and prevents new non-order contact; active order/support access and records remain available (Profile & Settings decisions; APP-Q110). Not counted. |
| APP-Q425 | What should happen to saved items and follows when a user makes their profile private? | privacy, profiles, social | Covered: Saved is private by default and public follower-list visibility already has its own control in Profile & Settings; not counted. |
| APP-Q426 | Should users be able to clear their local search and browsing history separately from account-synced history? | privacy, search, history | Covered: APP-Q059 already settled synced signed-in search history and device-local guest history with erase control; not counted. |
| APP-Q427 | How should MaurMaket explain the retention period for each major personal-data category? | privacy, retention, transparency | Answered: show a plain-language table with purpose, retention trigger, and cleanup caveats; avoid promising fixed deletion dates that cannot be guaranteed. | Accepted recommendation. |
| APP-Q428 | Should users have one private tracker for access, correction, export, and deletion requests? | privacy, data rights, support | Answered: use a single request center with status, next step, and secure follow-up, while keeping each request's verification requirements. | Accepted recommendation. |
| APP-Q429 | When a user changes profile visibility, should previously shared profile links immediately follow the new visibility? | privacy, profiles, sharing | Answered: resolve links to current visibility and public fields; do not expose stale cached private profile content. | Accepted recommendation. |
| APP-Q430 | Should a Business seller's public identity mode have separate privacy controls from their personal presentation? | privacy, profiles, business | Answered: separate public-facing business fields while shared account rules continue to govern legal identity and transaction history. | Accepted recommendation. |
| APP-Q431 | Should being absent from in-app profile search be a separate choice from having a viewable profile link? | privacy, profiles, discoverability | Answered: control search discoverability separately from link access, honoring public seller listing and block rules. | Accepted recommendation. |
| APP-Q432 | When a user opts out of optional analytics, should previously collected identifiable analytics also be removed? | privacy, analytics, retention | Answered: stop future optional collection/use and delete or irreversibly aggregate prior optional event data where feasible; retain essential security/reliability records under their separate purpose. | Accepted recommendation. |
| APP-Q433 | What should the future support website offer before a user opens a case? | support, help center, self-service | Answered: searchable, localized plain-language guides and contextual next steps, with urgent/safety issues easy to escalate. | Accepted recommendation. |
| APP-Q434 | Should a support case started in the app remain available in the future support website, and vice versa? | support, case management, web | Answered: one private case record with synchronized messages, evidence, status, and audit history across both channels. | Accepted recommendation; linked extension of APP-Q123 to cross-channel continuity. |
| APP-Q435 | What support access should remain available to someone who cannot sign in? | support, account recovery, access | Answered: public self-help and ownership-checked recovery/contact route, without disclosing case/account data before verification. | Accepted recommendation. |
| APP-Q436 | For the future support website, should sign-in use the same MaurMaket identity as the app? | support, authentication, web | Answered: shared Better Auth identity and session protections; no separate support password/account. | Accepted recommendation; linked follow-up in the new website context. |
| APP-Q437 | Should a user be able to choose a support language separately from the app language? | support, localization, accessibility | Answered: let users choose Haitian Creole, French, or English for a case and preserve original messages alongside assisted translation. | Accepted recommendation. |
| APP-Q438 | What evidence files should users be able to attach through the support website? | support, evidence, uploads | Answered: common images and PDFs with disclosed size/type limits, upload progress/retry, and warnings to exclude passwords/PINs. | Accepted recommendation. |
| APP-Q439 | How should users learn about new Support replies when they are not in the app or website? | support, notifications, communication | Answered: use a verified channel and notification preferences for a privacy-safe reply alert; keep case details behind sign-in. | Accepted recommendation. |
| APP-Q440 | Should users be able to rate or comment on a help article that did not solve their issue? | support, help center, feedback | Answered: offer optional helpful/not helpful feedback and a direct case route; never make feedback a prerequisite for support. | Accepted recommendation. |
| APP-Q441 | Could a future AI support assistant answer basic questions from approved help content? | support, AI, self-service | Answered: clearly label AI, constrain it to approved content, offer human escalation, and prohibit AI decisions about fault, refunds, enforcement, or KYC. | Accepted recommendation; 415th unique answer/checkpoint. |
| APP-Q442 | If an AI support assistant is added, how should it isolate each user's session and data? | support, AI, privacy, security | Answered: strict per-user/session isolation, no cross-user memory, least-privilege access, and auditable human handoff. | Accepted recommendation. |
| APP-Q443 | Should help pages be usable without an account or sign-in? | support, help center, access | Answered: keep general guides public and require sign-in only for private case/account details. | Accepted recommendation. |
| APP-Q444 | Should support-website pages be designed to work on low-end phones and slow connections? | support, web, accessibility, performance | Answered: build lightweight mobile-first pages that load over constrained connections and avoid gating essential content behind heavy media. | Accepted recommendation. |
| APP-Q445 | Should users be able to search support guides in Haitian Creole, French, and English? | support, localization, search | Answered: support multilingual search tolerant of common spelling/diacritic differences and clearly label source-article language. | Accepted recommendation. |
| APP-Q446 | Should support articles show a review date and the product area they cover? | support, help center, content governance | Answered: show last-reviewed date and owner/product area; clearly flag outdated guidance. | Accepted recommendation. |
| APP-Q447 | How should the help center respond when a guide no longer matches the current app? | support, help center, product changes | Answered: mark outdated guidance and link to current steps or Support. | Accepted recommendation. |
| APP-Q448 | Should users be able to save a help article for later? | support, help center, personalization | Covered: this repeats APP-Q059's device-local guest history vs signed-in sync/erase pattern for a low-stakes saved item; not counted. |
| APP-Q449 | Should support-case status changes be mirrored in the app and website in near real time? | support, case management, synchronization | Covered: APP-Q434 already settled one synchronized cross-channel case record and live status/history; not counted. |
| APP-Q450 | Should the user be able to download a copy of a support case and its attachments? | support, privacy, data export | Covered: APP-Q016/APP-Q428 provide user data export and a unified privacy request tracker; do not create a separate case export unless new scope emerges. |
| APP-Q451 | What should users be able to do with a support case they no longer need? | support, case lifecycle, user control | Answered: let them mark resolved/close their request, retain necessary audit history, and provide a clear reopen route within applicable limits. | Accepted recommendation; 425th unique answer/checkpoint. |
| APP-Q452 | How should Support handle a user who opens multiple cases for the same unresolved issue? | support, case management, operations | Answered: suggest linking/merging duplicates, preserve every message/evidence, and let the user dispute an incorrect merge. | Accepted recommendation. |
| APP-Q453 | Should Support give users a way to attach temporary diagnostic logs to a specific technical case? | support, diagnostics, privacy | Answered: only on explicit consent, scoped to case/time window, with sensitive tokens scrubbed and retention disclosed. | Accepted recommendation. |
| APP-Q454 | Should technical diagnostics include device/app details automatically with a case? | support, diagnostics, privacy | Answered: preview relevant app/device/error details and let users remove optional fields before sending. | Accepted recommendation. |
| APP-Q455 | Should the support website offer a low-bandwidth mode that avoids large images and animations? | support, web, accessibility, performance | Answered: make help text-first and fast by default; media is optional and no essential content depends on animation. | Accepted recommendation. |
| APP-Q456 | Should users be able to print or save a support reply as a simple document? | support, case records, accessibility | Answered: provide a clean accessible print/save view for user-visible messages/outcomes, excluding internal notes and unrelated private data. | Accepted recommendation. |
| APP-Q457 | How should the support website handle browser/device changes during an unfinished case form? | support, reliability, drafts | Answered: preserve a protected signed-in draft with explicit save/discard; do not place sensitive evidence in unsecured local storage. | Accepted recommendation. |
| APP-Q458 | Should users choose whether Support may contact them by phone for a specific case? | support, communication, privacy | Covered: phone contact is already an optional, user-initiated Support path for account recovery when needed (APP-Q082); not counted. |
| APP-Q459 | Should a support case let users set a preferred contact channel and time window? | support, communication, accessibility | Asked; recommend let users set a case-level preferred channel/time when feasible, without delaying urgent safety/payment notices or weakening verified-channel requirements. |
| APP-Q460 | Should the help center provide short step-by-step walkthroughs for common tasks? | support, help center, usability | Asked; recommend concise text-first steps with optional images and links directly to the relevant app screen; avoid autoplay video. |
| APP-Q461 | Should public help articles display the policy or app version they apply to? | support, content governance, policies | Covered: policy version/history and change notices are already settled in APP-Q356–APP-Q365; not counted. |
| APP-Q462 | How should the website show whether a self-service action actually succeeded? | support, reliability, feedback | Covered: server-confirmed consequential writes, idempotency, and degraded-state guidance are already settled in APP-Q256/APP-Q258; not counted. |
| APP-Q453 | Should Support give users a way to attach temporary diagnostic logs to a specific technical case? | support, diagnostics, privacy | Asked; recommend only on explicit consent, scoped to that case/time window, with sensitive tokens scrubbed and retention disclosed. |
| APP-Q454 | Should technical diagnostics include device/app details automatically with a case? | support, diagnostics, privacy | Asked; recommend show a concise preview of relevant app version/device/error details and allow users to remove optional fields before sending. |
| APP-Q455 | Should the support website offer a low-bandwidth mode that avoids large images and animations? | support, web, accessibility, performance | Asked; recommend default to fast text-first help, with optional media and no essential content gated behind animation. |
| APP-Q456 | Should users be able to print or save a support reply as a simple document? | support, case records, accessibility | Asked; recommend provide a clean accessible print/save view for user-visible messages and outcomes, excluding internal notes and unrelated private data. |
| APP-Q457 | How should the support website handle browser/device changes during an unfinished case form? | support, reliability, drafts | Asked; recommend preserve a protected draft for signed-in users and offer explicit save/discard; avoid placing sensitive evidence in unsecured local storage. |
| APP-Q458 | Should users choose whether Support may contact them by phone for a specific case? | support, communication, privacy | Asked; recommend case-scoped optional consent, show the verified number being used, and default to in-app/web case messages. |
| APP-Q459 | Should a support case let users set a preferred contact channel and time window? | support, communication, accessibility | Asked; recommend let users set a case-level preferred channel/time when feasible, without delaying urgent safety/payment notices or weakening verified-channel requirements. |
| APP-Q460 | Should the help center provide short step-by-step walkthroughs for common tasks? | support, help center, usability | Asked; recommend concise text-first steps with optional images and links directly to the relevant app screen; avoid autoplay video. |
| APP-Q461 | Should public help articles display the policy or app version they apply to? | support, content governance, policies | Asked; recommend label relevant version/effective date and link to current guidance while preserving archived versions when needed for historical cases. |
| APP-Q462 | How should the website show whether a self-service action actually succeeded? | support, reliability, feedback | Asked; recommend confirm only after the server acknowledges it, show the resulting state/reference, and preserve a retry/help route after failure. |

| APP-Q463 | Should a support case let users set a preferred contact channel and time window? | support, communication, accessibility | Answered: let users set a case-level preferred channel/time when feasible, without delaying urgent safety/payment notices or weakening verified-channel requirements. | Accepted recommendation. |
| APP-Q464 | Should the help center provide short step-by-step walkthroughs for common tasks? | support, help center, usability | Answered: provide concise text-first steps with optional images and direct links to the relevant app screen; no autoplay video. | Accepted recommendation. |
| APP-Q465 | Should the Support website explain whether its public content or self-service tools are temporarily degraded? | support, reliability, status | Answered: show concise status and affected functions, preserve case access where possible, and offer safe alternatives. | Accepted recommendation. |
| APP-Q466 | Should Support articles keep an accessible change history when instructions or policy guidance change? | support, content governance, auditability | Answered: retain dated user-facing summaries and current guidance, with prior versions available when relevant to an existing case. | Accepted recommendation. |
| APP-Q467 | Should users control whether browser notifications are enabled for new Support replies? | support, notifications, web | Answered: make browser push optional/device-specific, follow case notification preferences, and keep in-site case history authoritative. | Accepted recommendation. |
| APP-Q468 | How should Support handle a website outage while a user is composing case details? | support, reliability, drafts | Answered: preserve a protected signed-in draft where safe, clearly label unsent status, and never imply submission without server acknowledgment. | Accepted recommendation. |
| APP-Q469 | Should users be able to withdraw diagnostic-log permission after sending logs? | support, diagnostics, privacy | Answered: stop future collection and allow removal of identifiable diagnostic copies where feasible, explaining retention needed for active review. | Accepted recommendation; 440th unique answer/checkpoint. |
| APP-Q470 | Should Support be able to request more diagnostic information after the first report? | support, diagnostics, consent | Answered: request specific additional data with purpose/retention explanation and fresh consent; no silent background collection. | Accepted recommendation. |
| APP-Q471 | Should the user be able to review the full diagnostic packet before it reaches Support? | support, diagnostics, transparency | Answered: show included categories and readable preview, permit optional redaction, and require explicit send confirmation. | Accepted recommendation. |
| APP-Q472 | Should users be able to delete diagnostic attachments from a case after submission? | support, diagnostics, retention | Answered: allow a removal request when logs are no longer needed, preserve minimum audit metadata, and explain temporary retention for active investigation. | Accepted recommendation. |
| APP-Q473 | Should Support give users a way to attach temporary diagnostic logs to a specific technical case? | support, diagnostics, privacy | Covered: APP-Q453 already settled optional, scoped, token-scrubbed diagnostics; not counted. |
| APP-Q474 | Should technical diagnostics include device/app details automatically with a case? | support, diagnostics, privacy | Covered: APP-Q454 already settled preview/removal of optional device/app metadata; not counted. |
| APP-Q475 | Should the support website offer a low-bandwidth mode that avoids large images and animations? | support, web, accessibility, performance | Covered: APP-Q455 already settled text-first, fast support pages with optional media; not counted. |
| APP-Q476 | Should users be able to print or save a support reply as a simple document? | support, case records, accessibility | Covered: APP-Q456 already settled accessible user-visible case print/save; not counted. |
| APP-Q477 | How should the support website handle browser/device changes during an unfinished case form? | support, reliability, drafts | Covered: APP-Q457/APP-Q468 already settled protected drafts across device/outage changes with clear unsent status; not counted. |
| APP-Q478 | Should users choose whether Support may contact them by phone for a specific case? | support, communication, privacy | Covered: APP-Q458 was covered by verified-channel account recovery; no new phone-contact policy. Not counted. |
| APP-Q479 | Should Support be able to request more diagnostic information after the first report? | support, diagnostics, consent | Covered: APP-Q470 already requires purpose/retention disclosure and fresh consent for additional diagnostics; not counted. |
| APP-Q480 | Should users review or redact the full diagnostic packet before it reaches Support? | support, diagnostics, transparency | Covered: APP-Q471 already settles preview, optional redaction, and explicit send confirmation; not counted. |
| APP-Q481 | Should users be able to delete diagnostic attachments from a case after submission? | support, diagnostics, retention | Covered: APP-Q472 already settles removal requests with minimum audit retention and active-review explanation; not counted. |
| APP-Q482 | Should users be able to withdraw diagnostic-log permission after sending logs? | support, diagnostics, privacy | Covered: APP-Q469 already settles stop-future-collection and feasible removal of identifiable diagnostic copies; not counted. |
| APP-Q483 | Should users be able to authorize a trusted helper to access one support case? | support, delegated access, privacy | Asked; recommend no shared credentials; if supported, require explicit, case-scoped, expiring permission and audit every helper action. |
| APP-Q484 | What should happen when a support case concerns urgent safety or account compromise? | support, safety, escalation | Asked; recommend visibly prioritize it, provide immediate safe self-help/account-freeze route, and queue human review without promising instant resolution. |
| APP-Q485 | Should a user be able to request an independent review if a Support case was handled by the wrong team? | support, case routing, appeals | Covered: APP-Q129 already lets users correct issue categories and Support reroute the same request; not counted. |
| APP-Q486 | Should support articles separate official platform rules from suggested troubleshooting steps? | support, content governance, trust | Asked; recommend clearly label binding policy/product requirements versus optional diagnostic suggestions; never present guesses as account facts. |
| APP-Q487 | Should the user receive a confirmation receipt after submitting a Support case or follow-up? | support, case management, reliability | Asked; recommend show a server-confirmed reference and summary of submitted content; if confirmation fails, preserve draft and state that submission is unconfirmed. |
| APP-Q488 | Should users be able to report a broken or confusing help article without opening a support case? | support, help center, feedback | Covered: APP-Q440 already provides optional helpful/not-helpful feedback and a direct case route; not counted. |
| APP-Q489 | Should Support ask a user to describe the outcome they want when they open a case? | support, case intake, fairness | Asked; recommend an optional plain-language “what would help resolve this?” field, separate from event description and never treated as proof or entitlement. |
| APP-Q490 | Should the support website show a user's open case list in one place across issue categories? | support, case management, findability | Asked; recommend one authenticated case list with clear status, urgency, and last update, while keeping each case's evidence/context separate. |
| APP-Q491 | Should users be able to mark a Support reply as not understood and request clarification? | support, communication, accessibility | Asked; recommend provide a simple clarification action in the same case, preserving prior replies and avoiding a new duplicate case. |
| APP-Q492 | Should the Support website provide a private status notice for widespread service incidents? | support, reliability, status | Covered: APP-Q258 already settled a lightweight public status page and service-specific degraded-state guidance; not counted. |
| APP-Q493 | Should users be able to submit a short voice explanation as part of a support case? | support, accessibility, localization, evidence | Asked; recommend optional voice input with a length limit, explicit upload consent, a user-reviewable transcript when available, and the original audio retained only under case evidence rules. |
| APP-Q494 | Should the user see the assigned Support responder's name or role? | support, transparency, staff privacy | Asked; recommend show the responsible team/role and a case reference, but not staff personal contact details; keep all replies in the audited case thread. |

| APP-Q495 | Should a user be able to link an existing order or listing to a Support case without retyping its reference? | support, case context, usability | Answered: link only an accessible relevant record, disclose exactly what context is shared, and exclude unrelated account data | Accepted recommendation; 459th-answer checkpoint. |
| APP-Q496 | Should Support's access to linked order/account records be limited to the specific case purpose? | support, staff access, privacy | Answered: least-privilege case-scoped access, logged and expired when no longer needed | Accepted recommendation. |
| APP-Q497 | Should the reporter receive a private confirmation that their report was received and is being reviewed? | safety, reporting, communication | Answered: provide neutral receipt and coarse status without exposing another user's private information or promising an outcome | Accepted recommendation. |
| APP-Q498 | Should the reporter receive a short outcome notice after a safety report is reviewed? | safety, reporting, privacy | Answered: provide a privacy-safe outcome category without disclosing enforcement details about another user | Accepted recommendation. |
| APP-Q499 | Should users be able to add context to an existing safety report after submitting it? | safety, reporting, evidence | Covered: APP-Q124 already allows timestamped follow-up evidence/context in the same private case and labels it user-provided/unverified; not counted. |
| APP-Q500 | Should Support cases distinguish a confirmed platform fact from a user's account of events? | support, evidence, fairness | Covered: APP-Q124/APP-Q127 already distinguish user-provided material from independently verified evidence and protect fair disclosure; not counted. |
| APP-Q501 | Should a user be able to correct a factual error in a Support case summary before it is closed? | support, case records, correction | Answered: allow a correction note in the same case and preserve the original summary with an audit trail | Accepted recommendation. |
| APP-Q502 | Should a case's final outcome summary include the policy or process basis for the decision? | support, transparency, accountability | Covered: existing Support decisions require a concise outcome, key reason, and next step, with a second-review route; not counted. |
| APP-Q503 | Should users be able to download or share a completed Support case record? | support, privacy, data portability | Covered: APP-Q016/APP-Q428 already provide personal-data export/request paths; not counted. |
| APP-Q504 | Should case exports remain available after case closure, and for how long? | support, retention, data portability | Covered: APP-Q016/APP-Q428 and the established disclosed retention rules govern user exports and case records; not counted. |
| APP-Q505 | Should a reporter be able to withdraw a safety report they submitted by mistake? | safety, reporting, user control | Answered: allow withdrawal, but let review continue when independent evidence indicates a serious unresolved safety risk | Accepted recommendation. |
| APP-Q506 | If a reported listing disappears before review, should Support still review the report? | safety, moderation, evidence | Answered: preserve only the minimum case-scoped snapshot needed for fair review, under disclosed retention; public availability is not required | Accepted recommendation. |
| APP-Q507 | Should repeated reports about the same listing be handled together? | safety, moderation, privacy | Answered: consolidate staff review while keeping each reporter's receipt/status private and never exposing who else reported it | Accepted recommendation. |
| APP-Q508 | What should happen to a user's unresolved safety reports if they close their account? | safety, account lifecycle, privacy | Answered: complete time-sensitive review with restricted necessary records while honoring account-closure access limits and disclosed retention | Accepted recommendation; linked extension of account-closure records for active safety reports. |
| APP-Q509 | Should users be able to flag a meetup area as unsafe, and may that affect place recommendations? | map, safety, trust signals | Answered: allow private safety feedback for review, but never label a place “safe” from reports alone; recommendations still require enough mutually confirmed completed orders | Accepted recommendation; retain the existing evidence threshold for positive place recommendations. |
| APP-Q510 | What should the Support AI assistant do when approved help content does not answer a user's question? | support, AI, uncertainty | Answered: say it cannot confirm the answer, avoid guessing, and offer human support | Accepted recommendation. |
| APP-Q511 | May the Support AI assistant read a user's private order or account details to personalize help? | support, AI, privacy, authorization | Answered: no access by default; allow only authenticated, user-initiated, narrowly scoped read-only context with clear notice | Accepted recommendation. |
| APP-Q512 | Before an AI-generated case summary is sent to a human agent, should the user review it? | support, AI, case handoff | Answered: show and allow correction of the summary, preserve the original conversation, and send only after user confirmation | Accepted recommendation. |
| APP-Q513 | Should an AI help conversation be saved in the user's Support history automatically? | support, AI, data retention | Answered: keep self-service AI chats out of durable case history unless the user chooses to create a case or save the exchange | Accepted recommendation. |
| APP-Q514 | May the Support AI submit a report, cancellation, payment, or account action for the user? | support, AI, consequential actions | Answered: explain and open the relevant flow, but require the user to review and confirm every consequential action | Accepted recommendation. |
| APP-Q515 | What immediate response should MaurMaket take after a credible report that a meetup area is unsafe? | map, safety, risk response | Answered: temporarily suspend a safe-area recommendation and warn affected upcoming meetups during human review, without blocking general app access | Accepted recommendation. |
| APP-Q516 | How should a user describe why a meetup location feels unsafe? | map, safety, feedback UX | Answered: offer optional reason categories and a short optional note; avoid precise public accusations and unnecessary uploads | Accepted recommendation. |
| APP-Q517 | Who should be able to see a safety report about a meetup area? | map, safety, privacy | Answered: only the reporting user and authorized reviewers; never expose reporter identity to the other participant or public | Accepted recommendation. |
| APP-Q518 | For how long should a meetup-area safety report affect warnings or recommendations? | map, safety, retention | Answered: review promptly, show warnings only while risk is unresolved, and expire or revalidate the signal under a disclosed time limit | Accepted recommendation; 477th-answer checkpoint. |
| APP-Q519 | After reporting an unsafe meetup area, what should the app offer the user? | map, safety, recovery | Answered: immediate practical options such as choosing another mutually agreed place or contacting Support, without treating the report alone as proof of fault | Accepted recommendation. |
| APP-Q520 | May a user report a meetup-area safety concern without having completed a MaurMaket order there? | map, safety, reporting eligibility | Answered: accept firsthand reports from any user, but never count them as confirmed safe meetups or verified evidence without review | Accepted recommendation. |
| APP-Q521 | What makes a meetup-area report credible enough to temporarily pause a popular-place recommendation? | map, safety, evidence threshold | Answered: consider specific firsthand details and corroboration, route promptly for review, and never rely on report volume alone as proof | Accepted recommendation. |
| APP-Q522 | Should an unresolved safety warning block users from selecting that meetup place? | map, safety, user choice | Answered: keep warnings advisory, show clear risk context, and let users choose another mutually agreed place; do not silently block an order solely from an unverified report | Accepted recommendation. |
| APP-Q523 | If a safety warning appears after both parties confirmed a meetup, should MaurMaket cancel or change the order automatically? | map, safety, order integrity | Answered: do not mutate or cancel automatically; pause the risky handoff step and ask both parties to confirm any new place/time | Accepted recommendation. |
| APP-Q524 | How should a place recommendation handle strong completed-meetup history alongside a new credible safety concern? | map, safety, trust signals | Answered: preserve positive history, but suspend the recommendation while the credible concern is unresolved | Accepted recommendation. |
| APP-Q525 | Should a location-safety report affect a seller's rating, tier, or account standing by itself? | map, seller fairness, moderation | Answered: no; review place risk separately and require independently reviewed evidence before seller-specific action | Accepted recommendation. |
| APP-Q526 | Should a safety report distinguish a temporary condition from an ongoing concern? | map, safety, report intake | Answered: offer “temporary,” “ongoing,” and “not sure” choices without requiring certainty | Accepted recommendation. |
| APP-Q527 | Should the app collect live GPS in the background to determine whether a safety report is nearby? | map, privacy, location permissions | Answered: no background tracking; use the explicitly selected meetup point and request foreground location only when needed for an active meetup flow | Accepted recommendation. |
| APP-Q528 | When should MaurMaket warn participants about a reported meetup location? | map, safety, notifications | Covered: APP-Q515 already requires warnings for affected upcoming meetups while a credible risk is reviewed; not counted. |
| APP-Q529 | Should the warning explain why a meetup recommendation was paused? | map, safety, transparency | Answered: give a brief reviewed-risk explanation and last-review state without exposing reporter details or unverified allegations | Accepted recommendation; 487th-answer checkpoint. |
| APP-Q530 | Should users be able to privately save preferred meetup places for future orders? | map, personalization, location privacy | Answered: allow user-only saved landmarks/places, never publish them or treat them as a home/delivery address, and require both parties to confirm each order's exact meetup | Accepted recommendation. |
| APP-Q531 | How should the download website help users verify that an Android app package is an official MaurMaket release? | updates, security, distribution | Answered: distribute only signed official builds from the verified MaurMaket domain and show version/build details; never direct users to unofficial mirrors | Accepted recommendation. |
| APP-Q532 | What information should the app-download page show for the current release? | updates, transparency, distribution | Answered: show version, release date, download size, supported Android requirements, and a concise change summary before download | Accepted recommendation. |
| APP-Q533 | How should release notes describe changes that affect user workflows? | updates, transparency, usability | Answered: use plain-language highlights and clearly call out new steps or required actions, without a technical changelog dump | Accepted recommendation. |
| APP-Q534 | After installing an update, should MaurMaket show a “What’s new” screen? | updates, onboarding, UX | Answered: show a short, dismissible summary once per release; do not block browsing or an active order | Accepted recommendation. |
| APP-Q535 | Should an optional update prompt wait while a user is in checkout, payment, or an active meetup? | updates, transactions, interruption | Answered: defer noncritical prompts until the current consequential flow reaches a safe pause | Accepted recommendation. |
| APP-Q536 | Should users be able to postpone an optional update and choose when to be reminded again? | updates, user control | Answered: offer simple “later” choices for optional updates; explain security-critical notices and gate only unsafe actions | Accepted recommendation. |
| APP-Q537 | If an app download is interrupted by weak connectivity, what should the website offer? | updates, low data, reliability | Answered: show clear progress, allow resume/retry, and keep the installed app usable unless an unsafe action requires a newer version | Accepted recommendation. |
| APP-Q538 | Should new Android app builds be released to a small group before reaching everyone? | updates, release management, reliability | Answered: use staged rollout with health monitoring and a fast stop/rollback path; never restrict regional access within Haiti | Accepted recommendation. |
| APP-Q539 | Should the download site offer previous app versions for users who encounter a bad update? | updates, security, rollback | Answered: no unrestricted archive; provide only an officially signed, supported rollback build when needed, with compatibility guidance | Accepted recommendation; 497th-answer checkpoint. |
| APP-Q540 | What help should the download site provide if Android blocks installation? | updates, support, accessibility | Answered: give device-specific troubleshooting, remind users to use the verified official source, and offer Support; never suggest disabling core device protections | Accepted recommendation. |
| APP-Q541 | What should sellers confirm about their rights to listing photos, descriptions, and logos? | listings, content rights, seller onboarding | Answered: require sellers to confirm they may use the material and prohibit unauthorized or misleading content, with clear examples | Accepted recommendation. |
| APP-Q542 | How should buyers report suspected counterfeit goods or stolen listing images? | listings, authenticity, reporting | Answered: provide specific report reasons and a private evidence path, separate from ordinary product-condition complaints | Accepted recommendation. |
| APP-Q543 | What evidence should MaurMaket request when reviewing a counterfeit or content-rights report? | listings, authenticity, moderation, evidence | Answered: request only relevant evidence, label unverified claims, and avoid requiring documents a reporter cannot reasonably access | Accepted recommendation. |
| APP-Q544 | Who should be able to submit a content-rights complaint? | listings, content rights, reporting eligibility | Answered: let anyone flag a concern, while giving rights holders a dedicated identification path; a user report alone is not proof | Accepted recommendation. |
| APP-Q545 | What should the seller be told when a listing is restricted for a counterfeit or content-rights review? | listings, moderation, transparency | Answered: explain the affected content, reason category, current restriction, and response path without revealing reporter identity or private evidence | Accepted recommendation. |
| APP-Q546 | May a seller replace or edit disputed photos/text while a content-rights review is pending? | listings, content rights, moderation | Answered: allow safe edits or replacement where they do not erase relevant review history; keep the listing's review status visible to the seller | Accepted recommendation. |
| APP-Q547 | How should sellers appeal a confirmed counterfeit or unauthorized-content decision? | listings, moderation, appeals, fairness | Answered: offer a clear review path for new evidence or process concerns, with a different reviewer where practical | Accepted recommendation. |
| APP-Q548 | If a counterfeit concern is confirmed after an order was completed, should MaurMaket notify affected buyers? | listings, authenticity, orders, notifications | Answered: notify affected buyers with a factual explanation and Support route, without assigning blame or automatically changing order/payment state | Accepted recommendation. |
| APP-Q549 | Should MaurMaket automatically compare listing photos/text to detect likely duplicates or unauthorized reuse? | listings, moderation, automation, privacy | Answered: use matches only as private review signals, disclose automation's role, and require human review before consequential restrictions | Accepted recommendation; 507th-answer checkpoint. |
| APP-Q550 | If a seller removes a listing, what content should remain in completed-order records? | listings, order records, privacy, content rights | Answered: remove it from public discovery but retain only the item/terms snapshot needed for receipts, disputes, and required records under disclosed retention | Accepted recommendation. |
| APP-Q551 | Should the design system support both light and dark appearances, and how should the default be chosen? | design system, theming, accessibility | Answered: support both from shared design tokens; follow the device appearance by default and let users choose in Settings | Accepted recommendation. |
| APP-Q552 | What shared rules should govern app backgrounds, spacing, typography, and surfaces? | design system, visual consistency, performance | Answered: use solid theme backgrounds without full-screen background images; define shared spacing/type scales and restrained surfaces; keep one consistent font family and typography system app-wide | Accepted recommendation; exact font family to be confirmed against existing project fonts during implementation. |
| APP-Q553 | How should icons and motion feel across MaurMaket? | design system, iconography, animation, accessibility | Answered: use one consistent SVG icon family with shared sizing/stroke rules; use brief purposeful motion, avoid distraction, and honor Reduce Motion | Accepted recommendation. |

## Prior decision coverage index — do not repeat as new questions

This is a reference index, not a rewrite of prior decisions. Read the linked sections for exact policy and wording before designing adjacent questions.

| Covered domain | Existing source / settled work | Guardrail for new questions |
|---|---|---|
| Product-discovery Q&A workflow | AGENTS.md → Product Discovery & Back-and-Forth | Respect ten-per-round from APP-Q144 / every-nine-answer updates; this ledger adds the app-wide 500+ goal and semantic duplicate check. |
| Notifications | AGENTS.md → Notifications Discovery | Treat extensive notification behavior, urgency, retention, grouping, settings, delivery, and routing decisions as settled. |
| Profile, privacy, settings, and reviews | AGENTS.md → Profile & Settings Discovery | Do not re-ask settled identity, privacy, trust, review, settings, tier downgrade, listing pause, or cross-surface consistency decisions. |
| Inbox, chat, offers, reactions | AGENTS.md and connected Inbox discovery notes | Do not re-ask WhatsApp-like layout, reaction picker, one reaction/message, negotiation/counter flow, or feature-density decisions already answered. |
| Feed and Explore | AGENTS.md → Feed & Explore Discovery | Feed/Explore Q&A is concluded and implementation-ready; do not re-open feed semantics, search fields, filters, recommendation diversity, ranking feedback, media scope, or gestures absent materially changed context. |
| Listing creation and management | AGENTS.md → Add Product Discovery | Treat guided draft creation, photo selection, condition/flaw disclosure, variants, publishing/review, pause/restock, offers, and tier caps as settled. |
| Checkout, payments, seller fees, NatCash, MonCash | AGENTS.md → Checkout & Map, payment/NatCash records, and prior Q&A decisions | Do not re-ask fees, external MonCash handoff assumptions, NatCash access/subscription/grace rules, mixed checkout, or payment timing already settled. |
| Map, delivery, meetups, location privacy | AGENTS.md → Map & Checkout Discovery | Treat opt-in map participation, privacy, popular meetup aggregation, seller radius, proposal/counter windows, reservations, handoff rules, and 1-hour meetup allowance as settled. Reschedule logic remains back-pocket. |
| Seller tiers, identity verification, business model | AGENTS.md tier/KYC/business decisions and Add Product Discovery | Preserve mandatory seller identity verification and caps: Casual 10, Verified 100, Business unlimited; do not reopen the agreed business/personal identity or entitlement model. |
| Account/authentication and data ownership | Auth/database decisions in AGENTS.md, session notes, and existing code | Better Auth owns authentication; Supabase/Neon are databases/storage. Signup/KYC data persistence concerns were identified; ask only genuinely unresolved data lifecycle questions. |
| Social and marketplace trust | Notifications/Profile/Inbox/checkout decisions | Follow, review eligibility, report/block, trust signals, privacy, and order-backed reputation rules already settled are protected from repetition. |

## Domain map and ID planning

Use permanent sequential IDs. This map guides broad coverage; it is not a quota that forces repetitive questions. Expand a band or add a new band when useful unique questions remain.

- APP-Q001–APP-Q024: app entry, onboarding, navigation, first-session/returning-user journeys, and product promise.
- APP-Q025–APP-Q049: launch readiness, geographic sequencing, marketplace health, success measures, and tradeoffs.
- APP-Q050–APP-Q074: account lifecycle, authentication, recovery, verification-data lifecycle, device/session behavior.
- APP-Q075–APP-Q099: buyer needs, discovery, trust before contact, product detail and comparison.
- APP-Q100–APP-Q124: search, browse, filters, recommendations, accessibility of discovery.
- APP-Q125–APP-Q149: listing presentation, inventory edge cases, variants, content integrity, moderation interactions.
- APP-Q150–APP-Q174: seller workflow, seller tools, analytics, pricing controls, operating quality.
- APP-Q175–APP-Q199: tiers, business identity, subscriptions, access lifecycle, staff/future multi-store boundaries.
- APP-Q200–APP-Q224: messaging, conversation lifecycle, offers, bargaining, shopping context, abuse prevention.
- APP-Q225–APP-Q249: checkout, cart, mixed fulfillment/payment, price transparency, order creation, Orders workspace UX, and seller promo codes.
- APP-Q250–APP-Q274: MonCash/NatCash payment experience, seller finance, reliability operations, and KYC data lifecycle.
- APP-Q275–APP-Q299: delivery, meetup, map, location, scheduling, safety, seller/buyer coordination, seller listing-performance analytics, and initial Business storefront details.
- APP-Q300–APP-Q325: Business storefronts, listing shares, referral incentives, attribution, and invited-user growth.
- APP-Q326–APP-Q335: referral invitations, attribution, privacy, and program lifecycle.
- APP-Q336–APP-Q345: order cancellations, buyer/seller consent, sub-orders, and refund-status UX.
- APP-Q346–APP-Q355: device compatibility, low-resource experience, mobile data, storage, battery, and access.
- APP-Q356–APP-Q365: policy transparency, consent, localization, and version history.
- APP-Q366–APP-Q417: account security controls, recovery, compromise response, and privacy/data-lifecycle controls (covered candidates remain indexed and are not counted).
- APP-Q350–APP-Q374: notifications, inbox badges, push, in-app activity, urgency and user control.
- APP-Q375–APP-Q399: profiles, follows, reviews, social proof, privacy, business storefront presentation.
- APP-Q400–APP-Q424: settings, language, accessibility, reduced motion, theming, data controls.
- APP-Q425–APP-Q449: help, reports, support operations, policies, moderation, account enforcement.
- APP-Q450–APP-Q474: reliability, offline behavior, performance, observability, recovery and data consistency.
- APP-Q475–APP-Q499: cross-feature journeys, edge cases, localization/cultural context, launch risks.
- APP-Q500+: coverage-gap follow-ups and useful topics surfaced during prior rounds; the total may exceed 500.

## Decision log

### Batch 1 — APP-Q001–APP-Q003 (2026-10-02)

- Accepted: Let visitors browse without an account; require an account for following, messaging, cross-device saving, or beginning a transaction.
- Accepted: Use contextual, dismissible first-run guidance rather than a forced product tour; do not repeat a dismissed hint.
- Accepted: Restore the last main tab on return, while routing urgent pending safety/payment/order actions to the relevant destination.
- Cross-domain note: Authentication remains Better Auth-owned; this decides where sign-in is required in the user journey, not the identity provider or KYC requirements.

### Batch 2 — APP-Q004–APP-Q006 (2026-10-02)

- Accepted: The core promise is helping people in Haiti discover local items and complete clear, safer transactions with local sellers.
- Accepted: Build marketplace density in a focused launch area before broadening geographic coverage. This does not alter seller fulfillment radius settings.
- Accepted: Safe completed and repeat transactions are the early north-star outcomes; signups and listings are supporting diagnostics.
- Cross-domain note: The focus on transaction quality aligns with the existing checkout, meetup, payment, identity verification, and dispute decisions; none of those mechanics were reopened.

### Batch 3 — APP-Q007–APP-Q009 (2026-10-02)

- Accepted: Explicitly prohibit counterfeit, illegal, and dangerous goods; publish clear prohibited/restricted category rules and surface relevant guidance during listing creation.
- Accepted: A user report alone does not immediately remove a listing. Keep it available through routine review; temporarily hide it when credible evidence indicates immediate serious harm or illegality, with an appeal path.
- Accepted: Account restrictions should explain the reason and duration when possible, identify paused access, and offer review/appeal while preserving help for active transactions.
- Cross-domain note: This clarifies the gap between existing listing-review states and account-level enforcement, while preserving the prior decision that reports enter review and do not automatically penalize a user.

### Batch 4 — APP-Q010–APP-Q012 (2026-10-02)

- Accepted: On a fresh install, follow the device language when supported; otherwise default to Haitian Creole, and keep language switching readily accessible.
- Accepted: Translate product descriptions only when requested, label the translation, and leave the original accessible.
- Accepted: Do not silently replace chat messages with translations. Offer per-message translation with access to the original, especially for prices and order terms.
- Cross-domain note: This preserves the app-wide supported-language set, the user's synchronized language preference, and the prior decision that sellers may publish in any supported language without mandatory translation.

### Batch 5 — APP-Q013–APP-Q015 (2026-10-02)

- Accepted: Account closure is self-service after re-authentication and an impact preview.
- Accepted: Closure immediately prevents new marketplace activity but preserves limited access to settle open orders, disputes, payouts, subscriptions, or balances before final closure.
- Accepted: Remove public profile/listings after closure while preserving relevant counterpart order/chat context and only necessary operational/legal records under appropriate retention rules.

### Batch 6 — APP-Q016–APP-Q018 (2026-10-02)

- Accepted: Offer users a self-service data export before closure, excluding other people's private information and credentials.
- Accepted: Provide a short undo window; stop new activity immediately, but delay final irreversible deletion until the window ends and outstanding obligations are resolved.
- Accepted: Preserve transaction-relevant messages in counterpart chat history after closure, show a closed-account state, and retain identity snapshots only where an existing order/receipt requires them.
- Cross-domain note: Preserve order records, counterpart access, and the agreed payment/dispute obligations; closure must not erase or mutate a transaction in progress.

### Batch 7 — APP-Q019–APP-Q021 (2026-10-02)

- Accepted: Keep Buying and Selling as separate order-workspace views with shared visual patterns and an obvious switch.
- Accepted: Show active orders first, put time-sensitive actions first among them, and place completed/canceled orders under History.
- Accepted: Show buyer and seller the same transaction event timeline with timestamps, excluding private support/moderation notes and another party's private evidence.

### Batch 8 — APP-Q022–APP-Q024 (2026-10-02)

- Accepted: Use role-aware, plain-language status wording that explains whose turn it is while keeping the underlying order state consistent.
- Accepted: Display payment and fulfillment as distinct progress tracks alongside one concise overall status.
- Accepted: Provide an in-app order receipt with an export/share option. Include agreed product/variant, amount, applicable fees, payment/fulfillment outcome, and seller identity snapshot; never expose PINs or other secrets.

### Batch 9 — APP-Q025–APP-Q027 (2026-10-02)

- Accepted: Provide order status/date filters and search by item, counterparty, or order reference; never index payment secrets or sensitive evidence for search.
- Accepted: Keep one persistent Inbox conversation reachable from order details; Orders remains canonical for order state.
- Accepted: Keep consequential order actions per-order in v1; only safe reversible housekeeping may be considered for bulk action.
- Cross-domain note: Link conversation context without duplicating order records or bypassing transaction safeguards.

### Batch 10 — APP-Q028–APP-Q030 (2026-10-02)

- Accepted: Summarize item/quantity, counterparty, total/payment status, fulfillment, current status, and next deadline/action on order cards; omit sensitive payment details.
- Accepted: Give each participant private order notes, clearly labeled and invisible to the counterpart.
- Accepted: Allow archiving completed/canceled orders from the default view while retaining them in History; unresolved actions stay accessible.

### Batch 11 — APP-Q031–APP-Q033 (2026-10-02)

- Accepted: Unconfirmed order actions leave state unchanged; briefly preserve draft input for resumption without treating drafts as commitments.
- Accepted: Show shared order changes in an append-only timeline with actor and timestamp; exclude private notes and staff-only records.
- Accepted: Preserve terms/revisions during disagreements and offer review/reporting, without automatic fault decisions.

### Batch 12 — APP-Q034–APP-Q036 (2026-10-02)

- Accepted: Material changes to accepted price, quantity, or fulfillment require counterpart acceptance; retain original terms.
- Accepted: Show and confirm payment differences after approved changes; no silent charges, refunds, or balance edits.
- Accepted: Provide one current “Agreed terms” summary plus earlier versions.

### Batch 13 — APP-Q037–APP-Q039 (2026-10-02)

- Accepted: Show confirmed meetup details in order fulfillment, including location name and map link, visible to participants.
- Accepted: Snapshot confirmed meetup terms so later profile/settings edits cannot alter an existing order.
- Accepted: Replace a meetup place only by proposal and counterpart confirmation; preserve the prior agreement.
- Cross-domain note: Fits existing meetup proposal/counter and privacy decisions; general rescheduling remains back-pocket.

### Batch 14 — APP-Q040–APP-Q042 (2026-10-02)

- Accepted: Offer voluntary “On my way” / “I’m here” coordination cues, without live tracking or required location sharing.
- Accepted: Proximity unlocks the handoff step as a helpful signal, not proof of receipt/delivery.
- Accepted: Both parties must confirm handoff completion; one confirmation leaves the order pending.

### Batch 15 — APP-Q043–APP-Q045 (2026-10-02)

- Accepted: Explain handoff steps ahead of time; reveal one-time code only when proximity unlocks the flow.
- Accepted: Require connectivity to finalize handoff; retain pending state and retry rather than claiming offline success.
- Accepted: Show each participant's confirmation state without location exposure or blame.

### Batch 16 — APP-Q046–APP-Q048 (2026-10-02)

- Accepted: Lateness alone does not assign fault; show agreed meetup window and voluntary arrival cues while order stays pending.
- Accepted: Make “Can't make it” available before completion; notify counterpart and offer support without silent order/payment changes.
- Accepted: Expired meetup window without mutual completion becomes “Meetup unresolved”; no automatic completion, refund, or fault assignment.
- Cross-domain note: Existing one-hour meetup allowance stands; rescheduling remains back-pocket.

### Batch 17 — APP-Q049–APP-Q051 (2026-10-02)

- Accepted: History cards show outcome, item, date, and counterpart, with full timeline/receipt available.
- Accepted: Keep canceled, unresolved, completed, and reviewed-dispute outcomes distinct.
- Accepted: Keep disputed orders active as “Under review” until resolved; then move to History with outcome/timeline.

### Batch 18 — APP-Q052–APP-Q054 (2026-10-02)

- Accepted: Orders cannot be deleted from personal history; archive from the default view while retaining transaction record.
- Accepted: Keep timeline accessible while account exists, subject to retention/closure obligations; access does not require excess retention.
- Accepted: If details are removed/anonymized, preserve minimum accurate counterpart facts and label unavailable details.
- Cross-domain note: Apply account-closure/privacy rules and retain only legally/operationally necessary data.

### Batch 19 — APP-Q055–APP-Q057 (2026-10-02)

- Accepted: Allow a proposed unavailable-line removal with recalculated total only after buyer approval; retain original terms.
- Accepted: Use a shared item/quantity checklist before the parties confirm multi-item handoff.
- Accepted: Keep each multi-item order to one agreed meetup/handoff in v1.

### Batch 20 — APP-Q058–APP-Q060 (2026-10-02)

- Accepted: Default search ranking prioritizes relevance and useful listing-quality signals, with transparent sorting; no undisclosed paid priority.
- Accepted: Sync recent search history for signed-in users with clear erase control; guest history remains on device.
- Accepted: Suggest spelling/category/filter refinements without silently changing query or constraints.

### Batch 21 — APP-Q061–APP-Q063 (2026-10-02)

- Accepted: Browse cards show price, condition, broad location, and relevant seller trust signals while remaining scannable.
- Accepted: Put disclosed condition notes/flaws near condition and before the purchase action.
- Accepted: Offer lightweight comparison for up to three listings, focused on price, condition, location, and seller trust.
- Cross-domain note: These buyer-facing choices complement seller condition disclosure and public profile trust signals without reopening them.

### Batch 22 — APP-Q064–APP-Q066 (2026-10-02)

- Accepted: Let buyers enter a broad category and refine into subcategories while preserving back navigation and filter context.
- Accepted: When a shared listing is unavailable, explain its current state and offer similar listings or seller profile where appropriate.
- Accepted: Listing shares should offer a privacy-safe public preview and app/web entry path without exposing private account details.

### Batch 23 — APP-Q067–APP-Q069 (2026-10-02)

- Accepted: Use relevant first-party activity for recommendations; explain personalization and provide reset/reduce controls; do not infer sensitive traits.
- Accepted: Provide lightweight “show more/less like this” tuning with undo.
- Accepted: Promoted listings may appear if labeled, relevant, safety-compliant, and organic listings remain visible.

### Batch 24 — APP-Q070–APP-Q072 (2026-10-02)

- Accepted: Enable low-risk first-party personalization by default for signed-in users with a visible opt-out; no sensitive inference or cross-app tracking.
- Accepted: Explain recommendation reasons briefly when useful and offer a direct “less like this” control.
- Accepted: For new users, use broad popular/recent listings and explicitly chosen context without pretending to personalize.
- Cross-domain note: Preserve user controls in Settings and distinguish explicit saves/searches from inferred recommendation signals.

### Batch 25 — APP-Q073–APP-Q075 (2026-10-02)

- Accepted: Turning personalization off immediately stops its use in ranking; clearing recommendation signals is a separate choice from clearing operational records.
- Accepted: Reset inferred recommendation signals independently; preserve explicit saved items and search history unless separately cleared.
- Accepted: Guests may tune recommendations temporarily on-device, with persistence limitations explained.

### Batch 26 — APP-Q076–APP-Q078 (2026-10-02)

- Covered (not counted): Saved-price display and opt-in per-listing price-change alerts were already decided in AGENTS.md Add Product Discovery; Philippe reaffirmed item-level opt-in.
- Accepted: Keep a saved listing visible when reserved/unavailable, disable purchase action, and allow availability-state push updates; restore action when available.
- Accepted: Allow individual removal and “clear unavailable” with Undo; this only changes the buyer's Saved list.

### Batch 27 — APP-Q079–APP-Q081 (2026-10-02)

- Covered (not counted): Whether price-drop alerts are opt-in was already settled in Add Product Discovery; no new policy.
- Accepted: Offer a separate per-item “notify me when available” opt-in; saving alone does not subscribe to return-to-stock pushes.
- Accepted: Saving is a bookmark, not an inventory reservation; reserve only at the established order commitment point and explain availability may change.

### Batch 28 — APP-Q082–APP-Q084 (2026-10-02)

- Accepted: Account recovery requires a verified channel and risk checks; support must not bypass ownership checks based only on profile/KYC facts.
- Accepted: Changing email requires re-authentication and verification of the new address; notify the old address where possible and review active sessions.
- Accepted: Let users review/revoke sessions and sign out other devices without exposing sensitive device fingerprints.
- Checkpoint: 81 unique answers was crossed at APP-Q083; APP-Q084 brought the total to 82 before this checkpoint update.

- Back pocket (cross-linked to AGENTS.md): Create a dedicated support website/portal for case handling; evaluate Mistral AI API assistance for handling multiple users/cases per session, with human accountability and privacy policies still to be designed.

### Batch 29 — APP-Q085–APP-Q087 (2026-10-02)

- Accepted: On slow/intermittent connections, load text and essential controls first, size image previews appropriately, and show clear retry states.
- Accepted: Keep listing details visible when images fail; use neutral placeholder/retry and never imply missing media depicts the product.
- Accepted: Allow cached viewed/saved content offline with stale-data labeling; disable ordering until online price/availability verification.

### Batch 30 — APP-Q088–APP-Q090 (2026-10-02)

- Accepted: Honor system text scaling throughout and prevent clipping; add an in-app size control only if needed.
- Accepted: Never encode status by color alone; pair with labels/icons/patterns and readable contrast.
- Accepted: Make core web marketplace actions keyboard-operable with logical focus order, visible focus, and keyboard-dismissable overlays.

### Batch 31 — APP-Q091–APP-Q093 (2026-10-02)

- Accepted: Show estimated seller response time only with adequate recent data, label it clearly, and avoid penalizing new/low-volume sellers.
- Accepted: Keep online/last-active status off by default; any future status is opt-in and coarse.
- Accepted: Permit an optional expiring seller “away” note; do not imply orders are paused or listings hidden unless seller actually pauses them.
- Checkpoint: The 90th unique answer was APP-Q092; APP-Q093 brings progress to 91.

### Batch 32 — APP-Q094–APP-Q096 (2026-10-02)

- Accepted: The seller verification badge means identity was checked by MaurMaket; it does not guarantee product authenticity, endorse a seller, or promise transaction outcomes.
- Accepted: Badge tap opens a concise explanation and verification-policy link; private KYC material remains hidden.
- Accepted: Preserve verification state snapshots for historical order/review context while showing current seller status on the profile.

### Batch 33 — APP-Q097–APP-Q099 (2026-10-02)

- Accepted: Sync signed-in carts across devices; keep guest carts device-local; carts do not reserve stock.
- Accepted: Allow one-action Cart → Saved; revalidate price/availability at checkout.
- Accepted: Group multi-seller cart items by seller, show subtotals, and disclose seller-specific fulfillment/payment requirements before confirmation.

### Batch 34 — APP-Q100–APP-Q102 (2026-10-02)

- Accepted: Let signed-in users save/edit/delete private searches with chosen filters.
- Accepted: New saved-search matches notify in-app/daily-summary by default; immediate push is opt-in per search.
- Accepted: Notify at most once per listing per saved search; meaningful later availability/changes use the separate item-alert path.
- Checkpoint: The 99th unique answer was APP-Q101; APP-Q102 brings progress to 100.

### Batch 35 — APP-Q103–APP-Q105 (2026-10-02)

- Accepted: Saved searches can be paused/resumed without deleting query/filter state.
- Accepted: Edit saved-search criteria in place, preserving alert settings; edits apply to future matches.
- Accepted: Never silently delete stale saved searches; retain until user deletes and optionally label inactive.

### Batch 36 — APP-Q106–APP-Q108 (2026-10-02)

- Accepted: Muting a seller does not remove their listings from intentional/manual search.
- Accepted: Suppress saved-search alerts from muted sellers while leaving manual results available.
- Accepted: Suppress blocked sellers from ordinary discovery and saved-search alerts in line with block policy.

### Batch 37 — APP-Q109–APP-Q111 (2026-10-02)

- Accepted: Hide blocked sellers' listings from active Saved/discovery while blocked, but preserve bookmark state for possible restoration after unblock.
- Accepted: Blocking does not erase past order history/receipts; preserve records needed by each participant while blocking new non-order contact.
- Accepted: Permit self-service unblock without notifying the other user; following or messaging again remains a separate action.
- Checkpoint: The 108th unique answer was APP-Q110; APP-Q111 brings progress to 109.

### Batch 38 — APP-Q112–APP-Q114 (2026-10-02)

- Accepted: DOB changes after signup require a re-authenticated correction request and auditable review, rather than direct silent editing.
- Accepted: After review, verified identity-document DOB determines age eligibility; flag discrepancies and never silently overwrite user-provided signup data.
- Accepted: During a DOB/age review, restrict only actions whose eligibility is uncertain; keep account and support access available with a private explanation and appeal route.

### Batch 39 — APP-Q115–APP-Q117 (2026-10-02)

- Accepted: Offer passkeys as an optional sign-in method where supported; keep other sign-in paths.
- Accepted: Permit biometrics for local unlock of an existing trusted-device session, not as server authentication or KYC proof.
- Accepted: Require step-up authentication for high-impact account, recovery, payout-destination, or security changes; never request a MonCash/NatCash PIN.
- Cross-domain note: Authentication friction should rise with account risk without conflating local device biometrics, identity verification, and payment-provider credentials.

### Batch 40 — APP-Q120–APP-Q122 (2026-10-02)

- Accepted: A seller review reply sends one in-app activity notification to its author; no immediate push by default, and the reply remains a single response rather than a thread.
- Accepted: Let a buyer delete their published review; remove it from public display and averages while retaining only minimum private audit/order evidence needed for integrity and policy.
- Accepted: Offer on-demand review translation, clearly labeled, while preserving the original text.
- Covered (not counted): APP-Q118 and APP-Q119 repeated established review moderation/privacy and visible edit-label decisions from the Profile & Settings section of AGENTS.md.
- Checkpoint: The 117th unique answer was APP-Q121; APP-Q122 brings progress to 118.

### Batch 41 — APP-Q123–APP-Q125 (2026-10-02)

- Accepted: Give every support request a private case view with a reference, current status, latest update, and next expected step.
- Accepted: Let users add timestamped evidence/context to the same case; label user-provided material as unverified where MaurMaket cannot independently confirm it.
- Accepted: Show honest response-window estimates based on case priority, update them when delayed, and do not promise a resolution deadline the team cannot guarantee.
- Cross-domain note: These case-experience decisions complement the separate support website/Mistral back-pocket tooling idea and existing order-specific evidence rules; they do not define a support staffing SLA or who decides a dispute.

### Batch 42 — APP-Q126–APP-Q128 (2026-10-02)

- Accepted: Keep Support messages and user follow-up inside the same private case history, separate from marketplace conversations.
- Accepted: Tell a reported participant what behavior needs a response and provide only necessary evidence; protect the reporter's contact details and unrelated private material.
- Accepted: If Support is waiting on a user, send one reminder, then place the case in a waiting/paused state or close it with a clear reopen path; silence is not evidence of fault.
- Cross-domain note: Keep case administration separate from the order's shared timeline; disclose enough for a fair response without revealing private reporter/staff data.

### Batch 43 — APP-Q129–APP-Q131 (2026-10-02)

- Accepted: Use a small set of plain-language issue categories to support case routing; users can correct the category and Support can reroute without requiring a new request.
- Accepted: Close cases with a concise user-facing outcome, key reason, and next step while protecting staff notes and third-party private data.
- Accepted: Allow one second review for new evidence or a clear process concern, routed to a different reviewer where practical.
- Deferred/back pocket: Evaluate Mistral-assisted support intake categorization and case routing; keep human review/accountability and privacy safeguards, and do not make AI the final case decision-maker.
- Cross-domain note: Automated intake assistance may organize cases but cannot determine fault or replace the human second-review path.

### Batch 44 — APP-Q132–APP-Q134 (2026-10-02)

- Accepted: Expose clear control names, roles, values, and current states to screen readers; verify key flows with assistive technology.
- Accepted: Announce meaningful results/state changes without interrupting users for routine background refreshes.
- Accepted: Provide concise product-photo descriptions where available; keep ordinary-photo descriptions optional and guide sellers to describe material condition, variant, and safe-use details.
- Cross-domain note: These add screen-reader behavior not settled by prior text-scaling, contrast, or keyboard-access decisions.

### Batch 45 — APP-Q135–APP-Q137 (2026-10-02)

- Accepted: Provide a searchable/list-based alternative to map pan/drag for discovery and place selection, preserving the same area and mutual-confirmation rules.
- Accepted: Make identity-verification camera steps accessible with spoken/screen-reader guidance and specific retake instructions; provide human support for barriers without weakening verification.
- Accepted: Give time-sensitive tasks accessible remaining-time and absolute-deadline text; announce meaningful changes without a ticking timer and preserve agreed reminders.

### Batch 46 — APP-Q138–APP-Q140 (2026-10-02)

- Accepted: Use haptics only as restrained supplemental feedback, respect device settings, and never rely on vibration alone.
- Accepted: Target 44–48 dp touch targets for frequent/core mobile controls with enough spacing to avoid adjacent accidental taps.
- Accepted: Keep consequential errors and required next steps visible until resolved/dismissed; reserve short toasts for low-impact confirmations.
- Checkpoint: The 135th unique answer was APP-Q139; APP-Q140 brings progress to 136.
- Cross-domain note: Accessibility applies across map, identity verification, urgent tasks, and general product feedback, not only profile/feed controls.

### Batch 47 — APP-Q141–APP-Q143 (2026-10-02)

- Accepted: Annotate listing/message content language for screen readers where supported; keep navigation and controls in the selected interface language.
- Accepted: Offer on-demand automated voice-message transcripts, clearly labeled, while preserving access to the original recording.
- Accepted: Let sellers edit listing-image accessibility descriptions after publication; use normal review only if material claims or safety details change.

### Batch 48 — APP-Q144–APP-Q153 (2026-10-02)

- Accepted: Show sent/delivered/read message states; make ordinary-chat read receipts configurable while retaining order-event records.
- Accepted: Show a temporary animated WhatsApp-style typing bubble while composing; motion should be subtle and respect Reduce Motion, with no persistent online/last-seen state.
- Accepted: Permit short-window message edits with an edited label and short-window unsend for ordinary chat; preserve order terms and evidence in immutable records.
- Accepted: Search within a user's conversation history; offer optional privacy-safe link previews; support image and voice attachments with validation, progress, and retry.
- Accepted: Provide per-conversation mute, archive, and a small capped set of pinned conversations; preserve active order access and deadlines.
- Checkpoint: The 145th unique answer was APP-Q149; the ten-question round ended at 149.
- Cross-domain note: Keep conversation convenience features subordinate to canonical order state, notification urgency, privacy, and auditable transaction terms.

### Batch 49 — APP-Q154–APP-Q163 (2026-10-02)

- Accepted: Route first-contact messages to a lightweight Requests area with listing/order context; acceptance moves the chat to Inbox, while urgent existing-order communication stays direct.
- Accepted: Allow reports on a specific message with nearby private context; a single report does not cause an automatic penalty. Keep important message bookmarks private and never treat them as canonical order terms.
- Accepted: Support explicit one-time place pins, not live location; confirmed meetup details stay in the order. Warn about likely sensitive payment credentials without blocking ordinary contact details or broadly scanning chats.
- Accepted: Keep ordinary chat images available rather than expiring them automatically; order evidence follows case-retention rules. Add unread-only filtering and synced personal mark-unread reminders without changing the other participant's receipts.
- Deferred/back pocket: Voice/video calls and multi-person/staff group chats; keep V1 one-to-one and preserve auditable text/voice-message communication.
- Checkpoint: The 154th unique answer was APP-Q158; APP-Q163 brings progress to 159.
- Cross-domain note: Request handling must fit the established messaging badge/notification boundaries, block/report safeguards, location consent, and canonical order records.

### Batch 50 — APP-Q164–APP-Q173 (2026-10-02)

- Accepted: A pending request shows the sender's chosen public identity and relevant listing/order context, not private account/KYC data. Recipients can Accept, Delete, or Report, with Block in overflow; request acceptance does not auto-follow.
- Accepted: No read receipt before acceptance; allow one concise initial message and hold follow-ups; do not allow attachments or formal offers until the request is accepted.
- Accepted: Do not silently expire requests quickly; stale requests may be archived after a clear period with a restore path. Decline/delete should show a neutral sender status without revealing whether they were reported/blocked.
- Accepted: Keep ordinary chat privacy and Inbox organization clear with a separate Requests unread count. Urgent existing-order communication remains direct.
- Checkpoint: The 163rd unique answer was APP-Q167; APP-Q173 brings progress to 169.
- Cross-domain note: Request controls preserve consent and safety while separating incoming contact from accepted chats, offers, and urgent order work.

### Batch 51 — APP-Q174–APP-Q183 (2026-10-02)

- Accepted: Consider private buyer and seller reliability summaries only in a relevant offer/order context, with enough platform-recorded history; never publish buyer scores or place the signals on broad discovery cards.
- Accepted: Exclude unverified claims, self-reported NatCash transfers, and unresolved disputes/reports. Require a meaningful sample before showing any signal; show “New on MaurMaket” or nothing when history is insufficient.
- Accepted: Use broad, plain-language bands with sample size rather than precise scores; explain inputs/exclusions without revealing other users' private orders.
- Accepted: Provide a Support correction path and apply no automatic penalty while an accuracy concern is reviewed; preserve the order record.
- Checkpoint: The 172nd unique answer was APP-Q176; APP-Q183 brings progress to 179.
- Cross-domain note: This materially extends the existing Profile & Settings decision that buyer history is private and any later buyer reputation must be aggregated; it does not make the signal public or determine payment/dispute outcomes.

### Batch 52 — APP-Q184–APP-Q193 (2026-10-02)

- Accepted with clarification: Offline text messages remain visibly queued and send automatically when connectivity returns unless the sender deletes them; do not require an extra retry tap.
- Accepted with clarification: Use WhatsApp-style check marks with distinct queued/sent/delivered/read meanings, consistent with the user's read-receipt setting.
- Accepted: Prevent duplicate sends with stable message identifiers; preserve compose order; allow queued messages to be edited/discarded before server acceptance; keep queued content on the originating device until accepted.
- Accepted: Preserve queued drafts and attachments through app restart/connection loss where possible using protected local storage; keep clear unsent state; sync read state only after reconnection and under the receipt preference.
- Checkpoint: The 181st unique answer was APP-Q185; APP-Q193 brings progress to 189.
- Cross-domain note: This is a linked messaging-specific extension of prior slow-network browse and offline-handoff decisions. A chat may queue/send messages on reconnect; an order handoff/payment must never be finalized from offline client state.

### Batch 53 — APP-Q194–APP-Q204 (2026-10-02)

- Accepted: Add an optional user-controlled Low Data mode; under it, stop nonessential offscreen preloading, load lightweight image previews before full photos, and require taps for chat-image downloads and voice playback.
- Accepted: On mobile data, disclose large seller photo-upload size and ask before starting; use disclosed compression that preserves product details. Pause nonessential background media work with visible progress and user-controlled resume.
- Accepted: Use lighter map tiles/previews in Low Data mode, preserve search/list alternatives and exact confirmed-order location precision, and avoid broad background map caching.
- Covered (not counted): APP-Q199 repeated the settled Feed & Explore decision that V1 media is still product imagery and short-video upload/playback is out of scope; APP-Q204 replaced it.
- Checkpoint: The 190th unique answer was APP-Q194; APP-Q204 brings progress to 199.
- Cross-domain note: Low Data mode qualifies existing Feed preloading, image handling, voice attachments, seller uploads, and map use while keeping core task/status visibility and marketplace accuracy intact.

### Batch 54 — APP-Q205–APP-Q215 (2026-10-02)

- APP-Q205–APP-Q211 and APP-Q213–APP-Q215 were answered; APP-Q212 was Covered and does not count. APP-Q215 replaces it.
- Philippe clarified a core access principle: **MaurMaket is intended to be available throughout Haiti.** No Haitian user or seller should be geo-blocked from joining, browsing, or publishing listings because their area is not an initial focus area.
- “Focus areas” mean where MaurMaket prioritizes local outreach, support, and marketplace-building operations. Interest signals, activity density, and completed orders may guide those investments, but must never switch access on/off or exclude residents elsewhere.
- Actual transaction fulfillment remains dependent on available delivery/meetup arrangements, seller radius, and buyer/seller agreement. That is a transaction-level feasibility constraint, not a regional access restriction.
- Local-interest collection is optional, limited to broad commune/area and optional broad categories, with opt-out and limited retention. It does not promise availability or change the user's access.
- Checkpoint: APP-Q214 was the 208th unique answer. APP-Q215 brings total progress to 209. The next nine-answer checkpoint is APP-Q224 (the 217th answer).

### Batch 55 — APP-Q216–APP-Q225 (2026-10-02)

- Accepted: Make marketplace search resilient to common accent/spelling variants; localize category and attribute labels over shared catalog values; keep listing originals visible with on-demand translation.
- Accepted: Display Haitian gourdes consistently with clear grouping, use whole-gourde amounts unless a payment method requires finer precision, and never silently round a payable total.
- Accepted: Localize dates and follow the device's time format while keeping meetup deadlines unambiguous.
- Accepted: Format Haitian phone numbers with +509 and readable grouping while minimizing exposure of private numbers; use familiar local commerce language consistently across supported app languages.
- Accepted: Render system-generated order/notification history in the selected app language while preserving user-authored text in its original language and offering translation.
- Checkpoint: APP-Q224 was the 218th unique answer (nine answers since the prior checkpoint at APP-Q214); APP-Q225 brings progress to 219. The next checkpoint is the 228th answer, APP-Q234.
- Cross-domain note: Localization applies at presentation and search layers; canonical catalog values, money amounts, order terms, and original user-authored content remain intact.

### Batch 56 — APP-Q226–APP-Q235 (2026-10-02)

- Accepted: Add a cross-role “Needs your action” view without replacing Buying/Selling tabs; count action-needed orders separately from total active orders.
- Accepted: Preserve each role tab's filter and scroll position; make waiting-on-counterparty states calm and clear about who acts next.
- Accepted: Update order lists live when possible; offline state must show cached freshness and disable actions requiring current server state.
- Accepted: Put only low-risk actions on list cards; highlight updates subtly without unexpected reordering and respect reduced motion.
- Accepted: Open long timelines to recent events with a path to expand the full shared history.
- Checkpoint: APP-Q234 was the 228th unique answer (nine answers since APP-Q224); APP-Q235 brings progress to 229. The next checkpoint is the 238th answer, APP-Q244.
- Cross-domain note: These are Orders workspace presentation decisions only; they do not change accepted order terms, payment/fulfillment timing, meetup rules, disputes, or the canonical shared timeline.

### Batch 57 — APP-Q236–APP-Q245 (2026-10-02)

- Accepted: Surface seller promotions discreetly on eligible listings and storefronts; in multi-seller carts, scope each seller's code to their own eligible merchandise and allow one code per seller.
- Accepted: Restrict v1 discounts to eligible merchandise (not delivery); do not stack seller promo codes with accepted negotiated prices by default.
- Accepted: Disclose minimums, expiry, usage limits, and other conditions clearly. If a code becomes invalid, explain why and require buyer confirmation of the changed total.
- Accepted: Itemize promo attribution in checkout/order/receipt; show sellers aggregate redemption, eligible sales, and discount totals without buyer identities.
- Accepted: Support scheduled start/end times with local-time clarity and immediate-start choice.
- Checkpoint: APP-Q244 was the 238th unique answer (nine answers since APP-Q234); APP-Q245 brings progress to 239. The next checkpoint is the 248th answer, APP-Q254.
- Cross-domain note: Promo-code discovery in-app is distinct from promoted-listing ranking and promotional-push opt-in. Existing Business-tier entitlement remains unchanged.

### Batch 58 — APP-Q246–APP-Q255 (2026-10-02)

- Accepted: Separate withdrawable MonCash funds, pending/held platform funds, and seller-confirmed NatCash sales in Seller Tools. NatCash remains a direct-sale figure, not MaurMaket-held or withdrawable funds.
- Accepted: Itemize per-entry arithmetic using existing fee rules; preserve original financial records and add linked adjustments/holds rather than rewriting history.
- Accepted: Show a recent-period finance summary and newest-first activity with type filters; preserve existing tier access to advanced analytics.
- Accepted: Preview payout amount, agreed fees, net/charge, masked destination, and known timing caveats. Keep external MonCash operations pending until confirmed; never treat a redirect/return as success.
- Accepted: Protect payout destination changes with the existing fresh-auth requirement and destination verification; route failures through stable references and Support, and allow retry only when the previous attempt is known not to have completed.
- Accepted: Provide date-range statements with clearly separated MonCash settlement and seller-confirmed NatCash activity.
- Checkpoint: APP-Q254 was the 248th unique answer (nine answers since APP-Q244); APP-Q255 brings progress to 249. The next checkpoint is the 258th answer, APP-Q264.
- Cross-domain note: This round records Seller Tools presentation and transaction history only. Previously agreed MonCash/NatCash fees, external-step assumptions, withdrawal rules, refunds, debt, and seller-tier analytics entitlements are unchanged.

### Batch 59 — APP-Q256–APP-Q265 (2026-10-02)

- Accepted: Use idempotency for consequential marketplace creates/commits beyond existing message/payment protections, including orders, reservations, reviews, and reports; return the original result on duplicate retry.
- Accepted: Resolve last-unit reservation races atomically on the server and clearly tell losing attempts that the item is unavailable.
- Accepted: Revalidate critical server state before consequential actions; explain changed data and require renewed confirmation for changed price, availability, or terms.
- Accepted: Show service-specific degraded-state guidance and safe alternatives while leaving unrelated app areas usable; provide a lightweight public status page for broad incidents.
- Accepted: Protect critical records with encrypted backups, documented recovery targets, and scheduled restore drills.
- Accepted: Alert a human to sustained failures and data-integrity/security risks affecting payments, orders, verification, or broad access; tune thresholds to limit noise.
- Accepted: Restrict staff production-data access by least privilege, record reason-coded audit logs, and review access periodically.
- Accepted: Roll out risky features gradually behind server-controlled flags, monitor behavior, and preserve transaction records during rollback.
- Accepted: Gate only unsafe affected actions when an app version is too old; preserve read access and Support where possible.
- Checkpoint: APP-Q258 was the 258th unique answer, nine answered questions after the prior checkpoint at APP-Q254. APP-Q265 brings progress to 259. The next checkpoint is the 268th answer, APP-Q274.
- Cross-domain note: These reliability controls protect previously settled order, inventory, payment, verification, and offline behaviors; they do not alter transaction policy or fee rules.

### Batch 60 — APP-Q266–APP-Q275 (2026-10-02)

- Accepted: Keep raw identity images only while an active review/appeal needs them, then delete them; do not retain raw evidence indefinitely.
- Accepted: After image deletion, retain only minimum decision-relevant fields/status and reason codes needed to explain the decision or prevent abuse, not full OCR text.
- Accepted: Apply a stated, purpose-limited retention period to KYC evidence/derived records after account closure where unresolved cases or obligations remain, then delete or irreversibly de-identify.
- Accepted: Let users see submitted-data categories, verification status, and retention/deletion state; keep internal risk signals and reviewer notes private.
- Accepted: Provide explicit correction/review for incorrectly extracted identity fields without silently overwriting submitted evidence; this extends generic identity correction, not the previously settled DOB/age-conflict flow.
- Accepted: Use proportionate attempt limits/cooldowns with clear wait times and human Support for genuine capture/technical barriers.
- Accepted: Protect abandoned local verification drafts, offer discard controls, and automatically clean them up after a short disclosed period.
- Accepted: A lost/compromised identity document triggers private review and proportionate high-risk-action limits, with no public label or automatic blame.
- Accepted: Require re-verification only after meaningful risk signals or material identity changes, not on an arbitrary recurring schedule.
- Accepted: Provide private assisted review and alternate-evidence guidance for damaged/unreadable documents without weakening identity assurance.
- Checkpoint: APP-Q268 was the 268th unique answer, nine answered questions after the prior checkpoint at APP-Q258. APP-Q275 brings progress to 269. The next checkpoint is the 278th answer, APP-Q284.
- Cross-domain note: These policies govern sensitive KYC evidence lifecycle and user transparency. They preserve mandatory seller verification, existing age-eligibility review, accessible camera capture, current public badge meaning, and the prior rejection/resubmission path.

### Batch 61 — APP-Q276–APP-Q285 (2026-10-02)

- Accepted: Provide a private multi-destination address book with built-in and custom labels; allow an optional default but visibly confirm the destination for each order.
- Accepted: Represent Haitian delivery locations with a broad area/commune, private pin, and landmark/directions; keep manual entry available and request precise device location only after the user asks to use it.
- Accepted: Do not automatically save a one-time delivery destination; make saving explicit.
- Accepted: Allow delivery to another recipient with an optional name/contact, disclose it only to the relevant seller, and default to in-app contact unless the buyer explicitly shares their number for that delivery.
- Accepted: In a multi-seller checkout, each seller sees only address and recipient details needed for their own sub-order.
- Accepted: Sync saved addresses privately for signed-in users; keep guest/temporary destinations device-local until explicitly saved.
- Checkpoint: APP-Q284 was the 278th unique answer, nine answers after the prior checkpoint at APP-Q274. APP-Q285 brings progress to 279. The next checkpoint is the 288th answer, APP-Q294.
- Cross-domain note: Address-book decisions extend the already settled Delivery Settings location and private order-location rules. They do not change seller radius, mutual fulfillment agreement, confirmed order snapshots, or the public seller discovery map.

### Batch 62 — APP-Q286–APP-Q295 (2026-10-02)

- Accepted: Define listing detail views with short-window deduplication and bot filtering; show no viewer identities.
- Accepted: Show current saved count with optional period trend; keep savers anonymous.
- Accepted: Distinguish browse/search impressions from listing detail opens.
- Accepted: Let sellers rank products separately by completed sales, views, or saves.
- Accepted: Offer simple time-period comparisons against the prior equivalent period, not seller-to-seller rankings.
- Accepted: Provide optional, clearly defined conversion rates only with enough data to avoid false precision.
- Accepted: Do not reveal buyer-level geography; any future geographic insight must be broad and aggregated above a privacy threshold.
- Accepted: Defer competitor rankings; consider only large, anonymous cohort benchmarks later.
- Accepted: Offer explainable, optional listing-performance suggestions that never automatically edit a listing.
- Accepted: Keep performance insights in Seller Tools; an opt-in digest may summarize them, but avoid instant low-value pushes.
- Checkpoint: APP-Q288 was the 288th unique answer, nine answers after the prior checkpoint at APP-Q284. APP-Q295 brings progress to 289. The next checkpoint is the 298th answer, APP-Q304.
- Cross-domain note: These choices refine the previously agreed availability of approximate views/saves and tier-gated advanced analytics without changing tier entitlements, financial reports, promotional-code metrics, or buyer privacy.

### Batch 63 — APP-Q296–APP-Q305 (2026-10-03)

- Accepted: Business sellers may show optional weekly hours in Haiti local time; these are informational and do not gate messages/orders.
- Accepted: Allow an optional scheduled closure notice with an end date, without silently changing active orders.
- Accepted: Business About may include a concise FAQ and informational return/inspection/delivery policies; MaurMaket rules and mutually accepted order terms remain authoritative.
- Accepted: Keep in-app messaging primary; a limited, clearly labeled external website link may be allowed after safety review, without suggesting off-platform payments are protected.
- Accepted: Add optional seller-created named collections within Listings for Business; everyone retains basic category filters.
- Accepted: Allow one optional expiring storefront notice; no promotional push or changes to active commitments.
- Accepted: Keep the shared accessible visual system; logos/photos provide branding and custom themes remain deferred.
- Checkpoint: APP-Q304 was the 298th unique answer, nine answers after the prior checkpoint at APP-Q294. APP-Q305 brings progress to 299. The next checkpoint is after nine additional unique answers.
- Cross-domain note: These storefront utilities complement the settled one-store V1, public identity, profile order, seller pause, and accepted-order rules. The next round concerns share-link behavior and must preserve public listing privacy, inventory truth, localization, auth boundaries, and deep-link continuity.

### Batch 64 — APP-Q308–APP-Q315 (2026-10-03)

- Covered, not counted: APP-Q306 repeated the public share preview/app-web path in APP-Q066; APP-Q307 repeated unavailable-link handling in APP-Q065.
- Accepted: Render shared listing previews in the recipient's selected/device language when supported, with original text accessible and language labeled.
- Accepted: For listings paused or unpublished after sharing, honor current visibility and do not expose withdrawn details; this is a privacy-specific linked follow-up to APP-Q065.
- Accepted: Keep share analytics aggregate and do not identify recipients or access address books.
- Accepted: Open listing links in the app when installed and routing succeeds, otherwise use a browser fallback; preserve a valid listing destination across install/sign-in.
- Accepted: Use the native share sheet, stable MaurMaket listing URLs, and concise preview content with current public price and primary photo.
- Accepted: No per-listing share-disable switch in v1; sellers control visibility through pause/unpublish.
- Checkpoint: APP-Q315 was the 307th unique answer, nine answers after the prior checkpoint at APP-Q304. The next checkpoint will be APP-Q324 (316 total), after nine additional unique answers.
- Cross-domain note: Sharing behavior must honor listing visibility, localization, current inventory, public data minimization, app/web routing, and existing signed-out browsing policy. Philippe also deferred a MaurMaket app-download/updates website and an in-app update-alert system to the back pocket; do not treat them as part of this round's settled share-link work.

### Batch 65 — APP-Q316–APP-Q324 (2026-10-03)

- Accepted: Referral invitations may be explored, but no cash incentives until fraud controls and sustainable economics are proven.
- Accepted: Restrict eligibility to people with no prior MaurMaket account; signup/install is not sufficient—require a completed qualifying marketplace action.
- Accepted: If rewards are offered, prefer non-cash MaurMaket value; reward both inviter and invitee only when economics allow. Explain terms, eligibility, expiry, and optionality before signup.
- Accepted: Attribute by invitee-applied code/link; do not import contacts or silently track unrelated activity.
- Accepted: Prevent self-referral through account/identity/transaction signals with human review; use a disclosed conservative cap.
- Accepted: Wait until the qualifying transaction completes and its normal risk/return window passes; disclose reversal rules for cancellations, refunds, and fraud.
- Checkpoint: APP-Q324 was the 316th unique answer, nine answers after the prior checkpoint at APP-Q315. APP-Q325 adds one more, bringing progress to 317. The next checkpoint is the 326th answer, APP-Q334.
- Cross-domain note: Any future referral program must remain optional, privacy-preserving, abuse-resistant, and economically sustainable; it cannot weaken account verification, refund rules, or order integrity.

### Batch 66 — APP-Q325 post-checkpoint answer (2026-10-03)

- Accepted: Referral rewards wait until successful transaction completion and the applicable risk/return window; disclose any reversal policy up front.
- Progress is 317; this answer followed the APP-Q324 checkpoint and is already included in the next-checkpoint count.

### Batch 67 — APP-Q326–APP-Q334 (2026-10-03)

- Accepted: Let the inviter label buyer or seller intent, while the recipient retains both roles on one account; count a buyer's completed first order or seller's completed first sale as the qualifying action.
- Accepted: One person has one referral attribution and one possible reward path; use a disclosed validity window and let invitees explicitly choose among valid codes before signup.
- Accepted: Allow referral attribution correction only before the qualifying action via confirmation/Support; never reassign silently.
- Accepted: Show inviters only coarse progress states; keep invitation activity private by default and avoid public referral rankings.
- Accepted: Do not send unsolicited repeated reminders to invitees who have not joined; allow the inviter to share again manually under the user's notification preferences.
- Checkpoint: APP-Q334 was the 326th unique answer, nine answers after the prior checkpoint at APP-Q324. APP-Q335 brings progress to 327. The next checkpoint is APP-Q344 (336 total).
- Cross-domain note: Referral UX must honor one-account identity, privacy, optionality, transparent incentives, notification preferences, and existing new-user/refund eligibility rules.

### Batch 68 — APP-Q335 post-checkpoint answer (2026-10-03)

- Accepted: If referrals pause/end, stop new eligibility, honor already-earned rewards, and clearly state whether outstanding invites remain valid.
- Progress is 327; this answer followed the APP-Q334 checkpoint and is included in the next-checkpoint count.

### Batch 69 — APP-Q337–APP-Q344 (2026-10-03)

- Covered, not counted: APP-Q336 restated the existing checkout/map decision that the buyer may cancel at any time before order completion.
- Accepted: After fulfillment begins, a buyer cancellation becomes a request for seller response or Support review; no silent order/payment mutation.
- Accepted: Sellers may cancel accepted orders they cannot fulfill, with reason, buyer notice, and preserved history; no automatic blame.
- Accepted: Distinguish unilateral cancellation from later cancellation requests; cancel only the affected seller sub-order unless the buyer chooses the whole checkout.
- Accepted: If no response arrives, preserve state, remind once, and route to an unresolved/Support path without automatic fault or refund.
- Accepted: Use neutral cancellation reasons, separately show refund progress based only on provider-confirmed status, and allow a pending request to be withdrawn before fulfillment/payment transitions.
- Checkpoint: APP-Q344 was the 335th unique answer, nine answers after the prior checkpoint at APP-Q334. APP-Q345 brings progress to 336. The next checkpoint is APP-Q354 (345 total).
- Cross-domain note: These cancellation clarifications preserve accepted order snapshots, mutual consent for material changes, seller-scoped multi-order flows, existing MonCash/NatCash settlement distinctions, and no-fault handling for unresolved events.

### Batch 70 — APP-Q345 post-checkpoint answer (2026-10-03)

- Accepted: Review repeated cancellation patterns privately; distinguish user's conduct from counterpart/provider failures and require human review before restrictions.
- Progress is 336; this answer followed the APP-Q344 checkpoint and is included in the next-checkpoint count.

### Batch 71 — APP-Q346–APP-Q355 device compatibility (2026-10-03)

- Accepted: Android is the launch priority; iOS is not ruled out. Keep device support broad and reliable, with no Haitian-region access gate.
- Accepted: Prioritize core flows on lower-powered phones, lean install size, Wi-Fi-aware updates, protected drafts/unsent messages, responsive image previews with full evidence available, restrained effects, accessible KYC capture, and responsive tablet/foldable layouts.
- Covered (not counted): APP-Q352 repeats existing decisions against live background location and for user-initiated location access (APP-Q040, APP-Q157, APP-Q204, APP-Q280 and Map & Checkout Discovery).
- Cross-domain note: Keep the app available throughout Haiti regardless of device performance. The app-download/update website and in-app update alert remain back pocket.
- Checkpoint: APP-Q355 was the 345th unique answer, nine new answers after the 336-answer checkpoint. The next checkpoint is APP-Q364 (354 total).

### Batch 72 — APP-Q356–APP-Q365 policy transparency and consent UX (2026-10-03)

- Accepted: Give clear in-app notice of material Terms/Privacy Notice changes, with a concise explanation and full text; require renewed agreement only when needed.
- Accepted: Store a minimal, access-restricted acceptance version/time record; provide accessible change summaries, multilingual policies, and a Settings Legal & privacy area where dismissed notices and acceptance history remain available.
- Accepted: If a user declines a material update, explain the resulting access limits, preserve account help and existing obligations, and provide closure/export paths. Do not record acceptance until the server confirms the current policy version.
- Accepted: Keep a policy-version reference for historical order context; never silently rewrite accepted order terms.
- Checkpoint: APP-Q364 was the 354th unique answer, nine answers after the APP-Q355 checkpoint. APP-Q365 brings progress to 355. The next checkpoint is APP-Q375 (363 total).
- Cross-domain note: Policy versioning is distinct from mutually accepted order terms, signup consent, promotional opt-in, and account-data export; implementation must preserve those existing rules.

### Batch 73 — APP-Q367–APP-Q377 account security (2026-10-03)

- Covered (not counted): APP-Q366 repeats the established session review/revoke controls in APP-Q084; APP-Q370 repeats verified-channel recovery and ownership checks in APP-Q082.
- Accepted: Server-side session revocation applies at the next authenticated request; security-driven credential resets invalidate other sessions, while ordinary credential changes let users choose whether to sign out other devices.
- Accepted: Alert users to new sign-ins and important security events; provide private event history and verified-channel fallback when push is unavailable.
- Accepted: Offer a fast account freeze for suspected compromise; temporarily pause new listings and payout actions, review affected orders without automatic blame, preserve recovery/support access, and deliberately restore activity after recovery.
- Accepted: Consider optional phishing-resistant second-factor methods with accessible recovery; defer trusted-contact recovery unless robust safeguards are feasible.
- Checkpoint: APP-Q375 was the 363rd unique answer, nine answers after APP-Q364. APP-Q376–APP-Q377 bring progress to 365. The next checkpoint is APP-Q388 (372 total).
- Cross-domain note: Preserve existing verified-channel recovery, high-impact step-up authentication, session-management, notification privacy, account restrictions, and human review rules.

### Batch 74 — APP-Q379–APP-Q391 account security and data portability (2026-10-03)

- Covered (not counted): APP-Q378, Q381, Q386–Q387, Q392, Q394 and Q397 repeated existing email/session/MFA/notification/recovery/freeze decisions.
- Accepted: Bound and label trusted-device duration; apply rate limits and generic sign-in failure wording; provide one-time offline-storable recovery codes; gate staff session revocation behind ownership checks and audit.
- Accepted: Explain account-freeze effects, allow scoped seller-only pauses, verify multiple recovery channels independently, disclose security-history retention, and require authentication before removing the last optional second factor.
- Accepted: Re-authenticate for data exports and explain that copies saved outside MaurMaket leave its control.
- Checkpoint: APP-Q388 was the 372nd unique answer, nine answers after APP-Q375. APP-Q389–APP-Q391 bring progress to 375. The next checkpoint is APP-Q400 (381 total).
- Cross-domain note: Export details extend APP-Q016; recovery, freezing, Support access, session revocation, and security notifications preserve existing ownership, privacy, and human-review safeguards.

### Batch 75 — APP-Q393–APP-Q404 account security and data export UX (2026-10-03)

- Covered (not counted): APP-Q392 repeated APP-Q084's session-management controls.
- Accepted: Distinguish recognized/unfamiliar sign-ins carefully, let users privately label devices, and preserve safe order communication/Support during account freezes.
- Accepted: Include retained security history in exports; show export status/expiry privately; allow cancellation while generating; and retry failed generation safely without duplicate or partial archives.
- Accepted: Log staff access to sensitive KYC evidence and show a safe case-linked history; clear authenticated device caches at sign-out while protecting unsent drafts; offer optional device-authenticated app auto-lock.
- Checkpoint: APP-Q400 was the 381st unique answer, nine answers after APP-Q388. APP-Q401–APP-Q404 bring progress to 385. The next checkpoint is APP-Q411 (390 total).
- Cross-domain note: Security controls preserve session rules, KYC access audit, offline-draft safeguards, user data portability, and notification privacy.

### Batch 76 — APP-Q405–APP-Q417 privacy and data lifecycle (2026-10-03)

- Covered, not counted: APP-Q407 and APP-Q410 repeat APP-Q073's personalization controls; APP-Q412 repeats verified-channel ownership checks in APP-Q082.
- Accepted: Show held-data categories with correction/export/deletion routes; allow low-risk direct edits while requiring re-authentication/review for identity or financial changes; explain collection purpose and required/optional status at collection; separate optional data uses from essential processing; provide readable and structured exports; allow purpose-specific consent withdrawal; explain retained records during closure; disclose service-provider categories/purposes; separate optional analytics from essential reliability/security data; and promptly notify affected users of data incidents through verified channels with known facts and next steps.
- Checkpoint: APP-Q411 was the 390th unique answer, nine answers after APP-Q400. APP-Q412–APP-Q417 bring progress to 396. The next checkpoint is APP-Q422 (399 total), after APP-Q420 and APP-Q421.
- Cross-domain note: These decisions extend existing account export, KYC retention, policy-consent, recovery, and incident-response rules. They do not expand provider access or make optional analytics necessary for core services.

### Batch 77 — APP-Q420–APP-Q432 privacy controls and discoverability (2026-10-03)

- Covered, not counted: APP-Q418/Q419 repeat Profile & Privacy hub/public-preview decisions; APP-Q424 repeats the established blocking behavior in Profile & Settings; APP-Q425 repeats private Saved and follower-list controls; APP-Q426 repeats APP-Q059 search-history controls.
- Accepted: Explain device permissions contextually with alternatives; show granted permission status and OS Settings shortcut; preserve task data and offer retry/manual paths if permission is revoked; keep personal profiles out of external indexing by default; describe retention purpose and trigger without false fixed-date promises; provide one secure privacy-request tracker; make shared links honor current profile visibility; separate public Business fields from shared account/legal/transaction controls; separate in-app search discoverability from link access; and honor analytics opt-out for past optional event data where feasible while protecting essential reliability/security records.
- Checkpoint: APP-Q422 was the 399th unique answer, nine answers after APP-Q411. APP-Q423 and APP-Q427–APP-Q432 bring progress to 406. The next checkpoint is APP-Q441 (415 total).
- Cross-domain note: Keep device permissions OS-controlled, account recovery ownership-verified, profile identity privacy consistent across search and shared links, and optional analytics distinct from essential security/reliability processing.

### Batch 78 — APP-Q433–APP-Q442 support website and AI boundaries (2026-10-03)

- Accepted: Offer searchable localized help before case creation; synchronize one private case record across app and future support website; preserve public self-help and verified recovery when signed out; use shared Better Auth identity; allow case-language choice; support safe, bounded evidence uploads; send privacy-safe reply alerts through verified channels; collect optional help-article feedback; allow clearly labeled AI answers only from approved help content with human escalation; and isolate AI context per user/session with no cross-user memory and auditable handoff.
- APP-Q434 and APP-Q436 are linked extensions because the future support website is a new cross-channel surface; the underlying case-tracking and authentication decisions are not being reopened.
- Checkpoint: APP-Q441 was the 415th unique answer, nine answers after APP-Q432. APP-Q442 brings progress to 416. The next checkpoint is APP-Q451 (425 total).
- Cross-domain note: Maintain private case boundaries, account ownership verification, notification privacy, localization, and human accountability; AI must not determine case outcomes or access unrelated account data.

### Batch 79 — APP-Q443–APP-Q462 support website details (2026-10-03)

- Covered, not counted: APP-Q448 repeats the established private/synced vs device-local saved-history pattern (APP-Q059); APP-Q449 repeats APP-Q434's unified cross-channel case record; APP-Q450 is already handled through account export/privacy request decisions (APP-Q016/APP-Q428).
- Accepted: Keep general help public and account/case details private; optimize the support site for low-end phones and constrained data; provide multilingual resilient search; show article freshness/owner and mark obsolete guidance; let users close/reopen cases; suggest linking duplicate cases without losing evidence or user recourse; require explicit scoped consent for diagnostic logs; preview and allow removal of optional device metadata; use text-first low-bandwidth UX; offer accessible user-visible case print/save; protect signed-in drafts; scope phone-contact consent per case; respect contact preference/time where feasible without delaying urgent notices; provide text-first task walkthroughs; label policy/app version; and confirm self-service success only after server acknowledgment.
- Covered, not counted: APP-Q448 repeats APP-Q059's private/device-local vs synced saved-state pattern; APP-Q449 repeats APP-Q434's synchronized case record; APP-Q450 repeats APP-Q016/APP-Q428 export/request handling; APP-Q458 repeats verified-channel recovery contact (APP-Q082); APP-Q461 repeats policy-version history (APP-Q356–APP-Q365); APP-Q462 repeats server-confirmed writes/idempotency/degraded-state handling (APP-Q256/APP-Q258).
- Covered, not counted: APP-Q458 repeats verified-channel recovery contact (APP-Q082); APP-Q461 repeats policy-version history (APP-Q356–APP-Q365); APP-Q462 repeats server-confirmed writes/idempotency/degraded-state handling (APP-Q256/APP-Q258).
- Accepted: Let users choose case-specific contact channels/time windows while urgent notices remain timely; provide text-first task walkthroughs with optional images and deep links; show Support service degradation and affected tools; keep user-facing article change history; make browser push optional and device-specific; preserve safe drafts during outages while clearly showing unsent state; permit diagnostic consent withdrawal and feasible deletion; require fresh consent for additional diagnostics; allow preview/redaction of diagnostic packets; and accept removal requests for attachments no longer needed.
- Checkpoint: APP-Q451 was the 425th unique answer, nine answers after APP-Q441. APP-Q452–APP-Q457 bring progress to 431. APP-Q469 is the 440th answer, nine answers after APP-Q451; APP-Q470 brings progress to 441. The next checkpoint is APP-Q493 (450 total).
- Cross-domain note: This keeps Support reachable during technical failures and respects notification urgency, case privacy, verified contact ownership, and diagnostic-data minimization.

### Batch 80 — APP-Q483–APP-Q494 support case controls (2026-10-03)

- Covered, not counted: APP-Q485 repeats APP-Q129, which already lets users correct issue categories and Support reroute the same case; APP-Q488 and APP-Q492 were also covered by earlier article-feedback and service-status decisions.
- Accepted: Permit optional, case-scoped, expiring trusted-helper access with an audit trail; prioritize urgent safety/account-compromise cases with immediate safe steps and human review; distinguish binding rules from optional troubleshooting; give server-confirmed case submission receipts; let users state a desired outcome without treating it as proof; provide an authenticated open-case overview; allow clarification in the same case; accept optional consented short voice explanations with a reviewable transcript where available; and show the responsible team/role without staff personal contact details.
- Checkpoint: APP-Q493 was the 450th unique answer. APP-Q494 plus APP-Q483/Q484/Q486/Q487/Q489/Q490/Q491 bring progress to 458. The next accepted question, APP-Q495, is the 459th-answer checkpoint.
- Cross-domain note: Preserve account privacy and case integrity. Delegation must never mean shared credentials; voice evidence follows the same retention limits as other case evidence; submissions are not considered received until server-confirmed.

### Batch 81 — APP-Q495–APP-Q509 support/reporting and meetup safety (2026-10-03)

- Covered, not counted: APP-Q499 repeats APP-Q124's same-case follow-up evidence; APP-Q500 repeats APP-Q124/APP-Q127's distinction between user-provided and verified evidence; APP-Q502 repeats the existing case outcome/review-route rule; APP-Q503/Q504 repeat personal export and disclosed-retention decisions in APP-Q016/APP-Q428.
- Accepted: Link only relevant records to a Support case with explicit context sharing; scope and audit staff access; give reporters private receipt/status and a privacy-safe outcome; allow a correction note on case summaries while retaining history; allow withdrawal of mistaken safety reports unless independent serious-risk evidence warrants continued review; retain only minimum case-scoped evidence when a listing disappears; consolidate duplicate reports without exposing reporters; complete urgent reviews after account closure under limited retention; and accept private meetup-area safety feedback without using it alone to label a location safe.
- Checkpoint: APP-Q495 was the 459th unique answer, nine answers after the APP-Q493 checkpoint at 450. APP-Q496–APP-Q498, APP-Q501, and APP-Q505–APP-Q509 bring progress to 468. The next checkpoint is APP-Q518 (477 total).
- Cross-domain note: Report activity is not proof or an automatic penalty. Preserve privacy, appeal/review access, proportionate evidence retention, and the existing map rule that positive recommendations require enough completed orders mutually confirmed by both parties.

### Batch 82 — APP-Q510–APP-Q519 support AI and meetup safety (2026-10-03)

- Accepted: When approved help content is insufficient, Support AI must admit uncertainty and offer a human route; it has no private order/account access by default; users review/edit AI summaries before handoff; self-help chats do not become durable cases unless saved or converted; and AI cannot submit consequential actions. For map safety, credible reports temporarily suspend positive recommendations and warn affected upcoming meetups; collect optional structured reasons/notes; keep reports private; display warnings only while risks remain unresolved with review/expiry; and give users practical next steps.
- Checkpoint: APP-Q518 was the 477th unique answer, nine after APP-Q509's 468-answer checkpoint. APP-Q519 brings progress to 478. The next checkpoint is APP-Q528 (487 total).
- Cross-domain note: AI remains assistive and user-controlled. Location risk reports are private allegations, not automatic fault findings; preserve the dual-confirmed completed-order threshold for positive meetup recommendations.

### Batch 83 — APP-Q520–APP-Q530 meetup safety controls (2026-10-03)

- Covered, not counted: APP-Q528 repeats APP-Q515's requirement to warn affected upcoming meetups during review.
- Accepted: Any user may report firsthand safety concerns, but reports need review; assess credibility using specific detail/corroboration rather than volume alone; warnings are advisory; never automatically cancel/change a confirmed order; preserve positive meetup history but pause its recommendation during unresolved credible risk; don't punish sellers based only on a location report; distinguish temporary from ongoing conditions; never use background GPS; explain the reviewed risk privately; and allow personal, private saved meetup places with per-order mutual confirmation.
- Checkpoint: APP-Q539 was the 497th unique answer, nine after APP-Q530 (488 total). APP-Q540 brings progress to 498. The next checkpoint is APP-Q549 (507 total).
- Cross-domain note: Keep map safety signals distinct from seller reputation and order state. A warning is useful safety context, not a verdict; saved places never replace exact per-order agreement.

### Batch 84 — APP-Q531–APP-Q540 app download and update experience (2026-10-03)

- Accepted: Distribute signed official builds from the verified domain; disclose release metadata and user-facing workflow changes; show a dismissible What's New once per release; defer optional prompts during consequential flows; allow postponement; support resumable downloads; stage releases with health monitoring and rollback; offer only supported signed rollback packages; and provide safe install troubleshooting.
- Duplicate check: This is the previously deferred app-download/update website and in-app alert topic. Existing decisions already require a lean disclosed download (APP-Q348), Wi-Fi-aware large updates with clear user control for critical updates (APP-Q349), unsafe-action-only version gates (APP-Q265), and staged server feature flags (APP-Q264); questions here focus on the distinct public distribution and user-facing update experience.
- Checkpoint: APP-Q539 is the 497th unique answer; APP-Q540 raises progress to 498.

### Batch 85 — APP-Q541–APP-Q550 listing rights and authenticity (2026-10-03)

- Accepted: Require seller rights confirmation; accept specific counterfeit/stolen-image reports from any user while providing a rights-holder path; request proportionate evidence; explain restrictions privately; allow safe edits that preserve review history; offer evidence-based appeal; notify affected buyers if a completed purchase is later confirmed counterfeit; treat automated matches only as human-reviewed signals; and retain only the order snapshot needed for participants and required records after public listing removal.
- Duplicate check: Existing rules prohibit counterfeit/illegal/dangerous goods (APP-Q007), keep listings available during routine report review while temporarily hiding only credible immediate serious risks (APP-Q008), and provide proportionate account notice/review (APP-Q009). This set is a materially distinct rights-holder/content-authenticity workflow, linked to those baseline moderation decisions; it does not reopen general report visibility or account-appeal policy.
- Checkpoint: APP-Q549 is the 507th unique answer, nine answers after APP-Q540 (498 total). APP-Q550 brings progress to 508.
- Coverage audit: The domain map has decisions across launch/strategy, onboarding/auth/KYC, discovery/search, listing/inventory, seller tiers/business, inbox/offers, checkout/payments, orders/cancellations/refunds, delivery/map/safety, notifications, profiles/social, settings/privacy/accessibility, support/operations, localization, and performance/reliability. Remaining implementation-level unknowns (such as legal review of rights-holder handling, exact evidentiary standards, provider integrations, staffing, and regional operational procedures) should be resolved during implementation with qualified review, not filled by speculative product discovery. Back-pocket ideas remain in their domain notes, including dedicated Support and app-download/update websites, in-app update alerts, Mistral-assisted Support routing, staff/multi-store expansion, and meetup rescheduling.

### Focused design-system follow-up — APP-Q551–APP-Q553 (2026-10-03)

- Accepted: Support light and dark appearances through shared tokens, follow the device appearance by default, and provide a Settings override.
- Accepted: Use solid theme backgrounds without full-screen background images; standardize spacing, surfaces, and typography, with one consistent font family and type scale. Confirm the exact font against existing project assets during implementation.
- Accepted: Use one coherent SVG icon family and shared sizing/stroke rules. Motion should be brief and purposeful, professionally restrained, and honor Reduce Motion.
- Scope: This was a focused, user-requested design-system follow-up after the whole-app discovery concluded. It does not reopen the completed Q&A; any further design choices can be handled during implementation unless Philippe asks for more discovery.

For each nine answered questions, append a dated batch summary with IDs, accepted/rejected/deferred outcomes, cross-domain implications, and new unresolved follow-ups. The question registry is the source of truth for whether a topic was already asked.

## Active round

Current continuity summary: Whole-app discovery concluded at 508 answers after the coverage audit. APP-Q551–APP-Q553 are a focused, user-requested design-system follow-up: shared light/dark tokens with device appearance default and user override; solid backgrounds without full-screen imagery; consistent typography/font family, spacing and surfaces; one SVG icon family; purposeful restrained motion respecting Reduce Motion. The user accepted all three; APP-Q552 additionally records consistent font use, with exact family to be selected after checking existing project font assets. Total is 511 answered questions including this linked follow-up. If further discovery is requested, next checkpoint is APP-Q559 (517 total); otherwise prepare implementation handoff from this ledger and the other domain notes.


## Build-phase implementation checkpoint — 2026-10-04

Implemented the settled seller-map privacy rules: public map visibility defaults off; seller explicitly chooses and saves a stable area; device location is not used; public discovery coordinates are stored separately and rounded server-side; nearby discovery exposes only confirmed visible public points and coarse distance; legacy map visibility requires reconfirmation. Private fulfillment coordinates and mutually confirmed exact meetup locations remain separate and unchanged. See Session 364 in the external source-of-truth log. This is implementation progress only and does not add or change discovery answers.


Build-phase implementation follow-up (2026-10-04): Orders list status changes now refresh from the server rather than showing stale cached state. Status/filter labels and action semantics are localized/accessibly announced, action state is guarded, and touch targets meet 44dp. No discovery decision or answer count changed.

Build-phase implementation checkpoint (2026-10-04): Order meetup response now supports a two-way counterproposal. Either counterpart can accept or propose a different location; the order stays paid/pending and unchanged while proposals are negotiated. Proposal uses an explicit picker without device-location lookup. Superseded meetup Action-needed alerts are resolved and retained in feed history. See Session 365 in the external source-of-truth log. Implementation-only; discovery count remains 511.

Build-phase implementation follow-up (2026-10-04): OrderDetail now exposes accessible progress and mutation state; key controls meet 44–48dp; review/dispute selections and modal labels are accessible/localized. The timeline shows translated event labels, actor attribution, and device-locale dates. See Session 366. No discovery count change. Next critical implementation gap: cancellation is not end-to-end: API supports paid-order refund requests but the UI exposes cancel only for pending, and APP-Q337's post-fulfillment request/seller response/Support path is not implemented. Trace state/payment constraints before making a coordinated change.

Implementation checkpoint — Session 371 (2026-10-04): Paid MonCash delivery cancellation now supports buyer-selected seller portion or whole checkout while each affected portion is verified, unstarted, and backed by held escrow; sellers can cancel their own pending portion. Seller-scoped stock/accepted-offer release preserves other sellers' active portions. Each paid cancellation opens separate review; seller-targeted refund payout allocation is recorded with `refunded_seller_id`, overlapping pending payouts are blocked, and the old one-payout-per-order constraint is removed to support multiple seller allocations. NatCash, meetup, and already-started affected fulfillment remain guarded. Unpaid multi-seller partial cancellation remains blocked because repricing fees/promotions/delivery safely is not implemented. Local SQL migration only; not applied remotely. Validation: npm test (design 0/0; 2,299 locale keys and 1,711 translation calls; 588 unused-key notices), TypeScript, JS syntax, changed-file diff check, Expo web export (3,571 modules / 9 bundles) all pass. No live database/provider/device test, commit, or push. Next: define a safe resolution path for accepted/overdue post-fulfillment requests while keeping Support API disconnected, then handle unpaid multi-seller repricing. Discovery count stays 511.

Support integration implementation rule (2026-10-04): For in-app Support-related features built before the planned Support website exists, expose a narrow adapter/navigation seam and leave it unconnected (“leave the cable hanging”). Do not fake case submission or claim a case was created; clearly state when the Support website/API connection is not yet available. Plug the seam into the real API when that website is built. This records implementation sequencing only; discovery count unchanged.

Implementation checkpoint: added `src/support/supportGateway.ts` as the unconnected typed adapter seam; `createCase` returns `not_connected` and cannot claim submission. No Support API integration or credentials are configured. Session 368 implements the first safe cancellation-request slice for single-seller non-meetup delivery: buyer request, seller response, buyer withdrawal, one reminder, overdue unresolved state, and explicit separation from refund settlement. Pending/unresolved requests block seller advancement (if pending), buyer completion, and escrow release; order/payment are not changed by the request itself. Session 369 adds pre-fulfillment buyer cancellation: pending unpaid orders release reservations/stock atomically; a paid single-seller MonCash delivery order can be cancelled before fulfillment, but its refund remains separate and pending review/provider confirmation. Unresolved payment attempts serialize against cancellation under an order lock; checkout webhook now associates confirmed reservations and checkout to the created order. The UI exposes the eligible cases with localized refund disclosure. Paid meetup/NatCash and multi-seller cancellation remain guarded. Seller-initiated cancellation, multi-seller per-portion settlement/stock handling, and safe resolution of accepted/overdue post-fulfillment requests remain unfinished. Validation: npm test (0 design violations/warnings; 2,278 locale keys; 1,694 calls; 584 unused notices), TypeScript, route syntax, changed-file diff check, and Expo web export (3,571 modules / 9 bundles) pass. No live database/provider/device validation, remote migration, or commit/push. Keep Support disconnected until its website/API exists. Discovery count unchanged.

Implementation checkpoint (Session 370, 2026-10-04): seller-initiated cancellation is now enabled for a single seller before fulfillment. Pending unpaid orders cancel immediately; paid orders qualify only for held-escrow MonCash delivery, which opens separate refund review and does not trigger or confirm a provider refund. Stock reservations and variants are restored, accepted-offer claims released, the reason is recorded, and the buyer is notified. Multi-seller, paid NatCash/meetup remain guarded; meetup cancellation is blocked after check-in. Validation: tests, TypeScript, route syntax, diff check, and Expo web export passed. No live DB/provider/device validation, migration, commit, or push. Next: multi-seller per-portion cancellation/refund/stock handling, then safe resolution for accepted/overdue cancellation requests. Support API remains disconnected. Discovery count stays 511.
