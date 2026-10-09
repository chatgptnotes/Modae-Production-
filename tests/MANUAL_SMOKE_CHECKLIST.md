# Manual browser and device smoke checklist

`npm test` covers the logic; this covers what only a person at a screen can see.
Start each scenario from a clean **Reset all demo data** (Demo Launcher or Admin).
Record browser, viewport, role, result and console errors.

## Phone mode and More

- At desktop width, select Phone mode. Confirm the current page stays open in
  a centered workspace no wider than 440px. Resize to tablet and phone widths,
  then reload; the selected mode must remain. More → Full site returns to the
  wider workspace. Verify automatic tablet behavior with an unpinned preference.
- At 390px and 440px, in both themes, open every permitted More destination.
  Header controls, floating actions, bottom tabs, drawers and dialogs must stay
  within the workspace; wide tables may scroll inside their own containers.
- Search More for a primary page and verify it remains discoverable. Check
  salesperson and combined admin roles. With demo data disabled, Demo launcher
  must be absent. The automation map identifies roadmap previews; appearance
  appears once in the header.
- Update opportunity status: search by customer or ID, open a row, edit through
  the existing details workflow, and verify owner scope and pagination. Switch
  to Edit in table and back without losing the search.
- Tender intake: upload a PDF, edit descriptions, part numbers and quantities,
  toggle included lines and edit commercial responses/verdicts. Confirm source
  text, pricing evidence and confidence remain available. Missing required
  fields must block creation; replacing a priced BOQ still needs confirmation.
- A local demo login shows “Local only • This device” with no database refresh.
  A real shared session continues to show genuine connection/configuration/auth
  errors. Refresh must never overwrite server deletions with the browser cache.
- Automated local Chrome check: start Vite on port 5182 and an isolated Chrome
  profile with debugging port 9331, then run `node scripts/check-phone-mode.mjs`.
  Override the local endpoints with `PHONE_CHECK_ORIGIN` / `PHONE_CHECK_DEBUG`
  when needed. This script uses local demo authentication only; screenshots go
  under `.local/generated/phone-mode-check`.

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

- As an administrator, edit and create users with the four-role dropdown
  (Standard User, Team Lead, Management, Admin). Save a changed role and reload;
  check permissions, unchanged owner IDs, and that Cancel preserves the role.
  The protected System Owner assignment cannot be changed. At desktop and phone
  widths in both themes, check long emails and edit controls stay within cells
  and the table scrolls horizontally without overlapping controls.
- After changing application roles, verify LJ and Ashwath can still decide
  requests assigned to LJS and AH; Ruthvik's Team Lead role must not clear
  requests specifically assigned to either of those approvers.
- Sign in as RS, PP, LJS, AH, ADMIN, SUPER, TECH, CUST.
- CUST is redirected to `/portal` only.
- `/my-dashboard` renders a different, populated page for each internal role.
  TECH must not land on an empty sales dashboard.
- Verify My View / Global View is in the top bar on desktop and tablet routes,
  stays selected while navigating, and filters each owner-based list. Dashboard
  navigation remains labeled Dashboard. Existing role permissions must still
  limit which pages and records are visible.
- Check owner, FY/quarter, search, pagination, and funnel-stage filters. A funnel
  click must filter the on-page register; zero-count stages have no visible bar.
- Check the dashboard at desktop and phone widths, refresh/error feedback, and
  keyboard controls. Verify the default FY, numeric team targets, quarter labels,
  and numbered pagination. Task deadlines must not use expected close dates.
  Open the register menu → “More reports & settings” and confirm proposal
  follow-up, monthly reporting, and permitted target editing still work.

- On Price Lists, verify catalogue, service-rate, and ad-hoc tables show all
  matching rows without pagination. Search the catalogue and open a direct part
  link beyond the tenth row; verify the matching part scrolls into view.
- As LJS and ADMIN, edit a supplier list, cancel once, then save a new version;
  verify prior versions remain available and refresh retains the new values.
  Edit India and International service rates separately, including minimum
  callout and GST; Cancel must discard changes and Save must add an audit entry.
  Empty/negative amounts and GST over 100 must block Save. Check desktop/mobile.
  SUPER, AH, and RS must have no edit controls on Price Lists; SUPER must also
  have read-only pricing controls in Admin. Other Admin settings remain usable.

## Mobile opportunities

- At 360px, 390px, and 440px in both themes, check the original logo, view/theme
  controls, sync status, search/filter bar, wrapped customer/title rows, values,
  overdue cues, and Create opportunity action. No page-wide horizontal scroll.
- Open filters, Apply or cancel, then use More → Filter by date. Check all three
  register views, pagination, Excel actions, and Open editable table. Open a
  record and return: retain search, filters, page, and scroll position.
- Check the compact detail summary and View all steps. Locked future stages
  remain locked; previous/next and correction actions still use workflow gates.
- In Spares sourcing, check descriptions, source evidence, currencies, quantity,
  customer unit prices, line totals, costing inputs, confirmations, comparisons,
  and manual lines. Edit quantities, discounts, markup, and costs; confirm the
  same calculations appear in the wider table. Remove with confirmation and
  restore a line. Restricted roles must not see sourcing prices or edit actions.
- Expand financial totals and check negative profit/margin. The footer appears
  while sourcing is in view, reserves space for the last card, and hides while
  editing or a modal is open. Next: Proposal remains blocked until all required
  sourcing and approvals are complete, with a visible reason.
- With the phone keyboard open, scroll every edit field and reach Done/Close.
  At tablet and desktop widths, confirm the original table and workflow layout.

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

## Workspace appearance

- Switch light/dark in the desktop header and tablet/phone More → Appearance;
  verify the selection follows layout
  changes, navigation, reloads, and another open tab. With storage blocked,
  switching still works for the current session; a fresh session defaults light.
- In both themes and desktop/mobile widths, inspect Dashboard, Lead inbox,
  Opportunities, Approvals, Workbench, Documents, Customers, Price Lists, Admin,
  and Users. Check headings, tables, charts, inputs, keyboard focus, selections,
  hover and disabled states, and labelled success/warning/error/info badges.
- Open an inbox header filter, customer picker, guide, record drawer, and modal.
  Body-mounted overlays must match the active workspace theme.
- With dark selected, verify sign-in and `/showcase` stay light; switching back
  to the authenticated workspace restores dark. Proposal/workbook paper and
  attachment content retain document colours; print preview stays light.
- After deployment cleanup, verify sign-out and appearance reset to light.
# Phone workspace

- At 320px, 390px, 440px and 600px, compare Dashboard in both themes with the approved
  images: original logo, KPIs, Top 5, Priority actions, Performance, Pipeline
  Funnel and Win/Loss, with no horizontal page scroll. Top 5 and Priority start
  expanded; each section toggles independently by touch and keyboard and keeps
  its state when changing scope, theme, search or period.
- Check the phone My View / Global View switch by touch and keyboard. Expanded
  Top 5 rows must have consistent gaps; priority buttons sit beside their text
  from 380px upward and wrap closely below the text on narrower phones. Long
  names and blocker messages must wrap without clipping or overlapping actions.
- Search for an opportunity outside the first five; check ranked results,
  stage/blocker filters, FY/quarter selection and empty states. Open card and
  priority actions; verify approval decisions use the existing approval gates.
  With TECH active, check that cards and expanded reports expose no currency or
  sales targets. Verify zero-data reports show neutral states without invented
  percentages. Refresh must report success or failure accurately.
- Change theme in the phone dashboard header; verify it follows navigation,
  layout changes, reload and another tab. At 768px and 1440px verify the existing
  wider dashboard layout; the tablet dashboard must retain its header.

- At 360px and 390px, verify Inbox cards, advanced filter disclosure, selection,
  pagination, local search, new enquiry, and opening a lead.
- Open an opportunity card; switch to Edit in table, change column view, expand
  and close the table, then return to cards. Verify filters match both views.
- Check More search and role-filtered destinations, including Proposal Sent
  and Workflow Admin. Confirm refresh feedback and disabled pending refresh.
- Open More from a record and switch to Full site; verify the same record URL.
- Check phone forms and dialogs with the keyboard open and safe-area padding;
  rotate to landscape and verify the chosen mode persists.

### Phone Lead inbox (320–600px, both themes)

- Open New enquiry and New opportunity at 320/390/440px in both themes. Check
  readable 44px controls, labels above fields, one dialog heading and no horizontal
  overflow. With the phone keyboard open, focused fields and action areas remain
  reachable. Check internal enquiry fields, attachment addition/removal, errors,
  unextracted recovery, intake requirements and close/focus return. Wider forms
  retain their existing layouts. Page and dialog headings share size and weight;
  logos and proposal/print document typography remain unchanged.

- Open a new lead: check full-width subject, one back arrow, Overview/Details/Email,
  readable source/attachments, and one bottom action above navigation.
- Edit a contact in Details, switch tabs and return; confirm the draft survives.
- Tap missing customer/location/contact or verification prompts; confirm Details
  opens the matching field or verification section. Expand additional classification
  and extracted fields; confirm existing decisions remain available.
- Qualify without creating an opportunity. Confirm registration remains blocked
  by missing identity, enquiry, low-confidence or verification checks, and Red
  qualification still requires continuation approval.
- Use More to reassign, compare, add documents, and drop with a required reason.
  Converted leads offer their actual linked opportunity, stay read-only, and never
  invent customer/contact/items. Dropped leads offer no qualification action.
- Check legacy leads still open intake, and tablet/desktop retain the existing
  detail layout at widths above 600px.

- Confirm a single header/search bar, the shared Global/My View switch, theme toggle, and unchanged bottom navigation.
- Switch All leads, Needs review, Converted, and Starred; search and advanced filters must combine with the selected view.
- Star/unstar directly from a row. Open a long subject to see the complete enquiry and sender address.
- Check long names, missing sender/date/preview, empty results, and no horizontal overflow; subjects wrap at word boundaries with a two-line limit.
- Use New enquiry, refresh, archive, selection, read/unread, and the existing guarded delete workflow. Scroll to the final row and pagination without obstruction.
- Confirm tablet/desktop and phone lead-detail headers keep their existing controls.
# Shared phone header

- At 320px, 390px and 440px in both themes, visit each signed-in destination and scroll: exactly one original-logo/view/theme/profile row stays visible without horizontal overflow.
- Open New enquiry, Create Opportunity and the editable table: their own header remains visible; titles, close controls, last fields and actions stay reachable, including with the on-screen keyboard.
- Change theme/view with a populated form and verify the draft is retained. Close with the close control and Escape; verify focus returns to the opener. Small confirmations, tablet/desktop and printed documents stay unchanged.

# Guided phone opportunity workflow

- At 360/390/440px, open a Spares enquiry with at least 50 requested rows and
  repeated part numbers. Check the checklist, counts, filters, search and paging.
- Edit quantities/prices in several rows. Filter, switch tasks and reload; verify
  drafts survive and duplicate models keep separate quantities and references.
- Select visible rows, then all matching rows. Preview batch markup/discount and
  confirmation: totals cover the entire enquiry, with missing/expired/removed
  rows excluded and invalid edits blocked. Preview must not save.
- Change a line or costing basis in another session after preview; Apply must
  reject the stale batch. Check permission loss and completed-stage read-only
  browsing, including Project section navigation and locked Service scope.
- Verify Project retains its Coming soon availability gate. Its prepared BOQ
  editor must remain unavailable until the Project workflow is released.
- For Service, navigate each scope/rate/deployment/report/invoice task; retain
  form edits, published rates and existing approval/transition requirements.
- Inspect light/dark themes, keyboard access, safe areas and 768/1440px layouts.
  Check truthful local-save/shared-sync failure and retry feedback.
