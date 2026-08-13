# WinTrack implementation plan

## Phase 1 — Core sales flow

- Update Lead Inbox with:
  - Qualify
  - Disqualify with mandatory reason
  - Reassign
  - Revert to Lead
- Add missing-field warnings.
- Support multiple product selection.
- Update Opportunity Tracker:
  - Rename Order Date → Expected Order Date
  - Rename Invoice Date → Expected Ship Date
  - Add Next Action Pending Owner
  - Simplify salesperson columns.
- Verify opportunity creation from email/PDF extraction.
- Add RFQ number, RFQ date, customer, and sender extraction.

## Phase 2 — Proposal and approval workflow

- Add proposal type:
  - Project
  - Spares
  - Services
- Implement AI-based proposal routing.
- Keep the current Project template.
- Add Spares and Services templates after receiving client samples.
- Add proposal preview.
- Automatically populate recipient and subject.
- Add CC field.
- Attach the generated proposal PDF automatically.
- Keep Extract to Excel.
- Ensure salespeople can view and prepare proposals.
- Add pending approval flags.
- Replace approval URL with an in-app popup.
- Require confirmation of approval conditions before sending.
- Remove localhost URLs.

## Phase 3 — Dashboard, testing, and deployment

- Add role-based My Dashboard.
- Show blockers, pending approvals, next actions, and proposal status.
- Test 23 primary AI automations plus five supporting automations.
- Test Demo Launcher scenarios 1, 2, 3, and 5.
- Test mobile, tablet, WhatsApp link, and Chrome PWA.
- Verify no horizontal scrolling or broken navigation.
- Maintain separate staging and production environments.
- Deploy the approved staging version to production before customer use.
- Continue future development and feedback handling on staging.

## Assumption

Final Spares and Services proposal layouts remain pending until the client provides sample documents.
