# ModAE Phase 1 QA Test Cases

## Scope

Phase 1 covers Flow Proposal / Quotation Automation for Spare Parts, Services and Mixed enquiries. Phase 2 project proposal automation is excluded.

## 1. Email Intake and Extraction

| ID | Test case | Expected result |
|---|---|---|
| TC-001 | Upload a tender PDF enquiry | PDF is accepted and processed |
| TC-002 | Upload a saved `.eml` enquiry | Email file is accepted and processed |
| TC-003 | Extract customer and contact details | Correct values populate the enquiry |
| TC-004 | Extract RFQ number and date | RFQ number and date are populated |
| TC-005 | Extract line items and quantities | Items and quantities are captured correctly |
| TC-006 | Classify Spare Parts enquiry | Route is set to Spare Parts |
| TC-007 | Classify Services enquiry | Route is set to Services |
| TC-008 | Classify Mixed enquiry | Spare and service requirements are retained |
| TC-009 | Process incomplete enquiry | Missing fields are clearly flagged |
| TC-010 | Submit duplicate enquiry | Duplicate risk is detected and displayed |

## 2. Customer Validation and KYC

| ID | Test case | Expected result |
|---|---|---|
| TC-011 | Mark customer Verified | Workflow can continue |
| TC-012 | Mark customer Pending | Quotation workflow remains blocked |
| TC-013 | Mark customer Not Verified | Quotation workflow remains blocked |
| TC-014 | Validate GST, PAN and CIN | Valid values pass; invalid values are rejected |
| TC-015 | Upload and confirm KYC document | Document, status and audit record are saved |
| TC-016 | Reload after KYC update | KYC state remains unchanged |

## 3. Knowledge-Base Lookup

| ID | Test case | Expected result |
|---|---|---|
| TC-017 | Match exact spare-part number | Correct catalogue item and price are returned |
| TC-018 | Match formatted part number or alias | Approved formatting and aliases resolve correctly |
| TC-019 | Search service rate sheet | Correct service rate is returned |
| TC-020 | Process unmatched part | Item is flagged for manual review |
| TC-021 | Process ambiguous match | Alternatives are shown without auto-confirmation |
| TC-022 | Confirm valid price | Positive price and quantity can be confirmed |
| TC-023 | Confirm zero price | Confirmation is blocked |
| TC-024 | Enter manual price | Price is saved with source and user attribution |

## 4. RFQ Logging and Proposal Number

| ID | Test case | Expected result |
|---|---|---|
| TC-025 | Create RFQ from enquiry | One RFQ record is created |
| TC-026 | Save customer, owner and source | Correct metadata is retained |
| TC-027 | Save extracted line items | Requested items and quantities are retained |
| TC-028 | Generate proposal number | Unique proposal number is generated |
| TC-029 | Set initial RFQ status | Status is In Progress |
| TC-030 | Reload and sync RFQ | Data remains available after reload and sync |

## 5. Quotation Document Generator

| ID | Test case | Expected result |
|---|---|---|
| TC-031 | Generate Spare Parts quotation | Spare Parts quotation is created |
| TC-032 | Generate Services quotation | Services quotation is created |
| TC-033 | Generate Mixed quotation | Spare and service sections are included |
| TC-034 | Verify customer, RFQ and dates | Values match the source enquiry |
| TC-035 | Verify quantities, prices and totals | Commercial calculations are correct |
| TC-036 | Verify GST and standard terms | Configured tax treatment and terms appear |
| TC-037 | Generate PDF and Excel output | Files are readable and complete |
| TC-038 | Generate empty quotation | Document is created without crashing |
| TC-039 | Hide unconfirmed prices | Unconfirmed prices are not presented as final |

## 6. Review and Approval Workflow

| ID | Test case | Expected result |
|---|---|---|
| TC-040 | Request quotation approval | Approval request is created |
| TC-041 | Route approval to reviewer | Correct reviewer receives the request |
| TC-042 | Approve quotation | Status changes to Approved |
| TC-043 | Reject quotation | Rejection requires and stores a reason |
| TC-044 | Request quotation edits | Quotation returns to editing state |
| TC-045 | Re-submit edited quotation | New review request is created |
| TC-046 | Prevent unapproved dispatch | Send action remains blocked |
| TC-047 | Preserve approval history | Previous decisions remain auditable |
| TC-048 | Change approved quotation | Affected approval is reopened |

## 7. Automated Quotation Dispatch

| ID | Test case | Expected result |
|---|---|---|
| TC-049 | Open quotation email | Recipient and subject are pre-filled |
| TC-050 | Verify recipient and attachment | Correct customer and quotation file are used |
| TC-051 | Send approved quotation | Email is dispatched successfully |
| TC-052 | Send unapproved quotation | Dispatch is blocked |
| TC-053 | Record sent status and timestamp | RFQ status and dispatch time are saved |
| TC-054 | Archive sent quotation | Sent document is retained in the RFQ folder |
| TC-055 | Simulate dispatch failure | Error is shown; status is not falsely set to Sent |

## 8. Embedded CRM and Tracker

| ID | Test case | Expected result |
|---|---|---|
| TC-056 | Open customer and quotation records | Correct records and details are displayed |
| TC-057 | Filter by salesperson | Only matching records are shown |
| TC-058 | Filter by status and date | Filters return the correct records |
| TC-059 | View pipeline totals | Totals match underlying RFQ data |
| TC-060 | Check role-based visibility | Users see only permitted records |
| TC-061 | Update tracker value | Updated value appears consistently |
| TC-062 | Reload and export tracker | Data persists and export is correct |

## 9. End-to-End Scenarios

### TC-063 — Spare Parts quotation

Enquiry → extraction → KYC → catalogue lookup → RFQ → quotation → approval → dispatch.

Expected result: quotation is correctly generated, approved, sent and archived.

### TC-064 — Services quotation

Enquiry → extraction → KYC → service-rate lookup → quotation → approval → dispatch.

Expected result: service scope, rates and totals are correct.

### TC-065 — Mixed quotation

Enquiry → extract spare and service requirements → price both → generate combined quotation → approval → dispatch.

Expected result: both sections appear correctly in one quotation.

### TC-066 — Incomplete enquiry

Add incomplete enquiry → review missing fields → complete manually → continue to quotation.

Expected result: only required missing information blocks progress.

### TC-067 — Unmatched part

Add unknown part → verify automatic pricing is blocked → enter or approve manual price → continue.

Expected result: unknown parts are never silently priced or confirmed.

### TC-068 — Rejected quotation

Generate quotation → reject with reason → edit → re-submit → approve → dispatch.

Expected result: rejection, revision and final approval remain in the audit history.

## Acceptance Criteria

- All eight Phase 1 modules pass their applicable test cases.
- Spare Parts, Services and Mixed end-to-end scenarios pass.
- No unapproved quotation can be dispatched.
- Quotation values, statuses and timestamps are accurate.
- KYC remains a human-controlled checkpoint.
- Approval and dispatch actions are auditable.
- Manual browser testing passes on desktop and mobile viewports.
