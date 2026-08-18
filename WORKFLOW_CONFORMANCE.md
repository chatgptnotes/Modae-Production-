# Workflow Conformance Review & Remediation Plan

WinTrack / ModAE sales platform, measured against the two official process diagrams.

| | |
|---|---|
| **Reference 01** | `branding/Official Lead Management Workflow (2).pdf` — *Expected Lead Management Workflow Post Implementation* |
| **Reference 02** | `branding/Opportunity Workflow 7 Jun 2026.jpeg` — *02 – Opportunity Management Workflow (FINAL)* |
| **Presentation copy** | `branding/Workflow Conformance Review.pdf` (8 pages, ModAE letterhead) |
| **Date** | 18 August 2026 |
| **Scope** | Full source review — pages, state store, gating rules, approval logic, AI tasks, integrations |

## Headline finding

**Diagram 01 — Lead Management: ~60% conformant.** The backbone is correct.
Inbox → AI parse → classify → gate → Opportunity ID → SharePoint folder all work as
drawn. The gaps are missing *edges*: lead sources, region routing, the Teams chatbot,
the one-week timer, the fast-track path.

**Diagram 02 — Opportunity Management: ~35% conformant.** The divergence is
**structural, not cosmetic**. The diagram's primary axis — Greenfield versus Brownfield —
does not exist in the data model, the B-01…B-05 steps are not tracked, the service
site-survey flow is absent, and the margin approval matrix uses entirely different logic.

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

### Conformant

Opportunity intake · service rate-sheet build-up covering travel, lodging, manpower days
and consumables (`src/workbench/WbService.jsx`) · quote dispatch gated on approved release
with a three-point human review (`src/workbench/SubmissionPanel.jsx:76`) · tracking
(status / stage / probability) · communication history · analytics and pipeline dashboards ·
PO received → handover (`src/workbench/PoHandover.jsx`).

### Gaps

| Ref | Diagram element | Reality | Severity |
|---|---|---|---|
| **O1** | Greenfield (Project/Upgrade) vs Brownfield (Retrofit/Service/Spares) | **No such field.** The legacy prototype carried `CONTEXTS = ["Brownfield","Greenfield"]`; it was dropped in the v2 rewrite. Branching is `route` = Project \| Spares \| Service (`routeForType`, `src/seed.js:540`), so **Retrofit and Upgrade both land on the Project route** | Critical |
| **O8** | "Re-Approval Required — repeat Section 5" on every revision | **The opposite is enforced.** `submitForApproval` is disabled once released (`src/workbench/PropBuilder.jsx:246`). A post-release revision **cannot re-trigger the approval gate at all** — a revised price can reach a customer unapproved | Critical |
| **O5** | 5C Margin matrix: order value (≷ ₹10 L) × margin (≷ 50%) → approver set | Routing is GM% × discount% (`src/gates.js:44`, `{gmAuto:25, discAuto:5, gmLjs:20, discLjs:10}`). **Order value is computed but never routes an approval.** The ₹10 Lakh and 50% breakpoints appear nowhere, and there is **no salesperson self-approval tier** | Critical |
| **O2** | Greenfield Phase-1: "No Quote / RFQ / Engineering / Pricing at this stage" | A Project-route opportunity can build a full priced proposal today. No rule prevents it | High |
| **O3** | B-01…B-05 tracked steps, each approved by the Assigned Salesperson | No step identifiers, no step state, no per-step sign-off. Fragments exist across workbench tabs, but nothing records that B-02 completed, by whom, or when | High |
| **O4** | Service: Site Survey Required? → survey request → site visit → survey report → SoW | **`grep -i survey src/` returns zero hits.** SoW is a proposal *heading* only — no record, no approval, no customer sign-off | High |
| **O6** | 5A Technical Approval → LJS **or AN** | Decided by LJS only. **Role "AN" does not exist** in the role list, permissions matrix or seed data (`ROLES`, `src/seed.js:487`). The technical persona is read-only | High |
| **O9** | Dispatch via Email / Teams / WhatsApp / Customer Portal / Tender Portals | Gmail compose URL only; **the PDF is not attached programmatically** — the user prints and attaches by hand | High |
| **O10** | "AI Monitors & Notifies Sales (Real Time Alerts)" | Nothing monitors anything. No scheduler, no polling, no alerting. Sidebar badge counts are the only mechanism | High |
| **O7** | Revision types (Technical/Commercial/Pricing/Other) routing back to B-02…B-05; V2/V3/V4 | Free-text note only, no revision type, no back-routing. Labels are `R1/R2`. Compare-revisions states in its own text that it is a placeholder | Medium |
| **O11** | Competitor Tracking (Section 8) | Zero hits. Competitors appear only as prose in free-text remarks | Medium |
| **O12** | Loss reason captured on close | `closedReason` is *marked* required (`src/opppanel.jsx:302`) but **nothing blocks saving a closed opportunity with it empty**. No dedicated close action | Medium |

### Defect found during review (independent of the diagrams)

`src/gates.js:257` gates the Handover milestone on `po.acceptance.sales && po.acceptance.customer`,
but `store.acceptPO` (`src/store.jsx:791`) and `buildPoCompare` write the keys **`LJS`** and **`AH`**.
**The Handover step is unreachable through the UI.**

---

## Remediation plan

### Tier 1 — Data-model corrections
Small, cheap changes that unblock everything downstream.

1. **Restore Greenfield / Brownfield** (O1) — add `context: 'Greenfield' | 'Brownfield'` to
   the opportunity, derived from `oppType` per the diagram (Project, Upgrade → Greenfield;
   Retrofit, Service, Spares → Brownfield), overridable. Split `routeForType` in
   `src/seed.js:540` so Retrofit no longer inherits the Project workbench.
2. **Rewrite the approval matrix** (O5, O6) — replace `commercialGate()` in `src/gates.js:44`
   with the diagram's 2×2 on (order value ≷ ₹10 L) × (margin ≷ 50%), including the
   salesperson self-approval tier. Keep the existing GM/discount thresholds as a
   configurable secondary check. Add the `AN` role to `ROLES` and `PERMS` in `src/seed.js`.
3. **Fix the handover key mismatch** — align `src/gates.js:257` with the `LJS`/`AH` keys
   written by `store.acceptPO`.
4. **Region-based ownership** (L3) — add `region` to the lead record; make
   `config.ownershipRules` an executed lookup rather than a prompt hint; restrict the owner
   override to LJS/AH and record a mandatory reason.
5. **Lead source taxonomy** (L1) — add the seven-value list and set it on every intake path
   (`src/pages/Inbox.jsx`, `src/pages/IntakeForm.jsx`, `src/pages/TenderIntake.jsx`).

### Tier 2 — Missing workflow objects

6. **B-01…B-05 as tracked steps** (O3) on the Brownfield route, each with an
   assigned-salesperson sign-off, reusing the existing approval record shape.
7. **Service site-survey sub-flow** (O4) — `surveyRequired` decision → survey request →
   site visit → survey report → SoW artefact, feeding the existing `WbService` calculator.
8. **Mandatory re-approval on revision** (O7, O8) — allow a released proposal to be
   superseded, with typed revisions routing back to the matching B-step.
9. **Enforce the Greenfield pricing boundary** (O2), **enforce `closedReason` on close** and
   **add competitor fields** (O11, O12).

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

- Extend `tests/MANUAL_SMOKE_CHECKLIST.md` with one journey per diagram lane: Greenfield,
  Brownfield B-01…B-05, Service survey, margin-matrix approval.
- Add `node --test` cases over `commercialGate()` at the four matrix corners:
  (₹5 L, 60%), (₹5 L, 40%), (₹15 L, 60%), (₹15 L, 40%).
- Assert `context` resolves for every value in `OPP_TYPES`.
- Manually: create a Retrofit opportunity and confirm it renders the Brownfield workbench,
  not the Project one.
- Manually: release a quote, revise it, and confirm the approval gate re-opens.
