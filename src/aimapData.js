// AI & automation map — transcribed from the BT clickable prototype (AI_MAP).
// Each item: t = intervention title, phase = 1 (interactive in this build) | 2 (direction preview),
// live = genuinely calls Gemini through the ai Edge Function; everything else is
// deterministic or seeded, and the map says so rather than implying a model ran.
// d = description, to = route in THIS app where the intervention is demonstrated.
export const AI_MAP = [
  {
    group: 'Lead & opportunity intelligence (CRM)',
    items: [
      { t: 'Email intake & NLP parsing', phase: 1, live: true, d: 'Reads the common sales mailbox, extracts customer, contact and RFQ details, tags the enquiry as Spares / Services / Mixed.', to: '/inbox' },
      { t: 'Missing-information detection', phase: 1, live: true, d: 'Flags incomplete enquiries and drafts the clarification request automatically.', to: '/inbox/LD-205' },
      { t: 'Customer classification (Green / Blue / Amber / Red)', phase: 1, d: 'Suggests the customer class that drives KYC, fees and approval routing.', to: '/customers' },
      { t: 'Duplicate lead detection', phase: 1, d: 'Flags likely-duplicate leads before they become separate opportunities.', to: '/inbox' },
      { t: 'Opportunity ID & owner suggestion', phase: 1, live: true, d: 'Suggests the opportunity owner from region/type rules and generates the ID on registration.', to: '/register/LD-203' },
      { t: 'Customer health score', phase: 1, d: 'Indicative relationship-health score with supporting evidence, editable by the sales team.', to: '/customers' },
      { t: 'Win-probability / risk suggestion', phase: 1, d: 'Suggested win percentage shown per opportunity, always human-editable.', to: '/' },
      { t: 'Stale-opportunity detection', phase: 1, d: 'Flags opportunities that have passed their due date with no closure.', to: '/' },
    ],
  },
  {
    group: 'Proposal creation intelligence',
    items: [
      { t: 'Knowledge-base lookup / fuzzy part matching', phase: 1, d: 'Matches RFQ line items to the price list using fuzzy and semantic matching, with a confidence score per line.', to: '/opp/2607217RS/proposal' },
      { t: 'Equivalent-product suggestion', phase: 1, d: 'Suggests a compatible alternative when an exact part is superseded or unavailable.', to: '/opp/2607217RS/proposal' },
      { t: 'Auto-fill of quotation / proposal template', phase: 1, d: 'Populates the proposal document from structured opportunity data.', to: '/opp/2607217RS/proposal' },
      { t: 'Pricing-anomaly detection', phase: 1, d: 'Flags expired price-list sources and out-of-band pricing before a proposal goes out.', to: '/opp/2607217RS/proposal' },
      { t: 'Compliance matrix generation', phase: 1, d: 'Drafts the technical compliance matrix against ModAE\'s standard capability list, for engineer review.', to: '/opp/2608222RS/proposal' },
      { t: 'Revision history & comparison', phase: 1, d: 'Tracks and compares quote revisions side by side.', to: '/opp/2607217RS/proposal' },
      { t: 'Commercial-terms recommendation', phase: 1, d: 'Suggests payment, delivery and validity terms from customer class and route, for one-click insertion.', to: '/opp/2607217RS/proposal' },
      { t: 'RFP / SOW scope parsing', phase: 2, live: true, d: 'Parse a full RFP or Scope-of-Work document into structured, confidence-scored requirements, reviewed the same way as lead intake.', to: '/opp/2608222RS/proposal' },
      { t: 'Multi-currency conversion', phase: 2, d: 'Convert the proposal total using a configurable hedge rate for international tenders.', to: '/opp/2608222RS/proposal' },
      { t: 'T&C clause library generator', phase: 2, d: 'Assemble full legal terms from a maintained clause library by opportunity type and jurisdiction.', to: '/opp/2607217RS/proposal' },
    ],
  },
  {
    group: 'Post-quotation intelligence',
    items: [
      { t: 'Follow-up reminders & validity tracking', phase: 1, d: 'Tracks quote ageing and prompts scheduled follow-up touchpoints.', to: '/opp/2606213RS/proposal' },
      { t: 'Escalation suggestion', phase: 1, d: 'Suggests when a stalled quote should be escalated, and to whom.', to: '/opp/2606213RS/proposal' },
      { t: 'Draft negotiation response', phase: 1, live: true, d: 'Drafts a reply for common follow-up situations, for review before sending — nothing sends automatically.', to: '/opp/2606213RS/proposal' },
    ],
  },
  {
    group: 'Dashboards & analytics intelligence',
    items: [
      { t: 'OEM / region / owner reporting', phase: 1, d: 'Auto-generated breakdowns of pipeline by owner, route and business area.', to: '/analytics' },
      { t: 'Weighted revenue forecast', phase: 1, d: 'Pipeline value weighted by suggested win probability.', to: '/analytics' },
      { t: 'Win / loss analysis', phase: 1, d: 'Tracks closed-won and closed-lost outcomes with reasons.', to: '/analytics' },
      { t: 'Drill-down / stage filtering', phase: 1, d: 'Every chart and list can be filtered and clicked through to the underlying records.', to: '/' },
      { t: 'Target vs. actual, by salesperson', phase: 1, d: 'Quarterly attainment tracking per sales owner against their annual number.', to: '/analytics' },
    ],
  },
  {
    group: 'Execution & finance direction',
    items: [
      { t: 'PO validation & handover workflow', phase: 2, d: 'Line-by-line comparison of proposal vs. customer PO, with joint LJS/AH acceptance and a delivery handover checklist. Built as a working preview on one seeded scenario to show the direction.', to: '/opp/2601122LJS/po' },
      { t: 'Accounting integration (Tally / Zoho Books)', phase: 2, d: 'Auto-create the customer invoice in your accounting system once handover is approved.', to: '/opp/2601122LJS/po' },
    ],
  },
]
