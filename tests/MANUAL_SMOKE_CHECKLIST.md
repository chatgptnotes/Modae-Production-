# Manual browser and device smoke checklist

Use a clean seeded demo state before each scenario. Record browser, viewport, role, result, and console errors.

## Desktop

- Sign in and switch between RS, PP, LJS, AH, ADMIN, SUPER, TECH, and CUST.
- Confirm CUST is redirected only to `/portal`.
- Open `/my-dashboard` for each internal role and confirm role-specific cards render.
- Run Demo Launcher scenarios 1, 2, 3, and 5.
- Open a lead and test Qualify, Disqualify with reason, Reassign, and Revert to Lead.
- Create an opportunity with multiple products and verify the tracker record.
- Upload a PDF with an RFQ number/date and verify extraction plus missing-field warnings.
- Open a proposal, select Project/Spares/Services, open Preview, enter To/CC, and verify the attachment name.
- Request an approval and verify the pending badge and approval-condition modal.

## Mobile and tablet

Test at 390×844 and 768×1024:

- Open the shared link from WhatsApp.
- Switch to tablet mode.
- Navigate Home, Inbox, My Dashboard, Approvals, and Proposal.
- Confirm no horizontal page overflow.
- Confirm tables scroll within their containers.
- Confirm modal actions remain visible above the bottom navigation.

## PWA

- Open the deployed HTTPS URL in Chrome.
- Confirm the install prompt or install option appears.
- Install the application.
- Relaunch it from the installed app icon.
- Confirm it opens at the configured home route.
- Refresh a deep link and confirm the application remains usable.
