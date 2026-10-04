# Manual browser and device smoke checklist

`npm test` covers the logic; this covers what only a person at a screen can see.
Start each scenario from a clean **Reset all demo data** (Demo Launcher or Admin).
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
- On My Dashboard, switch My View / Global View and verify approvals and blocked
  work use the selected scope. LJS's My View must include decisions on other
  owners' opportunities without adding them to the personal pipeline total.
- Check owner, FY/quarter, search, pagination, and funnel-stage filters. A funnel
  click must filter the on-page register; zero-count stages have no visible bar.
- Check the dashboard at desktop and phone widths, refresh/error feedback, and
  keyboard controls. Verify the default FY, numeric team targets, quarter labels,
  and numbered pagination. Task deadlines must not use expected close dates.
  Open the register menu → “More reports & settings” and confirm proposal
  follow-up, monthly reporting, and permitted target editing still work.

## Route-driven proposals

- A Spares opportunity: no Signal List or Rack Layout tab; the printed document
  is short and has no contents page or company profile.
- A Services opportunity: prints "Scope of work" and "Schedule of charges".
- A Project opportunity: unchanged, full section set.
- An AMC or Training opportunity must not print the project template.

## Extraction

- Upload a tender PDF **and** a `.eml` from `.local/documents/modae-doc/`. Both are accepted.
- RFQ number and date land in the form; with no reference, RFQ Number reads
  "Email dated …".
- Fields the document did not contain are outlined amber on the field.

## Demo Launcher

- Scenarios 1, 2, 3 and 5 from a clean reset.
- Scenario 6 opens on a PO already in review — no "Simulate" click needed first.
- Scenario 4 is the deferred project deep-dive.

## Removing the demo data (do this last — it empties the app)

The three call sites carry the same pair of buttons: sidebar footer, Admin
toolbar, Demo Launcher housekeeping.

- **Remove demo data** → confirm. Tracker, Inbox, Approvals, Customers, PO and
  My Dashboard all come back empty, with no console errors and no blank screen.
- Admin still lists the users and every configuration card; Price Lists still
  shows the B&K catalogue; the "DUMMY — replace with actual" upload is gone.
- **Reload the page.** Still empty. This is the check that matters — the demo
  leads (LD-203…LD-207) and AP-1 used to reappear on every boot.
- Sign out and back in with a seeded account (`Demo@1234`) — the logins survived.
- New → file an enquiry. "Sell To Customer" accepts a name that is not in the
  master yet. Save, reload: the enquiry is still there.
- Inbox → "Simulate incoming inquiry" still works on the empty app.
- Demo Launcher → the scenario tiles are dimmed and disabled, with the restore
  notice above them.
- **Restore demo data** → confirm. The full seeded dataset is back (anything
  entered in between is discarded — that is intended).
- With Supabase configured, repeat on a second browser: it must come up empty
  after a Remove rather than pushing its own seeds back to the server.

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

## Approval gate and PO handover

- **Handover opens on the joint signature.** On an opportunity with a PO received,
  accept the PO as LJS, switch the role to AH and accept again — the Handover
  milestone opens instead of holding on "PO must be jointly accepted".
- **A revision re-opens approval.** Build a proposal → Submit for approval → approve
  the Final quote release on `/approvals` → confirm the Submission panel unlocks.
  Then click **Revise quote** on the builder, give a reason, and confirm:
  - Submit for approval is enabled again (subject to the readiness blockers),
  - the Submission panel returns to "Release approval pending",
  - the revisions list shows the new R-entry with the reason,
  - the opportunity is back on the Proposal milestone,
  - the audit trail records "Quote revision opened".

## The two journeys from the 20 August review

`npm test` pins the logic for both; these are the parts only a person at a screen
can confirm. Both start from a clean **Reset all demo data**.

### Journey 1 — the Red-class approval that could never clear

This is the bug the client reproduced on the call: both approvers said yes and the
opportunity ID still read `— withheld —`.

1. As **RS**, open `/inbox/LD-206` (CAPSA Dubai / Realix). The red box names AP-1
   and offers **Request joint approval**. Raise it.
2. Switch to **LJS** → `/approvals` → approve AP-1. Go back to LD-206: the gate is
   still open. One approver is not enough, and the box must still say so.
3. Switch to **AH** → approve AP-1. LD-206 now shows the green "Red gate cleared"
   box naming the approval and its status.
4. As RS, qualify the lead and continue to registration. **The opportunity ID must
   be a real `YYMM…RS` value, not `— withheld —`**, and Create opportunity must be
   enabled.
5. Open the new opportunity → Customer/KYC. Its lead-stage verification must record
   the clearance — approval id and both deciding roles — not "Verification was not
   required".
6. Return AP-1 instead of approving it on a second lead: the inbox must offer
   **Re-request joint approval**, not a dead end.

### Journey 2 — the spares benchmark, enquiry 14716

The client's yardstick. The enquiry (`02_7425309-Buyers Speces.pdf`, "Ref:14716")
and the proposal that answered it (`Spares Firm Offer Rev00 2May2026.xlsx`,
Our Ref 2511096RS) are retained with the local reference documents.

1. Demo Launcher → **Spares benchmark — enquiry 14716** (scenario 1, persona RS).
2. The lead shows five B&K line items and two open questions (delivery address,
   bid submission date).
3. Click **Draft clarification email**. Confirm the From line reads the **common
   mailbox** and says the lead is not assigned yet. The body must ask for both
   missing items.
4. Assign the lead to RS and click **Re-draft email**. The From must now be
   `rs@modae.demo` with the common mailbox on CC.
5. Press **Send**. A compose window opens — *nothing has been sent yet*. Close it
   without sending and confirm the lead still records the mail as Sent from the
   click (that stamp is the human's action, not a dispatch).
6. Register the lead. Price the BoQ: all five part codes must resolve to real B&K
   list prices, not zero.
7. Open the proposal preview. Check the eight numbered terms against the sample:
   Ex Works Bangalore (not FCA), freight to the customer's account, **16 weeks
   after PO and advance payment**, and **50/50 payment** (not 100% advance).

### Brand identity — check on any screen

- Nothing sky-blue or navy survives: chrome is ModAE red `#ED3F2F` on charcoal
  `#282828`.
- Headings and body render in **Candara** where the system provides it, with the
  documented fallback stack on other platforms.
- Buttons are 7px-radius, primary is red with white text, **Danger is a distinct
  red** so a destructive action never reads as a primary button.
- Prices show a real `₹` glyph, not a fallback-font one. (That is the latin-ext
  subset doing its job.)
- Tablet view stays on the permanent light ModAE palette; nothing switches to
  a dark surface.

### Responsive wrapping and zoom — check on desktop and tablet

- At 80%, 100%, 125%, 150%, 200%, and 400% browser zoom, long customer names,
  URLs, filenames, IDs, and pasted descriptions wrap inside their cards or cells.
- Toolbars, filters, headers, metadata rows, and action groups wrap or stack;
  no controls overlap or force the whole page sideways.
- Wide tables scroll horizontally inside their local table container; the page
  itself does not gain an unexpected horizontal scrollbar.
- On Opportunities, both key and all-column views stay as tables at high zoom
  and narrow widths. Scroll within the grid; verify IDs, probability, both date
  columns, and native date pickers remain readable and editable.
- At the wide desktop reference width, all 11 key columns fit without a
  horizontal scrollbar; switching views returns the grid to its left edge.
- Inputs, selects, buttons, images, and modal content stay within their parent
  bounds at each zoom level.

### Monthly bookings chart — My Dashboard

- **One** card titled "Monthly bookings", not two.
- All twelve months Apr–Mar are labelled along the axis (sparsely — Apr, Jun, Aug,
  Oct, Dec, Feb, Mar).
- The **dotted** target line runs the full year; the **solid** actual line stops at
  the current month and does not flatline along zero to March.
