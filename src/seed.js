// Reference data and dummy rows cloned from Modae's actual workflow
// (Sales Pipeline Report FY26 Excel + New Sales Opportunity Intake form,
// as shown in the Aug 10 meeting screenshots).

export const CATEGORIES = ['EUC', 'OEM', 'EPC', 'MAC', 'SI', 'ACP', 'RE/TR']
export const OWNERS = ['LJS', 'PP', 'RS', 'SS', 'PJS', 'RJS', 'SR']
export const OPP_TYPES = ['Project', 'Spares', 'Service', 'Upgrade', 'AMC', 'Training']
export const BUS = ['Aero', 'Energy', 'Service']
export const SEGMENTS = ['Thermal', 'Nuclear', 'Hydro', 'Industrial', 'O&G-US', 'O&G-MS', 'O&G-DS', 'Petrochem', 'Test Bed', 'Others']
// Product options exactly as on the intake form (Wilcoxon/ABB fell in a scroll
// gap on the recording — kept, to be confirmed).
export const PRODUCTS = [
  'ModAE', 'B&K', 'Metrix', 'Beran', 'Bently', 'CTC', 'Meggitt', 'MC Monitoring',
  'Monitran', 'Shinkawa', 'Sensonics', 'Senstec', 'Wilcoxon', 'ABB', 'BHEL',
  'Emerson', 'Honeywell', 'Hima', 'Rockwell', 'Siemens', 'Yokogawa', 'Valmet', 'Various',
]
export const PROB_LEVELS = ['Low', 'Medium', 'High']
export const STAGES = ['Lead', 'RFI', 'Budgetary', 'RFQ', 'Firm Bid', 'Won', 'Lost']
export const CLOSE_REASONS = [
  'Relationship', 'Unique Product', 'Pedigree', 'Best Price', 'Trade Compliance',
  'Technical Compliance', 'Commercial Compliance', 'Capability', 'Lead Time',
  'No Bid', 'Abandoned/Delayed', 'Duplicate Opportunity',
]
// Blue = new customer pending admin verification (per the meeting's
// green/amber/red/blue qualification rules).
export const CUSTOMER_STATUSES = ['Green', 'Amber', 'Red', 'Blue']

// Columns: value/cogs/gm in ₹ thousands (K₹), like the sheet.
export const seedOpportunities = [
  {
    sl: 74, id: '2607215RS', sellTo: 'BHEL Bhopal', category: 'OEM', location: 'Bhopal',
    customerStatus: 'Amber', eucName: 'BHEL', eucLocation: 'Bhopal',
    oppName: 'AGMS for ARUN-3 Project', owner: 'RS', oppType: 'Project', bu: 'Energy',
    segment: 'Hydro', product: 'B&K', prob: 'Low',
    valueK: 0, cogsK: 0, createDate: '2026-07-14', proposalDate: '',
    orderDate: '', invoiceDate: '', status: 'Open', stage: 'RFQ',
    closedReason: '', contactPerson: 'Dinesh Kumar Soni', contactPhone: '+91 7552505951',
    lastUpdated: '2026-07-14', forecast: false, remarks: 'Same project specs as ARUN3 HEP',
  },
  {
    sl: 76, id: '2607216PP', sellTo: 'Pare Hydro Project (NEEPCO)', category: 'EUC', location: 'Itanagar',
    customerStatus: 'Amber', eucName: 'NEEPCO', eucLocation: 'Arunachal Pradesh',
    oppName: 'VMS Upgrade', owner: 'PP', oppType: 'Upgrade', bu: 'Energy',
    segment: 'Hydro', product: 'B&K', prob: 'Low',
    valueK: 0, cogsK: 0, createDate: '2026-07-15', proposalDate: '',
    orderDate: '', invoiceDate: '', status: 'Open', stage: 'RFI',
    closedReason: '', contactPerson: 'Abdul Malik Laskar', contactPhone: '+91 84730 29596',
    lastUpdated: '2026-07-15', forecast: false, remarks: 'Yet to receive signal list and machine details',
  },
  {
    sl: 77, id: '2607217RS', sellTo: 'Prime Engineering/PECO', category: 'ACP', location: 'Mumbai',
    customerStatus: 'Green', eucName: 'MAHAGENCO', eucLocation: 'Koyna',
    oppName: '50 Qty Loop Powered Velocity Transmitter', owner: 'RS', oppType: 'Spares', bu: 'Energy',
    segment: 'Hydro', product: 'B&K', prob: 'Low',
    valueK: 2371, cogsK: 1197, createDate: '2026-07-28', proposalDate: '2026-07-28',
    orderDate: '', invoiceDate: '', status: 'Open', stage: 'Budgetary',
    closedReason: '', contactPerson: 'Meet Dhodia', contactPhone: '+91 8849610576',
    lastUpdated: '2026-07-28', forecast: true, remarks: '50 Qty Loop powered Velocity Transmitter',
  },
  {
    sl: 78, id: '2608218PP', sellTo: "Jost's Engineering", category: 'SI', location: 'Mumbai',
    customerStatus: 'Green', eucName: 'HAL', eucLocation: 'Bangalore',
    oppName: 'Vibration Monitoring System', owner: 'PP', oppType: 'Project', bu: 'Aero',
    segment: 'Test Bed', product: 'B&K', prob: 'Low',
    valueK: 2387, cogsK: 1196, createDate: '2026-08-04', proposalDate: '2026-08-04',
    orderDate: '', invoiceDate: '', status: 'Open', stage: 'Budgetary',
    closedReason: '', contactPerson: 'Rajshekhar Uchil', contactPhone: '+91 9880170895',
    lastUpdated: '2026-08-04', forecast: true, remarks: '',
  },
  {
    sl: 79, id: '2608219PP', sellTo: 'APGENCO', category: 'EUC', location: 'Vijayawada',
    customerStatus: 'Amber', eucName: 'APGENCO', eucLocation: 'Srisailam',
    oppName: 'Air Gap & Vibration Monitoring', owner: 'PP', oppType: 'Project', bu: 'Energy',
    segment: 'Hydro', product: 'B&K', prob: 'Medium',
    valueK: 0, cogsK: 0, createDate: '2026-08-06', proposalDate: '',
    orderDate: '', invoiceDate: '', status: 'Open', stage: 'Budgetary',
    closedReason: '', contactPerson: 'Sai Satyanarayana', contactPhone: '+91 9493120578',
    lastUpdated: '2026-08-06', forecast: false, remarks: '',
  },
  {
    sl: 80, id: '2608220PP', sellTo: 'GE Vernova', category: 'OEM', location: 'Chennai',
    customerStatus: 'Green', eucName: 'GE Vernova', eucLocation: 'Chennai',
    oppName: 'Vibration Sensor Cable', owner: 'PP', oppType: 'Spares', bu: 'Energy',
    segment: 'Thermal', product: 'B&K', prob: 'Low',
    valueK: 0, cogsK: 0, createDate: '2026-08-06', proposalDate: '',
    orderDate: '', invoiceDate: '', status: 'Open', stage: 'Budgetary',
    closedReason: '', contactPerson: 'Chakresh Thakur', contactPhone: '+91 9868256765',
    lastUpdated: '2026-08-06', forecast: false, remarks: '',
  },
  {
    sl: 81, id: '2608221RS', sellTo: 'Andritz Hydro', category: 'OEM', location: 'Mandideep',
    customerStatus: 'Green', eucName: 'Limak', eucLocation: 'Incir',
    oppName: 'VMS for LiMAK Project Turkey', owner: 'RS', oppType: 'Project', bu: 'Energy',
    segment: 'Hydro', product: 'B&K', prob: 'Low',
    valueK: 0, cogsK: 0, createDate: '2026-08-09', proposalDate: '',
    orderDate: '2026-08-30', invoiceDate: '', status: 'Open', stage: 'Firm Bid',
    closedReason: '', contactPerson: 'Gautam Chaurasiya', contactPhone: '+91 09649679',
    lastUpdated: '2026-08-09', forecast: true, remarks: 'RFQ recd. on 7 Aug, Bid Due on 11 Aug',
  },
  {
    sl: 82, id: '2608222RS', sellTo: 'Andritz Hydro', category: 'OEM', location: 'Mandideep',
    customerStatus: 'Green', eucName: 'Adani (Gandikota)', eucLocation: 'Kadappa',
    oppName: 'Gandikota PSP — Vibration & Air Gap Monitoring, 7 Units (5×300MW)+(2×150MW)', owner: 'RS',
    oppType: 'Project', bu: 'Energy', segment: 'Hydro', product: 'B&K', prob: 'Medium',
    valueK: 100, cogsK: 50, createDate: '2026-08-09', proposalDate: '2026-08-09',
    orderDate: '2026-08-30', invoiceDate: '', status: 'Open', stage: 'Firm Bid',
    closedReason: '', contactPerson: 'Gautam Chaurasiya', contactPhone: '+91 09649679',
    lastUpdated: '2026-08-09', forecast: true, remarks: 'RFQ recd. on 7 Aug, Bid Due on 11 Aug',
  },
  {
    sl: 83, id: '2608223RS', sellTo: 'KSB Limited', category: 'OEM', location: 'Pune',
    customerStatus: 'Green', eucName: 'KSB', eucLocation: 'Pune',
    oppName: 'B&K Vibro Spares', owner: 'RS', oppType: 'Spares', bu: 'Energy',
    segment: 'Industrial', product: 'B&K', prob: 'Low',
    valueK: 0, cogsK: 0, createDate: '2026-08-09', proposalDate: '',
    orderDate: '', invoiceDate: '', status: 'Open', stage: 'RFQ',
    closedReason: '', contactPerson: 'Sandeep Amdekar', contactPhone: '+91 9860033476',
    lastUpdated: '2026-08-09', forecast: false, remarks: 'Vivek Joshi reference',
  },
  {
    sl: 72, id: '2606212RS', sellTo: 'BHEL Noida', category: 'OEM', location: 'Noida',
    customerStatus: 'Amber', eucName: 'NTPC', eucLocation: 'Singrauli',
    oppName: 'Vibration Spares Package', owner: 'RS', oppType: 'Spares', bu: 'Energy',
    segment: 'Thermal', product: 'B&K', prob: 'Low',
    valueK: 8285, cogsK: 3521, createDate: '2026-06-10', proposalDate: '2026-07-05',
    orderDate: '', invoiceDate: '', status: 'Closed', stage: 'Lost',
    closedReason: 'Abandoned/Delayed', contactPerson: 'Atunu Mallick', contactPhone: '+91 8527836669',
    lastUpdated: '2026-07-28', forecast: false,
    remarks: 'They are planning for next year and they had another supplier',
  },
  {
    sl: 73, id: '2606213RS', sellTo: 'Prime Engineering/PECO', category: 'ACP', location: 'Mumbai',
    customerStatus: 'Green', eucName: 'MAHAGENCO', eucLocation: 'Koyna',
    oppName: 'Upgr. of VC-4000-Koyna', owner: 'RS', oppType: 'Project', bu: 'Energy',
    segment: 'Hydro', product: 'B&K', prob: 'Low',
    valueK: 4299, cogsK: 2042, createDate: '2026-06-12', proposalDate: '2026-07-01',
    orderDate: '2027-03-15', invoiceDate: '', status: 'Open', stage: 'Firm Bid',
    closedReason: '', contactPerson: 'Saharsh Desai', contactPhone: '+91 9316709549',
    lastUpdated: '2026-07-01', forecast: true, remarks: 'Quote shared, follow up on',
  },
  {
    sl: 75, id: '2607214RS', sellTo: 'Andritz Hydro', category: 'OEM', location: 'Mandideep',
    customerStatus: 'Green', eucName: 'Pinnapuram Unit 4', eucLocation: 'TN',
    oppName: 'VMS Troubleshooting & AMC', owner: 'RS', oppType: 'Service', bu: 'Service',
    segment: 'Hydro', product: 'B&K', prob: 'Low',
    valueK: 9873, cogsK: 3826, createDate: '2026-07-08', proposalDate: '2026-07-12',
    orderDate: '', invoiceDate: '', status: 'Closed', stage: 'Lost',
    closedReason: 'Abandoned/Delayed', contactPerson: 'Achinta Datta', contactPhone: '+91 9893546417',
    lastUpdated: '2026-07-08', forecast: false, remarks: '',
  },
  {
    sl: 71, id: '2601122LJS', sellTo: 'Andritz Hydro', category: 'OEM', location: 'Mandideep',
    customerStatus: 'Green', eucName: 'Limak', eucLocation: 'Turkey',
    oppName: 'VMS for LiMAK Project Turkey — shipped 30 Jul', owner: 'LJS', oppType: 'Project', bu: 'Energy',
    segment: 'Hydro', product: 'B&K', prob: 'Low',
    valueK: 7500, cogsK: 4200, createDate: '2026-01-20', proposalDate: '2026-02-10',
    orderDate: '2026-04-12', invoiceDate: '2026-07-30', status: 'Closed', stage: 'Won',
    closedReason: 'Relationship', contactPerson: 'Gautam Chaurasiya', contactPhone: '+91 09649679',
    lastUpdated: '2026-07-30', forecast: false, remarks: 'Milestone order — first Turkey delivery',
  },
  {
    sl: 70, id: '2607180SR', sellTo: 'BMMS', category: 'EUC', location: 'Bangalore',
    customerStatus: 'Amber', eucName: 'BMMS', eucLocation: 'Bangalore',
    oppName: 'Operator Training — 3 weeks', owner: 'SR', oppType: 'Training', bu: 'Service',
    segment: 'Industrial', product: 'B&K', prob: 'High',
    valueK: 950, cogsK: 300, createDate: '2026-07-18', proposalDate: '2026-07-22',
    orderDate: '2026-08-25', invoiceDate: '2026-09-10', status: 'Open', stage: 'Firm Bid',
    closedReason: '', contactPerson: 'R. Iyer', contactPhone: '+91 98450 22222',
    lastUpdated: '2026-08-06', forecast: true, remarks: 'PO expected this month; won on lead time (3 weeks)',
  },
]

// Personas for the header role switcher (from the WinTrack Ver 1.1 wireframe's
// Users & Roles). `commercial` gates Value/COGS/GM, forecasts and pricing.
export const ROLES = {
  SUPER: { name: 'System Owner', label: 'Super Admin — Platform Owner', commercial: true, admin: true },
  ADMIN: { name: 'Admin', label: 'Admin — System Administrator', commercial: true, admin: true },
  LJS: { name: 'L. J. Swaminathan', label: 'LJS — Strategic Approver', commercial: true },
  AH: { name: 'A. Hameed', label: 'AH — Commercial & Ops Approver', commercial: true },
  RS: { name: 'R. Sundaram', label: 'RS — Sales Owner', commercial: false },
  PP: { name: 'P. Prakash', label: 'PP — Sales Owner', commercial: false },
  SS: { name: 'S. Subramanian', label: 'SS — Sales Owner', commercial: false },
  PJS: { name: 'P. J. Sharma', label: 'PJS — Sales Owner', commercial: false },
  RJS: { name: 'R. J. Singh', label: 'RJS — Sales Owner', commercial: false },
  SR: { name: 'S. Rao', label: 'SR — Sales Owner', commercial: false },
}

export const seedUsers = [
  { id: 'U-001', name: 'System Owner', email: 'admin@modae.demo', role: 'SUPER', status: 'Active', created: '2026-04-01' },
  { id: 'U-002', name: 'L. J. Swaminathan', email: 'ljs@modae.demo', role: 'LJS', status: 'Active', created: '2026-04-01' },
  { id: 'U-003', name: 'A. Hameed', email: 'ah@modae.demo', role: 'AH', status: 'Active', created: '2026-04-01' },
  { id: 'U-004', name: 'R. Sundaram', email: 'rs@modae.demo', role: 'RS', status: 'Active', created: '2026-04-15' },
  { id: 'U-005', name: 'P. Prakash', email: 'pp@modae.demo', role: 'PP', status: 'Active', created: '2026-04-15' },
  { id: 'U-006', name: 'S. Rao', email: 'sr@modae.demo', role: 'SR', status: 'Pending', created: '2026-08-08' },
]

export const SUBFOLDERS = ['Customer Specs', 'Partner Docs', 'Proposal']

export const seedFiles = {
  '2608222RS': {
    'Customer Specs': [
      { name: 'RFQ_6001099682_Gandikota.pdf', date: '2026-08-07', size: '3.1 MB' },
      { name: 'Signal_List_7_Units.xlsx', date: '2026-08-07', size: '210 KB' },
    ],
    'Partner Docs': [],
    Proposal: [
      { name: '2608222RS Andritz Adani Gandikota PSP Project Re.xlsx', date: '2026-08-09', size: '840 KB' },
    ],
  },
  '2601122LJS': {
    'Customer Specs': [{ name: 'Andritz_LiMAK_TechSpec.pdf', date: '2026-01-22', size: '4.2 MB' }],
    'Partner Docs': [{ name: 'BNK_discount_approval_50pct.pdf', date: '2026-02-02', size: '180 KB' }],
    Proposal: [{ name: 'Proposal_2601122_Rev02.pdf', date: '2026-03-21', size: '2.9 MB' }],
  },
}

// B&K (BNK) price list — base parts plus configurable adders (EUR).
export const seedPriceLists = {
  BNK: {
    currency: 'EUR', version: '2026-01', uploaded: '2026-01-05',
    parts: [
      { pn: 'RK16-BASE', desc: '16-slot base rack chassis', price: 2000, adders: [
        { code: 'CE', desc: 'CE mark', price: 110 },
        { code: 'FMK', desc: 'Flush mount kit', price: 65 },
      ]},
      { pn: 'IN081-3-110-50', desc: 'Vibration sensor IN-081, 110mm', price: 954, adders: [
        { code: 'L-EXT', desc: 'Extended length >110mm', price: 98 },
      ]},
      { pn: 'AGSC-51-4-CAB', desc: 'Air gap sensor w/ cable', price: 1300, adders: [] },
      { pn: 'EC-05', desc: 'Extension cable 5m', price: 105, adders: [] },
      { pn: 'EC-10', desc: 'Extension cable 10m', price: 148, adders: [] },
      { pn: 'VC-8000/RCK', desc: 'VC-8000 rack', price: 2175, adders: [] },
      { pn: 'VC-8000/RCM', desc: 'VC-8000 rack condition monitor', price: 950, adders: [] },
      { pn: 'VC-8000/eSAM', desc: 'VC-8000 eSAM module', price: 4100, adders: [] },
      { pn: 'VC-8000/UMM', desc: 'VC-8000 universal monitoring module', price: 4800, adders: [] },
      { pn: 'SETPOINT-XC-CMS', desc: 'SETPOINT XC CMS software', price: 49000, adders: [] },
      { pn: 'CMS-TAG-4000', desc: 'CMS software license — 4000 tags', price: 26800, adders: [] },
      { pn: 'CMS-TAG-5000', desc: 'CMS software license — 5000 tags', price: 31900, adders: [] },
      { pn: 'CMS-PI-IF', desc: 'AVEVA PI interface', price: 3300, adders: [] },
      { pn: 'CMS-VIS', desc: 'Visualization license (per seat)', price: 1100, adders: [] },
    ],
  },
  Metrics: {
    currency: 'USD', version: '2026-03', uploaded: '2026-03-12',
    parts: [
      { pn: 'MX-2110', desc: 'Proximity transducer system', price: 640, adders: [] },
      { pn: 'MX-8030', desc: 'Velocity sensor', price: 410, adders: [] },
    ],
  },
}

export const seedAdhocParts = [
  { pn: '330103-00-05-10-02-00', supplier: 'Royal Traders', price: 100, currency: 'USD', date: '2026-08-10', note: 'Bentley probe — trader quote' },
  { pn: 'PANEL-IP54-2000', supplier: 'JVB Engineering', price: 85000, currency: 'INR', date: '2026-06-20', note: 'Panel fabrication' },
]

export const seedRateSheet = [
  { role: 'Service Engineer', ratePerDayK: 45 },
  { role: 'Senior Engineer / Commissioning', ratePerDayK: 65 },
  { role: 'Training (per day, classroom)', ratePerDayK: 55 },
]

export const seedCustomers = [
  { name: 'Andritz Hydro', category: 'EUC/OEM', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: 'Prime Engineering/PECO', category: 'ACP', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: 'BHEL Bhopal', category: 'OEM', status: 'Amber', kyc: 'Renewal due', payment: 'Avg 60 days' },
  { name: 'BHEL Noida', category: 'OEM', status: 'Amber', kyc: 'Valid', payment: 'Avg 90 days' },
  { name: 'CAPSA Dubai / Realix', category: 'RE/TR', status: 'Red', kyc: 'Pending', payment: '>180 days overdue' },
  { name: 'KSB Limited', category: 'OEM', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: 'APGENCO', category: 'EUC', status: 'Amber', kyc: 'Valid', payment: 'Avg 75 days' },
  { name: 'GE Vernova', category: 'OEM', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: "Jost's Engineering", category: 'SI', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: 'Navitus Controls', category: 'SI', status: 'Amber', kyc: 'Valid', payment: 'Avg 60 days' },
  { name: 'BMMS', category: 'EUC', status: 'Amber', kyc: 'Renewal due', payment: 'Avg 60 days' },
  { name: 'New customer (auto-flagged)', category: '—', status: 'Blue', kyc: '—', payment: '—' },
]

// Imported Items Pricing & Costing Factors — as on the Priced BoQ sheet.
export const defaultCosting = {
  baseRate: 112.0,      // Euro-₹ Base (spot + ₹1 buffer, rounded up)
  usdBase: 90.0,        // USD-₹ Base — imports come in both € and $
  cdErvContPct: 16.0,   // CD+ERV+Cont. (8.5% customs + 2.5% freight + 5% contingency)
  bnkDiscPct: 50.0,     // B&K Disc% (applies to the B&K list only)
  inputGMPct: 35.0,     // Input GM%
  financeCostK: 0,      // Finance Cost (K₹) — deducted before Net GM, as on the real sheet
}

export function newProposal(oppId, opp) {
  return {
    oppId,
    ourRef: oppId,
    bidStage: 'Binding',
    bidType: 'Priced',
    revision: '00',
    revisionDate: new Date().toISOString().slice(0, 10),
    units: 7,           // № of machines/units — Total Qty = Qty/Unit × units + Common + Spares
    addressee: opp ? `M/s. ${opp.sellTo}` : '',
    kindAttn: opp ? opp.contactPerson : '',
    attnPhone: opp ? opp.contactPhone : '',
    rfqNumber: '',
    subject: opp ? `Proposal For ${opp.oppName}` : '',
    project: opp ? opp.oppName : '',
    bom: [],
    costing: { ...defaultCosting },
    signals: [
      { signal: 'Radial Vibration X/Y', perUnit: 8, units: 7 },
      { signal: 'Axial Position', perUnit: 2, units: 7 },
      { signal: 'Air Gap', perUnit: 12, units: 7 },
      { signal: 'Keyphasor', perUnit: 1, units: 7 },
    ],
    terms: [
      { term: 'Payment', customerAsk: '90 days credit', ourResponse: '30 days from invoice', status: 'Deviation' },
      { term: 'Delivery', customerAsk: '8 weeks', ourResponse: '10–12 weeks ex-works', status: 'Deviation' },
      { term: 'Warranty', customerAsk: '18 months', ourResponse: '18 months from supply', status: 'Comply' },
    ],
  }
}
