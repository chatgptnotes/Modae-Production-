# Workflow Conformance Review & Remediation Plan

WinTrack / ModAE sales platform, measured against the two official process diagrams.

| | |
|---|---|
| **Reference 01** | `branding/Official Lead Management Workflow (2).pdf` — *Expected Lead Management Workflow Post Implementation* |
| **Reference 02** | `branding/Opportunity Workflow 7 Jun 2026.jpeg` — *02 – Opportunity Management Workflow (FINAL)* |
| **Presentation copy** | `branding/Workflow Conformance Review.pdf` (8 pages, ModAE letterhead) |
| **Date** | 18 August 2026 · Diagram 02 re-reviewed 19 August 2026 |
| **Scope** | Full source review — pages, state store, gating rules, approval logic, AI tasks, integrations |

## Headline finding

**Diagram 01 — Lead Management: ~60% conformant.** The backbone is correct.
Inbox → AI parse → classify → gate → Opportunity ID → SharePoint folder all work as
drawn. The gaps are missing *edges*: lead sources, region routing, the Teams chatbot,
the one-week timer, the fast-track path.

**Diagram 02 — Opportunity Management: the structural gaps are closed (19 Aug).**
The three lanes, B-01…B-05, the site-survey sub-flow, the ₹10 Lakh × 50% margin matrix,
typed revisions with back-routing, competitor tracking and loss capture all exist and are
reachable from the UI. What remains is **infrastructure, not process**: multi-channel
dispatch and the "AI monitors and notifies" loop both need a server-side send path and a
scheduler (Tier 3 below), plus two small UI gaps (O13, O14).

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
| **L5** | Discard if KYC / fee not received within one week | **No scheduler exists in the codebase.** Admin reminder toggles have no engine. A lead waits indefinitely | High |
| **L6** | Discarded leads → separate archived Lead Database | Same `state.leads` array with `status:'Dropped'`. No archive, no screen consumes them | Medium |
| **L7** | Fast Track Path for existing Green customers | `fastTrack:true` set on one seed lead, **read by nothing**. Green follows the identical path | Medium |
| **L8** | KYC form — GST, PAN, cancelled cheque, EFT mandate | Checklist of document *names* only. No number capture, no validation, uploads simulated | Medium |
| **L9** | AI-07 register in CRM & Sales Pipeline (Stage 1) | Labelled "Simulated". The app *is* the CRM — needs a client decision | Low |
| **L10** | "All AI actions … logged for a complete audit trail" | Audit logs **human actions only**; no model, prompt or response recorded. Capped at 500 entries, client-writable | Medium |

**Also:** `nextOppId` takes a *global* max over the serial, not per-month, and computes
from browser state — two concurrent registrations collide. No DB sequence or uniqueness
constraint exists.

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
| 5A | Technical approval — **LJS or AN** (`anyOf`) | `transitionBlockers`; the `AN` role exists in `ROLES` and `PERMS` |
| 5B | Commercial approval — AH only | `transitionBlockers` |
| 5C | Margin matrix — order value ≷ ₹10 L × margin ≷ 50%, including the salesperson self-approval tier | `commercialGate`, `src/gates.js`. Verified live: a ₹2.3 L / 35% GM quote routed to "AH or LJS — either one decides" |
| 5 | Re-approval mandatory on every revision | approvals are stamped with the revision they cover (`approvalForRev`) |
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
| **O13** | §5A and §5B raised directly | Both gates are *enforced* by `transitionBlockers`, but the only affordance on a blocked transition raises a **Milestone exception**, not the technical or commercial approval itself. There is no "request technical approval" action | Medium |
| **O14** | §5C "All Approvals Completed → Quote Ready for Dispatch" box | `approvalSet()` exists to answer exactly this and has no caller — the three §5 gates are never shown together as one status | Low |

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

Still open at this tier: **raise §5A / §5B directly** (O13) rather than only as a milestone
exception, and **show the three §5 gates as one "All Approvals Completed" box** (O14, the
unused `approvalSet()`).

### Tier 3 — Infrastructure (the honest blockers)

10. **A scheduler** (L5, O10) — Supabase cron / pg_cron, so reminders, the one-week KYC and
    fee expiry, validity warnings and approval SLA nudges actually fire.
11. **A server-side send path** that attaches the PDF, plus a **Teams webhook** — together
    these unlock the Teams chatbot validation, the AI-08 notification and the multi-channel
    dispatch lane (L4, L9, O9).
12. **Discarded-lead archive** and **AI-action audit logging** (L6, L10).

> Tier 3 depends on client decisions about hosting and the Microsoft tenancy. Raise these
> rather than building on assumption.

---

## Verification

`npm test` — 163 tests, all passing. `tests/gates.test.mjs` covers the lanes, the B-step
gate and the §5 matrix; `tests/workflow-ui.test.mjs` pins each screen to the store action it
drives, so the model layer cannot drift back out of reach of the UI.

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

Still worth adding: a journey per lane in `tests/MANUAL_SMOKE_CHECKLIST.md`, and
`commercialGate()` cases at all four matrix corners — (₹5 L, 60%), (₹5 L, 40%),
(₹15 L, 60%), (₹15 L, 40%) — rather than the two corners currently asserted.
