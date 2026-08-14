# Manual browser and device smoke checklist

`npm test` covers the logic; this covers what only a person at a screen can see.
Start each scenario from a clean **Reset demo data** (Demo Launcher or Admin).
Record browser, viewport, role, result and console errors.

## The two journeys the client walked on 13 Aug

**As RS (sales owner) — this is the run that used to fail.**

1. Lead Inbox → open a lead. Qualify, Disqualify and Reassign are all on the lead.
2. Disqualify → Confirm stays disabled until a reason is typed. Cancel out.
3. Qualify → Create Opportunity. Type into every text field: **focus must not jump
   after each keystroke.** Select two or more Products; BU and Segment stay single.
4. Submit → the tracker row shows both products, and Expected Order / Ship Date
   are outlined amber until filled.
5. Open the proposal. **Priced BoQ is visible and editable.** Extract to Excel is
   there. Print / PDF shows prices.
6. Email proposal → To is already filled, Subject is built, CC is available,
   Preview shows the real document, and the attachment wording matches what
   actually happens.
7. Request approval → the sidebar Approvals badge counts it.

**As LJS (approver).** My Dashboard shows the gate queue and company attainment.
Approve with a condition; back as RS, confirm the condition in the modal — no
browser prompt, no localhost URL.

## Per role

- Sign in as RS, PP, LJS, AH, ADMIN, SUPER, TECH, CUST.
- CUST is redirected to `/portal` only.
- `/my-dashboard` renders a different, populated page for each internal role.
  TECH must not land on an empty sales dashboard.

## Route-driven proposals

- A Spares opportunity: no Signal List or Rack Layout tab; the printed document
  is short and has no contents page or company profile.
- A Services opportunity: prints "Scope of work" and "Schedule of charges".
- A Project opportunity: unchanged, full section set.
- An AMC or Training opportunity must not print the project template.

## Extraction

- Upload a tender PDF **and** a `.eml` from `modae doc/`. Both are accepted.
- RFQ number and date land in the form; with no reference, RFQ Number reads
  "Email dated …".
- Fields the document did not contain are outlined amber on the field.

## Demo Launcher

- Scenarios 1, 2, 3 and 5 from a clean reset.
- Scenario 6 opens on a PO already in review — no "Simulate" click needed first.
- Scenario 4 is the deferred project deep-dive.

## AI & Automation

- Every row badges Live AI / Rule-based / Preview, and "Open in demo" lands where
  that thing actually happens.
- Customer health scores on `/customers`, hover shows the reasons.
- `/inbox/LD-207` flags LD-201 as a duplicate.

## Mobile and tablet — 390×844 and 768×1024

- Open the shared link from WhatsApp; install as a Chrome PWA and relaunch.
- **My Dashboard is on the bottom tab bar** — reachable without typing a URL.
- No horizontal page scroll anywhere. Tables scroll inside their own container.
- Rotate the device: the layout follows, unless "Full site" was chosen.
- Modal actions stay visible above the bottom navigation.
