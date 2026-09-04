# Workflow Conformance Review & Remediation Plan

WinTrack / ModAE sales platform, measured against the two official process diagrams.

| | |
|---|---|
| **Reference 01** | `branding/Official Lead Management Workflow (2).pdf` — *Expected Lead Management Workflow Post Implementation* |
| **Reference 02** | `branding/Opportunity Workflow 7 Jun 2026.jpeg` — *02 – Opportunity Management Workflow (FINAL)* |
| **Presentation copy** | `branding/Workflow Conformance Review.pdf` (8 pages, ModAE letterhead) |
| **Date** | 18 August 2026 · Diagram 02 re-reviewed 19 August 2026 · §5 closed 19 August 2026 |
| **Scope** | Full source review — pages, state store, gating rules, approval logic, AI tasks, integrations |

## Headline finding

**Diagram 01 — Lead Management: ~60% conformant.** The backbone is correct.
Inbox → AI parse → classify → gate → Opportunity ID → SharePoint folder all work as
drawn. The gaps are missing *edges*: lead sources, region routing, the Teams chatbot,
the one-week timer, the fast-track path.

**Diagram 02 — Opportunity Management: the structural gaps are closed (19 Aug).**
The three lanes, B-01…B-05, the site-survey sub-flow, the ₹10 Lakh × 50% margin matrix,
typed revisions with back-routing, competitor tracking and loss capture all exist and are
reachable from the UI. The §5 approval layer was closed out later the same day: both
technical and commercial approval can now be raised directly, the three gates are shown
together as the diagram's "All Approvals Completed" box, and a milestone exception can no
longer waive any of them. What remains is **infrastructure, not process**: multi-channel
dispatch and the "AI monitors and notifies" loop both need a server-side send path and a
scheduler (Tier 3 below).

> The original 18 Aug assessment read "~35% conformant… the diagram's primary axis does not
> exist in the data model". That is no longer true and the Diagram 02 section below has been
> rewritten. Diagram 01 has **not** been re-reviewed since 18 August.

---

## Diagram 01 — Lead Management

### Conformant

| Diagram step | Implementation |
|---|---|
| AI-01/02/03 parse, extract RFQ metadata, check missing info | Gemini `lead.extract` — `supabase/functions/ai/index.ts:86`. Returns summary, route, urgency, completeness, suggested owner, and per-field values each with a confidence score and evidence quote |
| D-02 Information Complete? | Registration blocked while any AI field is unreviewed below threshold — `src/pages/Inbox.jsx:663` |
| AI-04 Green / Blue / Amber / Red | `CUSTOMER_STATUSES` — `src/seed.js:28` |
| Red → joint LJS + AH clearance | Blocks qualification *and* withholds the Opportunity ID — `src/pages/Inbox.jsx:376,583` |
| Amber → pre-quote processing fee | ₹25,000 / 7 days — `src/seed.js:999`, gate at `src/gates.js:76` |
| AI-05 Opportunity ID `YYMMNNNXXX` | `nextOppId()` — `src/store.jsx:946`. Produces `2606307RS` exactly |
| AI-06 SharePoint folder | Real MS Graph, folders move on won/closed — `src/sharepoint.js:263` |
| Discard with mandatory reason | Category + mandatory written note — `src/pages/Inbox.jsx:634` |
| Duplicate checking | Deterministic buyer-ref and subject-overlap matching — `src/insights.js:74` |

### Gaps

| Ref | Diagram element | Reality | Severity |
|---|---|---|---|
| **L1** | Seven lead sources (Website, OEM Referral, WhatsApp, Phone, GeM/Tender, Networking, Existing Green) | One free-text `source`, always `'Common mailbox'`. Zero hits for WhatsApp / phone call / networking / OEM referral in `src/` | High |
| **L2** | L-02 Initial Review, L-03 Business Relevance Assessment, D-01 Worth Pursuing? | Collapsed into one "Qualify lead" button. No stage names, no record that a review occurred | Medium |
| **L3** | L-05-AI region → owner routing | Rules exist as config text (`src/seed.js:993`) and as an LLM prompt hint only. **No region field on a lead.** Fallback routes by opportunity *type* (`ownerForOppType`, `src/seed.js:548`) — a different rule to the one drawn. Override "needs LJS/AH + reason" is display text; the dropdown is freely editable with no role check | High |
| **L4** | Teams chatbot confirms every Human Validation step | No Teams integration. `src/pages/Register.jsx:222` states it is simulated. Validation happens in-app instead | High |
| ~~**L11**~~ | ~~AI-03 drafts the clarification request~~ | **Closed 20 Aug.** `src/leadClarification.js` and the `lead.clarify` task draft it; the inbox edits it and a human sends it. Nothing dispatches on its own | — |
| **L5** | Discard if KYC / fee not received within one week | **No scheduler exists in the codebase.** Admin reminder toggles have no engine. A lead waits indefinitely | High |
| **L6** | Discarded leads → separate archived Lead Database | Same `state.leads` array with `status:'Dropped'`. No archive, no screen consumes them | Medium |
| **L7** | Fast Track Path for existing Green customers | `fastTrack:true` set on one seed lead, **read by nothing**. Green follows the identical path | Medium |
| **L8** | KYC form — GST, PAN, cancelled cheque, EFT mandate | Checklist of document *names* only. No number capture, no validation, uploads simulated | Medium |
| **L9** | AI-07 register in CRM & Sales Pipeline (Stage 1) | Labelled "Simulated". The app *is* the CRM — needs a client decision | Low |
| **L10** | "All AI actions … logged for a complete audit trail" | Audit logs **human actions only**; no model, prompt or response recorded. Capped at 500 entries, client-writable | Medium |

**Also:** `nextOppId` now resets the serial per month, but still computes from browser
state — two concurrent registrations can collide. No DB sequence or uniqueness constraint
exists.

---

## Diagram 02 — Opportunity Management

**Re-reviewed 19 August 2026.** The structural gaps this section reported on 18 August
have been closed: the Greenfield / Brownfield / Service lanes, B-01…B-05, the site-survey
sub-flow, the §5 layered approval with the real ₹10 Lakh × 50% matrix, typed revisions,
competitor tracking and loss capture all exist and are reachable from the UI.

### Conformant

| § | Diagram element | Where |
|---|---|---|
| 1 | Intake → SharePoint folder → CRM registration → type identified | `store.addOpportunity`, `sharepoint.js`, `nextOppId` |
| 1 | Greenfield / Brownfield / **Service** lanes | `contextForType`, `CONTEXTS` (`src/seed.js`); shown as a chip on the workbench header and the Requirement tab |
| 2 | Greenfield Phase 1 — "No Quote / RFQ / Engineering / Pricing at this stage" | `transitionBlockers`, `src/gates.js` |
| 3 | B-01…B-05, each signed off by the **assigned salesperson only** | `B_STEPS` (`src/seed.js`), `signBStep` / `unsignBStep` (`src/store.jsx`), panel at `src/workbench/BSteps.jsx` — a Proposal sub-tab on the Brownfield lane. Steps sign in order; `readiness()` blocks the proposal until all five are signed |
| 4 | "Site Survey Required?" → request → visit → report → SoW → service pricing | `requestSurvey` / `updateSurvey`, panel at `src/workbench/SurveyPanel.jsx` inside `WbService`. Standard service still prices off the rate sheet (travel, lodging, manpower days, consumables) |
| 5A | Technical approval — **LJS or AN** (`anyOf`) | `transitionBlockers`; the `AN` role exists in `ROLES` and `PERMS`. Raised directly from the transition dialog (`requestBlockerApproval`, `src/pages/Workbench.jsx`), stamped with the revision it covers |
| 5B | Commercial approval — AH only | `transitionBlockers`; raised the same way |
| 5C | Margin matrix — order value ≷ ₹10 L × margin ≷ 50%, including the salesperson self-approval tier | `commercialGate`, `src/gates.js`. Verified live: a ₹2.3 L / 35% GM quote routed to "AH or LJS — either one decides" |
| 5 | Re-approval mandatory on every revision | approvals are stamped with the revision they cover (`approvalForRev`) |
| 5 | "All Approvals Completed → Quote Ready for Dispatch" | `approvalSet()` rendered as one status block in `PropBuilder`, with a single all-clear state |
| 5 | The only "No" branch is *Return for Revision* — never a bypass | `NO_EXCEPTION` (`src/gates.js`) refuses to let a Milestone exception clear `tech-approval`, `comm-approval` or `release`; the UI offers the real approval instead |
| 6 | Quote submitted → customer acknowledgement | `SubmissionPanel`, customer ack on `src/pages/Portal.jsx` |
| 7 | Follow-up loop, AI-drafted follow-ups, validity countdown | `FollowUpPane`, `src/pages/Workbench.jsx` |
| 7 | "Identify Type of Revision" → back-route to B-02…B-05, V2/V3/V4 | `REVISION_TYPES` + `reviseProposal`; type picker in `PropBuilder`, which states the consequence before you confirm. Verified live: a Pricing revision reopened B-04, returned the opportunity to Proposal and re-locked the release gate |
| 7 | Opportunity lost — capture loss reason & close | `closeLost` (refuses without a reason); close-out card in `FollowUpPane`, and the drawer now routes a Lost stage through it instead of saving a blank reason |
| 8 | Tracking, comms history, document & revision audit trail, analytics, PO → handover | tracker, `communications`, `audit`, `Analytics`, `PoHandover` |
| 8 | Competitor tracking | `addCompetitor` / `removeCompetitor`; card in `FollowUpPane` |

### Gaps

| Ref | Diagram element | Reality | Severity |
|---|---|---|---|
| **O9** | Dispatch via Email / Teams / WhatsApp / Customer Portal / Tender Portals | `DISPATCH_CHANNELS` is declared but unused — `SubmissionPanel` simulates a single email lane and the PDF is not attached programmatically | High |
| **O10** | "AI Monitors & Notifies Sales (Real Time Alerts)" | Nothing monitors anything. No scheduler, no polling, no alerting; sidebar badge counts are the only mechanism | High |

*(O13 and O14 closed 19 Aug — see the §5 rows in the conformant table above.)*

### Defect found during review (independent of the diagrams)

`src/gates.js:257` gated the Handover milestone on `po.acceptance.sales && po.acceptance.customer`,
but `store.acceptPO` (`src/store.jsx:791`) and `buildPoCompare` write the keys **`LJS`** and **`AH`**.
The Handover step was unreachable through the UI. **Fixed 18 Aug** — the gate now reads the
`LJS` / `AH` keys, covered by `tests/gates.test.mjs`.

**Fixed 19 Aug.** Two defects found while walking the flow in the running app:

- Every Brownfield opportunity was **hard-locked**. `readiness()` blocked on unsigned
  B-01…B-05, `migrate()` recomputes `context` on load, no screen could sign a step, and the
  `b-steps` blocker was not exception-eligible — so all 15 seeded Spares/Retrofit rows could
  not reach Proposal. Closed by the sign-off panel above.
- The first revision of a dispatched quote was labelled **V3** instead of V2 — the counter
  in `reviseProposal` included the builder's "Submitted" timeline entries. It now counts
  only entries marked `Revised`.

**Found and fixed 19 Aug, closing out §5.** Three more, none of them in the gap tables:

- **A milestone exception could waive the entire §5 approval.** `canRequestException`
  (`src/pages/Workbench.jsx`) returned true for *any* blocker carrying an `approvalType`,
  which included `tech-approval`, `comm-approval` and `release`. One LJS decision on a
  Milestone exception released a quote nobody had technically approved. The diagram gives §5
  one "No" branch — *Return for Revision* — so the exception route is now refused at the
  model layer (`NO_EXCEPTION`, `src/gates.js`) as well as withdrawn from the UI, and the
  three gates are requested directly instead.
- **The Amber pre-quote fee was `info` on one gate and `block` on the other** —
  `readiness()` treated it as advisory while `transitionBlockers()` blocked Registration on
  it, so an Amber opportunity read as clear to quote and then refused to move. It blocks in
  both, and `transitionBlockers` now folds readiness by key so the same requirement is never
  listed twice.
- **Two revision writers, two prefixes.** `FollowUpPane` wrote an untyped `R`-numbered entry
  that skipped the type, the B-step reopen and the milestone return that §7 requires. It now
  goes through `reviseProposal` like the builder's picker; submissions write an `S`-series
  so they no longer consume a customer-facing V-number.


## Remediation plan

### Tier 1 — Data-model corrections
Small, cheap changes that unblock everything downstream.

1. ~~**Restore Greenfield / Brownfield**~~ — done. Three lanes, not two: Service is its own
   world (§4) and carries neither the Greenfield pricing embargo nor the B-step chain.
   `routeForType` was split so Retrofit shares the Brownfield workbench.
2. ~~**Rewrite the approval matrix**~~ — done. `commercialGate()` routes on
   (order value ≷ ₹10 L) × (margin ≷ 50%) with the salesperson self-approval tier, and `AN`
   is a real role in `ROLES` / `PERMS`.
3. ~~**Fix the handover key mismatch**~~ — done 18 Aug.
4. **Region-based ownership** (L3) — add `region` to the lead record; make
   `config.ownershipRules` an executed lookup rather than a prompt hint; restrict the owner
   override to LJS/AH and record a mandatory reason.
5. **Lead source taxonomy** (L1) — add the seven-value list and set it on every intake path
   (`src/pages/Inbox.jsx`, `src/pages/IntakeForm.jsx`, `src/pages/TenderIntake.jsx`).

### Tier 2 — Missing workflow objects

6. ~~**B-01…B-05 as tracked steps**~~ — done 19 Aug (`src/workbench/BSteps.jsx`).
7. ~~**Service site-survey sub-flow**~~ — done 19 Aug (`src/workbench/SurveyPanel.jsx`).
8. ~~**Typed revisions**~~ — done 19 Aug; the type picker routes the rework back to the
   matching B-step and reopens it.
9. ~~**Greenfield pricing boundary, `closedReason` on close, competitor fields**~~ — done.

10. ~~**Raise §5A / §5B directly** (O13)~~ — done 19 Aug. A blocker that names its own
    approval type is now requested, not excepted; the exception route is kept only for the
    lead-management requirements that have no approval object of their own.
11. ~~**Show the three §5 gates as one "All Approvals Completed" box**~~ (O14) — done 19 Aug;
    `approvalSet()` has a caller.

Nothing is open at this tier.

### Tier 3 — Infrastructure (the honest blockers)

12. **A scheduler** (L5, O10) — Supabase cron / pg_cron, so reminders, the one-week KYC and
    fee expiry, validity warnings and approval SLA nudges actually fire.
13. **A server-side send path** that attaches the PDF, plus a **Teams webhook** — together
    these unlock the Teams chatbot validation, the AI-08 notification and the multi-channel
    dispatch lane (L4, L9, O9).
14. **Discarded-lead archive** and **AI-action audit logging** (L6, L10).

> Tier 3 depends on client decisions about hosting and the Microsoft tenancy. Raise these
> rather than building on assumption.

---

## Verification

`npm test` — 171 tests at the time of that review (327 as of 20 Aug). `tests/gates.test.mjs` covers the lanes, the B-step
gate, all four corners of the §5C matrix, and the rule that a milestone exception cannot
waive §5; `tests/workflow-ui.test.mjs` pins each screen to the store action it drives, so
the model layer cannot drift back out of reach of the UI.

Walked end to end in the running app (19 Aug), as RS and AH:

- Brownfield (`2608223RS`, Spares) — signed B-01…B-05 in order, watched the counter move
  0→5 and the `b-steps` readiness block clear.
- Service (`2607214RS`) — ticked "site survey required", raised the request, booked the
  visit, filed the report and wrote the SoW; the panel advanced Requested → Visit booked →
  Report in → SoW ready and refused to skip a step.
- §5C matrix — a ₹2.3 L quote at 35% GM routed to "AH or LJS — either one decides", the
  diagram's `< 10 Lakh & ≤ 50%` row.
- §7 revision — released the quote, opened a **Pricing** revision; B-04 reopened, the
  opportunity dropped back to Proposal and the release gate re-locked.
- Close-out — "Close as lost" stays disabled until a reason is picked; competitors record
  and remove.

The four matrix corners — (₹5 L, 60%), (₹5 L, 40%), (₹15 L, 60%), (₹15 L, 40%) — are now
asserted. Note the older matrix test above them passes its margin through
`costing.inputGMPct`, which a hand-quoted line ignores; the new test prices the line so the
fixture produces the margin it names, and asserts that before routing on it.

Still worth adding: a journey per lane in `tests/MANUAL_SMOKE_CHECKLIST.md`.

---

## 20 August 2026 review — what changed

Client review of the sales-workflow demo. Five action items, plus one scope
decision: finish the **spares** lead-to-proposal journey first, benchmarked
against a named sample, before widening to the other routes and classes.

### Defects found and fixed

**The Red-customer approval flow could never clear** — the bug the client
reproduced on the call. `leadVerificationBlockers` (`src/leadVerification.js`)
returned the Red blocker *unconditionally*: it read no approvals, so nothing
could ever satisfy it. `Register.jsx` then pushed a second copy of the same
blocker on top of the check that *was* approval-aware. Both LJS and AH could
approve and the opportunity ID still read `— withheld —`.

Five more defects sat behind it, all closed together:

| Defect | Consequence |
|---|---|
| `gates.js` `oppBlockers` emitted the Red row with `approver:'LJS'` and **no `needed`** | A clearance raised from the workbench readiness panel cleared on LJS alone, bypassing AH — while `transitionBlockers` and the inbox both demanded a joint decision |
| `recordDecision` keyed `decisions[s.role]` by persona | An ADMIN/SUPER decision landed outside `needed`, so `needed.every(...)` never came true and the gate stranded at Pending. Now refused at the model layer |
| `applyApprovalEffects` wrote `status:'Qualified'` unconditionally | A late decision walked an already-`Converted` lead backwards, orphaning its opportunity |
| A `Returned` clearance had no way back | The store's own comment promised a re-request path that had no button. The inbox now offers one |
| `Inbox.jsx` and `Register.jsx` each inlined a class chain that dropped the `redFlag` fallback | A red-flagged lead with no customer-master match silently registered as **Blue**. Both now use the shared `customerStatusForLead` |
| `verificationSnapshot` recorded Red as `{status:'Not required'}` | The opportunity kept no trace of the clearance that authorised it. It now records the approval id, both deciding roles and any conditions |

Covered by `tests/red-approval.test.mjs` (10 tests). There was previously **zero**
Red-path coverage anywhere.

**A "duplicate" simulated lead was sometimes not a duplicate.** `chaseable`
included leads carrying no buyer reference (seed's `LD-204` has `ref: ''`), and
`ref = chased.ref || … || ref` then fell through to a freshly minted reference —
producing a lead flagged `duplicateRisk:'High'` that `findDuplicates` could never
match to anything. This was also the cause of the intermittent
`tests/simulated-leads.test.mjs` failure (about one run in eight). Fixed at
source rather than by pinning the test.

**The funnel ramp claimed a validation it no longer passed.** Re-derived as a
brand-anchored *sequential* ramp and checked with the dataviz validator in
ordinal mode: monotone lightness, every adjacent gap at least 0.06, one degree of
hue spread, light end 2.05:1 on white.

**Five brand token pairs failed WCAG AA.** `#ED3F2F` is only 3.92:1 against
white — the website carries white-on-brand on 60px hero buttons (large text,
3:1), but these are 12.5px controls, which need 4.5:1. Split into
`--primary-fill` (buttons, 4.83:1) and `--primary-ink` (links, 5.77:1), with the
brand red kept for borders, strokes and tints. Status text tones darkened to
clear their own tinted fills. Asserted in `tests/brand-identity.test.mjs`.

### Action items delivered

| Item | Where |
|---|---|
| Lead-clarification email: AI drafts, human sends; common mailbox pre-assignment, salesperson post-assignment | `src/leadClarification.js`, the `lead.clarify` task in `supabase/functions/ai/index.ts`, the draft/send panel in `src/pages/Inbox.jsx`, `commonMailbox` on the Admin page |
| Fix the red-customer approval flow | See above |
| Monthly Bookings chart per the reference HTML | `RunRateChart` in `src/pages/MyDashboard.jsx`, plus `monthlyTarget` and `monthsElapsed` in `src/kpi.js` |
| Full ModAE brand identity from the website | `MODAE_COLORS` / `MODAE_TYPE` in `src/branding/modae.js`, mirrored into `:root` in `src/styles.css`; self-hosted Rubik and Roboto in `public/fonts/` |
| Spares lead-to-proposal benchmarked on Ref 14716 | `LD-208` and the five DS821 parts in `src/seed.js`, the aligned Spares clause set in `src/proposalDoc.js`, `tests/spares-benchmark.test.mjs` |

**The clarification mail never sends itself.** Drafting only ever writes a
`Draft`; a separate handler opens a compose window that a person still has to
submit. `tests/lead-clarification.test.mjs` asserts the two paths stay separate,
including that the draft handler contains no dispatch call. `src/aimapData.js`
had advertised automatic drafting that did not exist — it now describes what the
code actually does. The template wording is ported from the client's own
`CLARIFICATION & QUOTE FEE MAIL.docx`, so an unavailable model degrades to the
mail ModAE already sends by hand.

**The Monthly Bookings chart** had three faults against the reference
`chartTrend`: the target was a flat `annual / 12` rather than the quarter's
number over its three months; the actual line ran the full year, flatlining
along zero for the seven unbooked months; and a second card plotted the same
`perf.monthly` array as an unlabelled sparkline with no target line. One card
now, matching the reference.

**Brand: two files recorded the opposite instruction.**
`branding/mod-ae/data/brand-profile.json` and `branding/mod-ae/README.md` both
said website colours were "intentionally not copied into app theming". The
client reversed that on 20 Aug; both files now say so, or the next person would
have undone the work.

**The spares benchmark.** The client's yardstick pair is in the repository:
`doc/Further Inputs/Further Inputs/Proposals and T&Cs/Spares Opp-1 (Won almost)/`
holds `02_7425309-Buyers Speces.pdf` (the enquiry, "Ref:14716" on page 1) and
`Spares Firm Offer Rev00 2May2026.xlsx` (the answer, Our Ref 2511096RS). Their
five B&K part codes match one-for-one. None of those five existed in
`seedPriceLists`, so every benchmark line would have priced at zero; all five are
now on the B&K list with the buyer's own wording as match keywords. Four printed
Spares clauses disagreed with the sample and now follow it: **Ex Works Bangalore**
(the app said FCA — a different Incoterm and a different allocation of cost and
risk), freight to the customer's account, **16 weeks after PO and advance
payment**, and **50/50 payment** (the app demanded 100% up front on every spares
quote).

> **Placeholder prices.** The sample workbook prices through external links, so
> its cached figures are zero and the real B&K net list was not in the handover.
> The five EUR figures in `seedPriceLists.BNK` are plausible stand-ins, flagged
> as such in the source. Replace them from the B&K Vibro distributor price file
> before any of this reaches a customer.

> **F is delivered against a trimmed acceptance criterion.** The plan for this
> workstream also required its test to assert that a spares proposal carries the
> GTC enclosure and *not* the services rate schedule. That assertion is not in
> `tests/spares-benchmark.test.mjs` — it is deferred with the enclosure work
> below, because there is nothing to assert against until that lands. Everything
> else in F's acceptance criteria is covered.

### Still open

- **Proposal enclosures (GTC on every proposal, the Engineering Services Rate
  Schedule on services).** Deferred: the proposal document model was being
  rewritten concurrently, from numbered `sections` to `sheets` plus opt-in
  `annexes`. Naming is decided — these are **enclosures** (`ENCLOSURES`,
  `enclosuresFor(route)`), always-on and route-driven, so they are never confused
  with the hidden technical annexes. `ModAE Standard Terms-Sales.pdf` is already
  in `doc/Further Inputs/`; the FY2025-26 rate schedule still needs copying into
  the repo. Note also that the minutes list a third attachment, a "Service Rate
  Schedule for Non-Migualization Environment" — the FY2025-26 schedule already
  covers both tiers as Item-01 *Non-Hazardous* and Item-02 *Hazardous*, so that
  reads as one document, not two. Worth confirming.
- **SharePoint sync to auto-classify Green customers.** Discussed at length but
  not in the action list. `src/sharepoint.js` has authenticated `graphFetch` and
  `resolveDrive` and a targeted `findOppFolder`, but no directory enumeration and
  no customer-classification hook — this is greenfield. The spec is also unusable
  as delivered: `Updated Folder Structure On Sharepoint.docx` contains images
  only, no text.
- **Price-engine validation dataset, proposal intelligence, error/bottleneck
  capture.** All await client data.
- The Tier 3 infrastructure blockers above are unchanged.

### Verification

`npm test` — **327 tests, all passing**, confirmed over five consecutive runs
after the duplicate-chaser fix. `npm run build` clean. Two manual journeys are
written up in `tests/MANUAL_SMOKE_CHECKLIST.md`; they have **not** been walked in
a browser this pass — the automation extension was not connected, so everything
above rests on the test suite and the build.

---

## Red-team pass over the delivered work (20 Aug, same day)

Two adversarial reviews were run against the *delivered* code — the design pass
that should have happened before implementation. Both found real defects. The
security-critical ones are fixed; the rest are listed here rather than in chat.

### Fixed in this pass

**The Red gate was still bypassable three ways.** Adding `needed: ['LJS','AH']`
to the blocker closed one route and left three open:

| | |
|---|---|
| `src/pages/Proposal.jsx` built its approval request from `approver` alone, dropping `needed` and `anyOf` | `recordDecision` fell back to `['LJS']`, so LJS cleared the joint gate single-handed. `Workbench.jsx` and `PropBuilder.jsx` forwarded both; this call site did not |
| `gates.js` `transitionBlockers` emitted `red-clearance` with **no `approvalType`** | `Workbench.canRequestException` keys off exactly that, so the transition modal offered a **Milestone exception** instead of the clearance. An approved exception moved the opportunity past Registration with no clearance record in existence. Now typed, and `red-clearance` is in `NO_EXCEPTION` |
| `appState.migrate()` backfilled `needed: [a.approver]` for every approval type | It runs on every boot and every server hydrate, so it permanently blessed pre-fix single-approver Red gates instead of repairing them. Now type-aware |

**The app did not boot.** `store.jsx` called `defaultViewMode()`, which had been
left behind as a bare identifier when `appState.js` was extracted — it is a
module-local `const` there and was never exported. `StoreProvider` threw on
mount and the whole app rendered blank. **Neither the build nor 327 tests caught
it**: `node --test` cannot load JSX, and an unresolved identifier is valid syntax
until it runs. Only opening the app found it. Pre-existing on this branch, not
introduced by the 20 Aug work.

**The PWA manifest still shipped the old navy.** `public/manifest.webmanifest`
carried `theme_color`/`background_color: #0f172a`, which paints the Android
splash screen — so the first frame of the installed app was pre-rebrand. The
brand guard scanned `styles.css` and `index.html` only; it now scans the shipped
`public/` files too.

**Chart and token corrections found by looking at the running app:**
- The bookings chart's 360-wide viewBox stretched ~2.2× in its card, so every
  label and stroke rendered at more than twice its stated size. Doubled to 720.
- `--dash-*` were declared only on `.ana-page` and `.tablet-mode`, so the
  ArcGauge on My Dashboard read undefined tokens. Moved to `:root`.
- The gauge's value arc was on `--dash-teal`, which the retheme re-pointed from
  a teal accent to a neutral grey — the headline attainment arc read as a
  disabled control. Now `--dash-accent`.
- `.oppid-link` resolved to `--hdr-navy`, byte-identical to `--text-main`, so
  opportunity-ID links were indistinguishable from body text with no underline
  at rest. Now `--primary-ink`.
- An orphan `public/font-face.css` (left by the font-fetch script) named ten
  per-weight files that do not exist — the faces are variable, so there are
  four. Inert but misleading; deleted, and asserted absent.

### Open — not fixed, needs a decision

Ranked. None are blocking, all are real.

1. **`--primary-accent` used as text in four rules** (`styles.css:1247, 1725,
   2311, 3158`) at 3.92:1 against 4.5:1. `:1725` is the worst — it is the only
   signal for the active tab in the tablet bottom nav. All four want
   `--primary-ink`.
2. **White text on `--primary-accent` in seven rules** — `.ai-badge`,
   `button.install`, `.tablet-bar button.install`, `.ws-action` (the lead
   workspace's main CTA), `.af-reject .primary`, `.lead-flow-dot`,
   `.actual-funnel`. All 3.92:1; `--primary-fill` exists for exactly this.
   Icon-only uses of the same fill are fine at the 3:1 non-text floor.
3. **`Analytics.jsx:202`** — the funnel's white labels start at band 3, which is
   `#ED3F2F` (3.92:1). The cutover should be `i < 3`.
4. **Six surviving `rgba(14,165,233, …)`** — old sky-500 in rgb notation, which
   the hex-based guard does not scan. Most visible: a sky glow under the red FAB
   (`:2256`) and a half-converted pulse keyframe (`:1298-1300`).
5. **Ten sky/teal hex survivors on brand-relevant surfaces** — the approval
   decision panel is still entirely blue (and `!important`), `.ai-notice` has a
   red left border on a blue box, `.tile.tone-teal:hover` is teal-50 under a
   charcoal icon.
6. **Rubik reaches almost nothing.** Only `h1..h6` get `--font-heading`, but this
   app's headings are `<div className="section-title|ana-title|dash-tile-label">`.
   The brand's heading face lands on roughly a tenth of the visible headings.
7. **Print regressions from the `--teal` re-point** — `.doc-block-h` is now
   1.40:1 against body text (the second heading tier is gone), and `.doc-callout`
   is 1.01:1 against the band beside it, so callouts read as dead space. These
   print, on customer-facing proposals.
8. **`.c-sky` avatar chip is now brand red**, and `.c-rust`/`.c-wine`/`.c-green`
   are still cyans and teals.
9. **`--dash-text-3: #7a7a7a`** fails 4.5:1 on all three dark surfaces
   (4.15 / 4.44 / 3.73). `#8f8f8f` clears all three.
10. **`IntakeForm.jsx` and `TenderIntake.jsx` mint an opportunity ID for a Red
    customer with no clearance** — neither calls `leadVerificationBlockers`,
    `verificationSnapshot` nor `linkLeadApprovals`. Reachable from the legacy
    (non-AI) lead path. `transitionBlockers` still blocks the *stepper*, but the
    ID is already issued by then, which is the rule's whole point.
11. **Cleared Red opportunities display as "Verification was not required"**
    (`Workbench.jsx:562`) and as "Payment confirmed at Lead stage"
    (`Register.jsx:221`); `opppanel.jsx:443` only recognises `'Verified'`, so the
    drawer shows an all-Missing KYC checklist for a class where KYC does not
    apply. The `approvalId` / `decidedBy` / `conditions` the snapshot records are
    rendered by no consumer anywhere.
12. **`applyApprovalEffects` resurrects a manually dropped lead** — the guard
    covers `'Converted'` but not `'Dropped'`, so a late approval silently
    overrides a human disqualification.
13. **`decideApproval` is live on the store API with no callers** — no `needed`
    guard, never writes `decisions`, never calls `applyApprovalEffects`. Delete
    it or route it through `recordDecision` before someone wires it up.
14. **`--select-fill` and `--lost-fill` are 1.03:1 apart**, so hovering any table
    row tints it the same pink as a lost deal.
15. **The brand watermark composites over the whole main column**
    (`mix-blend-mode: soft-light`, `.main-col` has no `z-index`), so every
    contrast figure above is measured pre-blend. Several pairs sit near 4.5:1
    with little headroom. Wants measuring on a real screenshot.
16. `MODAE_COLORS` claims to be the source of truth but has no `primaryFill` or
    `primaryInk` — the two tokens the accessibility fix invented live only in
    CSS.
