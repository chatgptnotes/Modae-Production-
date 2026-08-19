export const SIMULATED_CUSTOMER_SCENARIOS = [
  { status: 'Green', label: 'Green customer', hint: 'Proceed without KYC or fee', customer: 'Andritz Hydro Demo' },
  { status: 'Blue', label: 'Blue customer', hint: 'KYC required within 1 week', customer: 'New Blue Customer Demo' },
  { status: 'Amber', label: 'Amber customer', hint: 'Processing fee required within 1 week', customer: 'Amber Customer Demo' },
  { status: 'Red', label: 'Red customer', hint: 'Joint LJS / AH approval required', customer: 'Red Customer Demo' },
]

export function simulatedLead(customerStatus = 'Green', now = new Date()) {
  const scenario = SIMULATED_CUSTOMER_SCENARIOS.find(item => item.status === customerStatus) || SIMULATED_CUSTOMER_SCENARIOS[0]
  const ts = new Date(now).toISOString()
  const id = 'LD-' + Date.now()
  const subject = `${scenario.label} — vibration monitoring quotation`
  const fields = [
    { group: 'Customer', k: 'Sell-to', v: scenario.customer, conf: 98, state: 'accepted', ev: 'Email sender' },
    { group: 'Customer', k: 'Location', v: 'Korba, Chhattisgarh', conf: 96, state: 'accepted', ev: 'Email body' },
    { group: 'RFQ', k: 'Opp Type', v: 'Spares', conf: 96, state: 'accepted', ev: 'Email subject' },
    { group: 'Customer', k: 'BU / Segment', v: 'Energy / Industrial', conf: 94, state: 'accepted', ev: 'Email body' },
    { group: 'Customer', k: 'Product', v: 'ModAE', conf: 94, state: 'accepted', ev: 'Email body' },
    { group: 'Customer', k: 'Contact person', v: 'Demo Stores', conf: 96, state: 'accepted', ev: 'Email signature' },
  ]
  const verification = ['Blue', 'Amber'].includes(customerStatus)
    ? { requestedAt: ts, requestedFor: customerStatus }
    : {}
  return {
    // A Green customer is the one class that reaches us directly; the rest of
    // the simulated classes arrive as ordinary enquiries.
    id, ts, channel: 'Email', mailbox: true,
    source: customerStatus === 'Green' ? 'Existing Green customer' : 'Website enquiry',
    from: `${customerStatus.toLowerCase()}.demo@customer.example.in`,
    sender: 'Demo Customer', subject,
    body: `Demo incoming inquiry for the ${scenario.label} workflow. Please quote vibration sensor spares for TG-3.`,
    status: 'New', customerStatus, customerClassifiedAt: ts,
    verification, redFlag: customerStatus === 'Red',
    route: 'Spares', suggestedOwner: 'RS', assignedOwner: 'RS',
    completeness: 100,
    ai: {
      summary: `Simulated ${scenario.label} inquiry for workflow testing.`,
      fields, missing: [], duplicates: [], next: ['Qualify the lead', 'Complete the customer-classification gate'],
      route: 'Spares',
    },
  }
}
