# WinTrack implementation plan

Written from the 13 Aug client review (Biji, Murali, Haritha) and updated as each
item landed. Target: staging + production before the end of August 2026.

## Phase 1 — Core sales flow · done

- Lead Inbox: Qualify, Disqualify and Reassign on the lead itself.
- Disqualify captures a **mandatory written reason**, not just a category.
- **Revert to Lead** works after registration — it removes the opportunity it
  created and returns the lead to the inbox, re-qualifiable.
- Multiple products per opportunity, stored as a list and read as one everywhere
  (tracker, drawer, analytics, proposal).
- Opportunity Tracker:
  - Order Date → **Expected Order Date**, Invoice Date → **Expected Ship Date**,
    on every surface.
  - **Next Action Pending Owner**, derived from the live blockers, overridable.
  - Sales owners open on the eight working columns; the full sheet is one click
    away.
  - Create / Proposal / Last Updated are system-stamped and read-only; the two
    expected dates are the salesperson's and are flagged when blank.
- Opportunity creation from an uploaded enquiry — tender PDF **or saved email**.
- RFQ number, RFQ date, customer and sender extraction, with an
  "Email dated …" fallback when the enquiry carries no reference.
- Fields the document did not contain are marked on the field itself.

## Phase 2 — Proposal and approval workflow · done, layout pending samples

- Proposal route — Project / Spares / Services — derived from the opportunity
  and overridable on the proposal.
- The **printed document follows the route**: spares and services print a short
  section set, drop the project front matter, and no longer show a signal list or
  rack layout. AMC and Training no longer fall through to the project template.
- Project template unchanged.
- Proposal preview shows the real document before sending.
- Email Proposal auto-populates recipient (from the enquiry sender, falling back
  to the customer's purchase desk) and subject; CC field; the PDF is produced
  from the dialog and the copy says plainly that the mail app attaches it.
- Extract to Excel available to whoever is building the proposal.
- **Sales owners can price their own proposals** — BoQ, landed cost and margin —
  and their printed document carries prices. Only sending stays approval-gated.
- Pending-approval badges on the desktop sidebar and the tablet bar, counting the
  gates that are actually waiting on the signed-in persona.
- Approval conditions are confirmed in an in-app modal. No browser prompt, no
  localhost URL anywhere.

## Phase 3 — Dashboard, testing, deployment · done

- Role-based **My Dashboard**: sales owners get target, attainment, quarterly
  target-vs-actual, monthly bookings, pipeline, next actions and their orders;
  approvers get their gate queue and company attainment; admins get accounts and
  platform health; the technical reviewer gets proposals to review.
- Reachable on a phone — bottom tab, tile and sidebar entry.
- The AI & Automation map badges every entry with what is actually behind it
  (Live AI / Rule-based / Preview), and four items that were catalogue text now
  compute for real: customer health, duplicate leads, win-probability suggestion,
  escalation suggestion.
- Demo Launcher scenarios 1, 2, 3, 5 work from a clean reset; 6 now opens on a PO
  already in review. Scenario 4 (project deep-dive) is the deferred one.
- No horizontal page scroll; the tablet bar wraps and sheds labels on a phone;
  view mode follows rotation until the user pins it.
- 94 automated tests (`npm test`) covering the behaviour above.
- Staging and production as two Vercel projects on separate Supabase projects —
  see `DEPLOYMENT.md`.

## Still open

**Blocked on the client**

- **Spares and services sample proposals.** The routing, section sets and
  suppression are built; the final section *wording and layout* are a defensible
  default until the samples arrive. Swapping them touches only the arrays in
  `src/proposalDoc.js` (`SPARES_SECTIONS`, `SERVICES_SECTIONS`).
- Branding guidelines. The letterhead in `src/proposalDoc.js` (`MODAE_COMPANY`)
  is a marked placeholder and must be replaced before anything printed goes to a
  customer.
- Swami's confirmed column list, to check against `KEY_COLS` in
  `src/pages/Tracker.jsx`.

**Ours, not yet done**

- Four automations remain honest previews rather than behaviour: fuzzy part
  matching, revision comparison, multi-currency conversion, T&C clause library.
  Accounting integration stays simulated by nature.
- The proposal PDF is produced through the browser's print dialog; sending it as
  a real attachment needs a server-side send path.
