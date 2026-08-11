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
  TECH: { name: 'T. Rao', label: 'TECH — Technical Reviewer', commercial: false },
  CUST: { name: 'Customer contact', label: 'Customer — External portal', commercial: false, external: true },
}

// Page-permission matrix (from the BT prototype's PERMS). Sales owners all get
// the same set; CUST sees the external portal only.
const SALES_PAGES = ['home', 'inbox', 'tracker', 'my', 'new', 'tender', 'approvals', 'folders',
  'analytics', 'customers', 'po', 'aimap', 'launcher', 'notes', 'voice']
export const PERMS = {
  SUPER: ['home', 'inbox', 'tracker', 'my', 'new', 'tender', 'approvals', 'folders', 'pricelists',
    'dashboard', 'analytics', 'customers', 'audit', 'users', 'aimap', 'admin', 'po', 'launcher', 'notes', 'voice', 'portal'],
  ADMIN: ['home', 'inbox', 'tracker', 'my', 'new', 'tender', 'approvals', 'folders', 'pricelists',
    'dashboard', 'analytics', 'customers', 'audit', 'users', 'aimap', 'admin', 'po', 'launcher', 'notes', 'voice'],
  LJS: ['home', 'inbox', 'tracker', 'my', 'new', 'tender', 'approvals', 'folders', 'pricelists',
    'dashboard', 'analytics', 'customers', 'audit', 'aimap', 'admin', 'po', 'launcher', 'notes', 'voice', 'portal'],
  AH: ['home', 'tracker', 'my', 'approvals', 'folders', 'pricelists', 'dashboard', 'analytics',
    'customers', 'audit', 'aimap', 'po', 'launcher', 'notes'],
  RS: SALES_PAGES, PP: SALES_PAGES, SS: SALES_PAGES, PJS: SALES_PAGES, RJS: SALES_PAGES, SR: SALES_PAGES,
  TECH: ['home', 'inbox', 'tracker', 'my', 'approvals', 'aimap', 'launcher', 'notes'],
  CUST: ['portal'],
}

// Opportunity lifecycle milestones (BT prototype stepper).
export const MILESTONES = ['Intake', 'Qualification', 'Customer/KYC', 'Registration', 'Screening',
  'Clarification', 'Sourcing', 'Proposal', 'Approval', 'Submitted', 'Follow-up', 'PO Validation', 'Handover']

// Map the pipeline stage onto a lifecycle milestone for rows that predate the workbench.
export function milestoneForStage(stage, status) {
  if (status === 'Closed' && stage === 'Lost') return 'Follow-up'
  switch (stage) {
    case 'Lead': return 'Intake'
    case 'RFI': return 'Clarification'
    case 'Budgetary': return 'Proposal'
    case 'RFQ': return 'Sourcing'
    case 'Firm Bid': return 'Submitted'
    case 'Won': return 'Handover'
    case 'Lost': return 'Follow-up'
    default: return 'Screening'
  }
}

// Route (workbench flavour) from the opp type.
export function routeForType(oppType) {
  if (oppType === 'Spares') return 'Spares'
  if (oppType === 'Service' || oppType === 'AMC' || oppType === 'Training') return 'Service'
  return 'Project'
}

// Demo accounts — password is plaintext in localStorage on purpose (demo only,
// clearly disclaimed on the login screen).
export const DEMO_PASSWORD = 'Demo@1234'
export const seedUsers = [
  { id: 'U-001', name: 'System Owner', email: 'admin@modae.demo', role: 'SUPER', status: 'Active', created: '2026-04-01', pw: DEMO_PASSWORD },
  { id: 'U-002', name: 'L. J. Swaminathan', email: 'ljs@modae.demo', role: 'LJS', status: 'Active', created: '2026-04-01', pw: DEMO_PASSWORD },
  { id: 'U-003', name: 'A. Hameed', email: 'ah@modae.demo', role: 'AH', status: 'Active', created: '2026-04-01', pw: DEMO_PASSWORD },
  { id: 'U-004', name: 'R. Sundaram', email: 'rs@modae.demo', role: 'RS', status: 'Active', created: '2026-04-15', pw: DEMO_PASSWORD },
  { id: 'U-005', name: 'P. Prakash', email: 'pp@modae.demo', role: 'PP', status: 'Active', created: '2026-04-15', pw: DEMO_PASSWORD },
  { id: 'U-006', name: 'S. Rao', email: 'sr@modae.demo', role: 'SR', status: 'Pending', created: '2026-08-08', pw: DEMO_PASSWORD },
  { id: 'U-007', name: 'T. Rao', email: 'tech@modae.demo', role: 'TECH', status: 'Active', created: '2026-08-01', pw: DEMO_PASSWORD },
  { id: 'U-008', name: 'Customer contact', email: 'customer@portal.demo', role: 'CUST', status: 'Active', created: '2026-08-01', pw: DEMO_PASSWORD },
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

// Lead inbox — inquiries land here (common mailbox intake); most never become
// opportunities and that history is kept minimally, per the Aug 10 meeting.
export const seedLeads = [
  {
    id: 'LD-101', ts: '2026-08-10T09:12:00Z', channel: 'Email',
    from: 'purchase.simhadri@ntpc.example.in',
    subject: 'RFQ — Bently 3300 XL proximity probe spares for Unit 2',
    body: 'Dear ModAE team,\n\nWe require 8 nos Bently 3300 XL 8mm proximity probes (P/N 330101-00-08-10-02-00) with 5m extension cables for Simhadri STPP Unit 2 TG condition monitoring. Kindly quote your best price with delivery to Visakhapatnam within 8 weeks.\n\nRegards,\nPurchase Cell, NTPC Simhadri',
    status: 'New',
    parse: {
      sellTo: 'NTPC Simhadri', category: 'EUC', location: 'Visakhapatnam',
      eucName: 'NTPC Simhadri', eucLocation: 'Visakhapatnam',
      oppName: 'Bently 3300 XL proximity probe spares — Unit 2',
      oppType: 'Spares', bu: 'Energy', segment: 'Thermal', product: 'Bently',
      contactPerson: 'Purchase Cell', contactPhone: '',
      items: [{ desc: 'Bently 3300 XL 8mm proximity probe + 5m ext. cable', pn: '330101-00-08-10-02-00', qty: 8 }],
      confidence: 0.92,
      note: 'Bently part number recognised — no Bently price list; ad-hoc trader quote will be needed.',
    },
  },
  {
    id: 'LD-102', ts: '2026-08-11T06:40:00Z', channel: 'Email',
    from: 'maintenance@bmms.example.in',
    subject: 'Field balancing visit — BFP-2A high vibration',
    body: 'Hi,\n\nOur BFP-2A is showing high 1x vibration after overhaul. Need a ModAE engineer for field balancing, likely 2-3 days on site in Bangalore next week. Please send your service offer.\n\nR. Iyer, BMMS',
    status: 'New',
    parse: {
      sellTo: 'BMMS', category: 'EUC', location: 'Bangalore',
      eucName: 'BMMS', eucLocation: 'Bangalore',
      oppName: 'Field balancing — BFP-2A, 2-3 days on site',
      oppType: 'Service', bu: 'Service', segment: 'Industrial', product: 'ModAE',
      contactPerson: 'R. Iyer', contactPhone: '+91 98450 22222',
      items: [{ desc: 'Service Engineer — field balancing, on site', pn: '', qty: 3 }],
      confidence: 0.85,
      note: 'Existing Amber customer — service rate sheet applies (Service Engineer 45 K₹/day).',
    },
  },
  {
    id: 'LD-103', ts: '2026-08-09T14:05:00Z', channel: 'Email',
    from: 'info@greenfieldwind.example.com',
    subject: 'Wind turbine installation partner required',
    body: 'Hello, we are looking for an installation partner for 12 wind turbines in Karnataka. Can you handle turbine erection and grid connection?\n\nGreenfield Wind LLP',
    status: 'New',
    parse: {
      sellTo: 'Greenfield Wind LLP', category: 'EPC', location: 'Karnataka',
      eucName: '', eucLocation: '', oppName: 'Wind turbine installation (12 units)',
      oppType: 'Project', bu: 'Energy', segment: 'Others', product: 'Various',
      contactPerson: '', contactPhone: '', items: [], confidence: 0.4,
      note: 'Outside current business scope (turbine erection) — suggest Drop, keep for future analytics.',
    },
  },
]

// Approval requests routed to LJS / AH; "Approved with conditions" must have
// every condition confirmed incorporated before the proposal can go out.
export const seedApprovals = [
  {
    id: 'AP-101', oppId: '2606213RS', type: 'Commercial deviation',
    detail: 'Customer asks 90-day credit on Upgr. of VC-4000-Koyna; proposal quotes 30 days from invoice (deviation).',
    requestedBy: 'RS', ts: '2026-08-08T10:30:00Z', approver: 'AH', status: 'Pending',
    conditions: [], decisionTs: '', decisionNote: '',
  },
  {
    id: 'AP-102', oppId: '2607215RS', type: 'Amber credit terms',
    detail: 'BHEL Bhopal is Amber (avg 60-day payment). Credit terms for ARUN-3 AGMS proposal need clearance.',
    requestedBy: 'RS', ts: '2026-08-06T08:00:00Z', approver: 'AH', status: 'Approved with conditions',
    conditions: [{ text: '100% advance payment — add "100% advance along with PO" to the payment term', incorporated: false, note: '' }],
    decisionTs: '2026-08-07T09:15:00Z', decisionNote: 'Approved based on prior unpaid-invoice history — prepay only.',
  },
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

// ---------------------------------------------------------------------------
// BT-prototype port, phase 2 — config, KYC, workbench, PO/handover, sales
// targets, notes. Everything below is backfilled into saved state by
// store.migrate() without a reseed.
// ---------------------------------------------------------------------------

export const AI_PROVIDERS = {
  Anthropic: ['claude-fable-5', 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'Other (enter below)'],
  OpenAI: ['gpt-5-flagship', 'gpt-5-mini', 'gpt-4o', 'Other (enter below)'],
  Google: ['gemini-pro', 'gemini-flash', 'Other (enter below)'],
  'Mistral AI': ['mistral-large', 'mistral-small', 'Other (enter below)'],
  'Meta (Llama)': ['llama-4-maverick', 'llama-4-scout', 'Other (enter below)'],
  'Azure OpenAI': ['(deployment name — enter below)'],
  'Custom / self-hosted': ['(model id — enter below)'],
}

// Runtime configuration — every value editable on the Admin page.
export const seedConfig = {
  // Suggested-ownership routing, from the client's roles Excel.
  ownershipRules: [
    { region: 'North & West India', owner: 'RS' },
    { region: 'South, East & Central India', owner: 'PP' },
    { region: 'Large / miscellaneous / international / aerospace / DCS / automation', owner: 'LJS' },
  ],
  aiThresholds: { high: 90, med: 75 },
  approvalThresholds: { gmAuto: 25, discAuto: 5, gmLjs: 20, discLjs: 10 },
  amberFee: { amount: 25000, cur: 'INR', days: 7 },
  kycItems: ['GST certificate', 'PAN certificate', 'Cancelled cheque', 'EFT / bank mandate', 'CIN reference', 'Registered & business address'],
  templates: ['Spares quotation', 'Reactive service offer', 'Project techno-commercial proposal'],
  reminders: [
    { id: 'validity', label: 'Proposal validity 7-day warning', on: true },
    { id: 'amberFee', label: 'Amber fee daily reminder', on: true },
    { id: 'slaNudge', label: 'Approval SLA 48h nudge', on: true },
  ],
  connectors: [
    { id: 'outlook', label: 'Outlook (common mailbox)', state: 'Healthy' },
    { id: 'teams', label: 'Microsoft Teams', state: 'Healthy' },
    { id: 'sharepoint', label: 'SharePoint', state: 'Not connected' },
    { id: 'crm', label: 'CRM', state: 'Healthy' },
    { id: 'erp', label: 'ERP', state: 'Degraded (read-only)' },
    { id: 'payment', label: 'Payment gateway', state: 'Unavailable' },
    { id: 'bi', label: 'BI', state: 'Healthy' },
  ],
  aiModel: { provider: '', model: '', customModel: '', endpoint: '', keySet: false, keyMasked: '', updatedBy: '', updatedOn: '' },
  // Admin document uploads (metadata only — content stays with the file's home).
  uploads: {
    priceLists: [
      { supplier: 'B&K (dummy)', name: 'BNK_Price_List_2026Q2_DUMMY.xlsx', version: '2026-Q2', uploaded: '2026-08-11', status: 'Current', dummy: true },
    ],
    interchangeability: null,
    customerClassification: null,
  },
}

// KYC checklist state per customer, derived from the master's kyc field.
export function kycFromCustomer(c, items) {
  const state = c.kyc === 'Valid' ? 'Verified' : c.kyc === 'Renewal due' ? 'Expired' : 'Missing'
  return items.map((name, i) => ({
    name,
    state: c.kyc === 'Renewal due' && i > 0 ? 'Verified' : state,
    when: state === 'Verified' ? '2026-04-10' : '',
  }))
}
export const seedKyc = Object.fromEntries(
  seedCustomers.filter(c => c.name !== 'New customer (auto-flagged)')
    .map(c => [c.name, kycFromCustomer(c, seedConfig.kycItems)]))

// FY 2026-27 sales targets (K₹) and booked orders.
export const seedSales = {
  fy: 'FY 2026-27', currentQ: 2, monthsElapsed: 5,
  targets: {
    LJS: { annual: 60000, q: [15000, 15000, 15000, 15000] },
    PP: { annual: 36000, q: [9000, 9000, 9000, 9000] },
    RS: { annual: 36000, q: [9000, 9000, 9000, 9000] },
    SS: { annual: 24000, q: [6000, 6000, 6000, 6000] },
    PJS: { annual: 20000, q: [5000, 5000, 5000, 5000] },
    RJS: { annual: 20000, q: [5000, 5000, 5000, 5000] },
    SR: { annual: 16000, q: [4000, 4000, 4000, 4000] },
  },
  orders: [
    { id: 'ORD-001', owner: 'LJS', customer: 'Andritz Hydro', title: 'VMS for LiMAK Project Turkey', valueK: 7500, po: 'PO-46112', status: 'Delivered', booked: '2026-04-12' },
    { id: 'ORD-002', owner: 'RS', customer: 'Prime Engineering/PECO', title: 'Koyna spares batch 1', valueK: 1850, po: 'PO-46388', status: 'In execution', booked: '2026-05-20' },
    { id: 'ORD-003', owner: 'PP', customer: 'GE Vernova', title: 'Sensor cables — Chennai', valueK: 640, po: 'PO-46501', status: 'In execution', booked: '2026-06-18' },
    { id: 'ORD-004', owner: 'SR', customer: 'BMMS', title: 'Operator training (3 weeks)', valueK: 950, po: 'PO-46550', status: 'Scheduled', booked: '2026-07-29' },
  ],
}

// Spares workbench lines (seeded on the Koyna loop-powered-transmitter opp) —
// customer references vs interpreted parts with match confidence.
export const seedSparesLines = [
  {
    id: 'SL-1', oppId: '2607217RS', custRef: 'Loop powered velocity transmitter, 4-20mA, top exit',
    pn: 'IN081-3-110-50', desc: 'Vibration sensor IN-081, 110mm', oem: 'B&K', match: 'Exact', conf: 96,
    confirmed: true, qty: 50, leadTime: '6-8 weeks', priceList: 'BNK 2026-01', priceState: 'Current',
    listPrice: 954, currency: 'EUR',
  },
  {
    id: 'SL-2', oppId: '2607217RS', custRef: 'Extension cable 5 m with connector',
    pn: 'EC-05', desc: 'Extension cable 5m', oem: 'B&K', match: 'Exact', conf: 92,
    confirmed: true, qty: 50, leadTime: '4 weeks', priceList: 'BNK 2026-01', priceState: 'Current',
    listPrice: 105, currency: 'EUR',
  },
  {
    id: 'SL-3', oppId: '2607217RS', custRef: 'Vibrotest 60 portable analyser',
    pn: 'VST-100', desc: 'VST-100 portable vibration tester (Vibrotest 60 superseded)', oem: 'B&K',
    match: 'Fuzzy — superseded', conf: 78, confirmed: false, qty: 1, leadTime: '10 weeks',
    priceList: 'BNK 2025-Q4', priceState: 'Expired', listPrice: 8400, currency: 'EUR',
  },
]
export const seedSparesAlternatives = [
  { forPn: 'VST-100', pn: 'VST-100', desc: 'Direct successor — VST-100', conf: 90, note: 'Obsolescence bulletin SB-112: Vibrotest 60 → VST-100', priceState: 'Expired' },
  { forPn: 'VST-100', pn: 'MX-2110', desc: 'Metrix proximity system (third-party equivalent)', conf: 62, note: 'Interchangeability matrix row 41', priceState: 'Current' },
]

// Reactive-service rate sheets (day rates in K₹ / USD).
export const seedRateSheets = {
  India: {
    currency: 'INR', gst: 18,
    rates: { engineerDay: 45, seniorDay: 65, travelDay: 20, otHour: 6, weekendPct: 50, standbyDay: 25, minCallout: 90, flight: 18, hotelNight: 6, transportDay: 4, perDiem: 3, tools: 12 },
  },
  International: {
    currency: 'USD', gst: 0,
    rates: { engineerDay: 900, seniorDay: 1300, travelDay: 450, otHour: 120, weekendPct: 50, standbyDay: 500, minCallout: 1800, flight: 1400, hotelNight: 180, transportDay: 90, perDiem: 80, tools: 250 },
  },
}
export const seedSvcEstimates = [
  {
    oppId: '2607214RS', sheet: 'India', workDays: 3, travelDays: 2, dailyHours: 8, otHours: 4,
    weekendDays: 1, standbyDays: 0, engineer: 'K. Prasad (available)', mobilisation: '2026-08-18',
    toolsCerts: 'Balancing kit, ladder permit', travelConfirmed: false,
  },
]

// Clarification tracker rows.
export const seedClarifications = [
  {
    id: 'CL-1', oppId: '2608219PP', category: 'Technical', gap: 'Signal list vs contractual sensor count mismatch',
    q: 'Measurement "D" (bracket absolute axial displacement) — accelerometer per signal list or 3 proximity probes per contract clause iii?',
    owner: 'PP', audience: 'Customer', due: '2026-08-18', status: 'Open', response: '',
    evidence: 'RFQ Annexure-I p.4 vs Signal List (33 sensors/unit)',
  },
  {
    id: 'CL-2', oppId: '2608219PP', category: 'Site data', gap: 'Cable routing distances missing',
    q: 'Distance machine→rack, JBs per machine, rack→DCS (MODBUS TCP/IP), rack→workstation?',
    owner: 'PP', audience: 'Customer', due: '2026-08-18', status: 'Draft', response: '',
    evidence: 'Purchasing spec section 6',
  },
]

// Proposal-vs-PO comparison, seeded on the Won LiMAK order (the meeting's
// 3310-vs-3300 part-number example included).
export const seedPoCompare = {}
export function buildPoCompare(oppId) {
  return {
    oppId, poNo: 'PO-46990', received: '', status: 'Not received',
    acceptance: { LJS: null, AH: null },
    lines: [
      { aspect: 'Customer identity & billing', prop: 'Andritz Hydro, Mandideep GSTIN 23AA…', po: 'Andritz Hydro, Mandideep GSTIN 23AA…', state: 'Match' },
      { aspect: 'Line 1 — VC-8000 rack', prop: 'VC-8000/RCK ×2', po: 'VC-8000/RCK ×2', state: 'Match' },
      { aspect: 'Line 2 — sensor part number', prop: 'BKD-3310 (current)', po: 'BKD-3300 (legacy number)', state: 'Review required', note: 'Customer PO cites the superseded number — likely same item.' },
      { aspect: 'Currency & tax', prop: 'INR, GST 18% extra', po: 'INR, GST 18% extra', state: 'Match' },
      { aspect: 'Delivery', prop: '6 weeks ex-works', po: '5 weeks door delivery', state: 'Blocking deviation', note: 'PO shortens delivery and shifts Incoterms.' },
      { aspect: 'Payment terms', prop: '30 days from invoice', po: '45 days from receipt', state: 'Review required' },
      { aspect: 'Warranty', prop: '18 months from supply', po: '18 months from supply', state: 'Match' },
      { aspect: 'Total value', prop: '₹ 7,500 K + GST', po: '₹ 7,500 K + GST', state: 'Match' },
    ].map(l => ({ ...l, resolved: l.state === 'Match' })),
  }
}

// Handover checklist template (12 items, 9 groups).
export function buildHandover() {
  return {
    approved: false, approvedBy: '', approvedOn: '',
    groups: [
      { g: 'Order documents', items: [{ n: 'Approved PO + released proposal filed', done: false, owner: 'Sales' }] },
      { g: 'Technical package', items: [{ n: 'Final BOQ locked', done: false, owner: 'Sales' }, { n: 'Signal list & rack layout frozen', done: false, owner: 'TECH' }] },
      { g: 'KYC & commercial controls', items: [{ n: 'KYC verified & payment terms recorded', done: false, owner: 'AH' }] },
      { g: 'Procurement package', items: [{ n: 'Vendor POs / price confirmations attached', done: false, owner: 'AH' }] },
      { g: 'Resources & execution plan', items: [{ n: 'Engineer allocation confirmed', done: false, owner: 'Ops' }] },
      { g: 'Delivery milestones', items: [{ n: 'Milestone dates agreed with customer', done: false, owner: 'Sales' }, { n: 'Penalty / LD clauses flagged', done: false, owner: 'AH' }] },
      { g: 'Finance & invoicing', items: [{ n: 'Invoice schedule set up', done: false, owner: 'Finance' }] },
      { g: 'Risks & commitments', items: [{ n: 'Risks, assumptions, special commitments logged', done: false, owner: 'Sales' }] },
      { g: 'Receiving owners', items: [{ n: 'Execution owner briefed', done: false, owner: 'Ops' }, { n: 'Finance owner briefed', done: false, owner: 'Finance' }] },
    ],
  }
}
export const seedHandover = {}

// Shared marketing notes board — every role can read and post.
export const seedNotes = [
  {
    id: 'N-1', ts: '2026-08-10T10:30:00Z', role: 'PP', author: 'P. Prakash',
    text: 'APGENCO Srisailam site visit done — customer keen on air-gap monitoring for all 7 units. Budget approval expected Sept. Follow up with signal list.',
  },
  {
    id: 'N-2', ts: '2026-08-11T07:15:00Z', role: 'LJS', author: 'L. J. Swaminathan',
    text: 'Reminder: all Gandikota PSP communications go through Andritz Mandideep, not Adani directly. Bid due 11 Aug — priority.',
  },
]

// ---------------------------------------------------------------------------
// AI-parsed leads modeled on the client's REAL sample emails (modae doc/*.eml,
// 8 Aug 2026): retrofit RFQ w/ Meggitt BOM, project RFQ (VAMS), green customer
// after site visit, product obsoletion, GeM bid clarification, plus one
// Red-class lead to drive the AP-1 joint-approval demo.
// Field shape: { group, k, v, conf (0-100), ev, state: 'pending'|'accepted'|'rejected', note? }
// ---------------------------------------------------------------------------
export const seedAiLeads = [
  {
    id: 'LD-201', ts: '2026-08-10T10:15:00Z', channel: 'Email', source: 'Common mailbox',
    from: 'akhil.umesh@tatapower.example.in', sender: 'Akhil Umesh — Tata Power',
    subject: 'Request for quotation — Meggitt VMS spares (retrofit)',
    ref: 'RFQ/TP/2026/0814', route: 'Spares', urgency: 'Normal', duplicateRisk: 'Medium',
    completeness: 96, suggestedOwner: 'RS', status: 'New',
    body: 'Dear sir,\n\nPlease provide your quotation for the following items:\n1. TQ 902, 8mm Standard Mount Proximity Probe, 1m integral cable, body 72mm — 111-902-000-01XA1-B1-C72-D2-E1000-F0-G0-H10\n2. EA902 Series Extension Cable, 9m — 913-902-000-01XA1-E9000-F0-G0\n3. IQS 900 Signal Conditioner, 4 mV/um, 10m system — 204-900-000-01XA1-B23-C1-H10-I0\n4. VE210 Low Frequency Velocity Sensor — 410-210-000-01XA1-B2-C0\n5. EC440 with L5000mm, 3-wire cable assembly — 922-440-000-10XP5000\n6. Work station\n7. Vibration Analysis Package for VibroSight software or equivalent\n\nVM600 rack installed: CPU MK2 (slot 0), MPC4 UGB/LGB/TGB (slots 3/4/6), MPC4 thrust pad axial (slot 7).\n\nBest regards\nAkhil Umesh\nLead Engineer — Instrumentation Maintenance, Tata Power',
    attachments: [{ name: 'Meggitt_BOM_Unit2.xlsx', pages: 3 }, { name: 'VM600_rack_config.pdf', pages: 2 }],
    ai: {
      summary: 'Retrofit spares RFQ from Tata Power (existing VM600/Meggitt install base). 7 line items incl. probes, cables, conditioner and a VibroSight analysis package. Two lines (workstation, software) need scope clarification before pricing.',
      fields: [
        { group: 'Customer', k: 'Sell-to customer', v: 'The Tata Power Company Ltd', conf: 97, ev: 'Sender domain + signature block', state: 'pending' },
        { group: 'Customer', k: 'Category', v: 'EUC', conf: 93, ev: 'End user operating the plant', state: 'pending' },
        { group: 'Customer', k: 'Contact', v: 'Akhil Umesh, Lead Engineer — Instrumentation, +91 7703850096', conf: 96, ev: 'Signature block', state: 'pending' },
        { group: 'RFQ', k: 'Opp type', v: 'Spares (retrofit)', conf: 95, ev: 'Part-number list against installed VM600 rack', state: 'pending' },
        { group: 'RFQ', k: 'Line items', v: '7 items — 5 with full Meggitt part numbers, 2 scope items', conf: 92, ev: 'Email body lines 1-7', state: 'pending' },
        { group: 'RFQ', k: 'BU / Segment', v: 'Energy / Thermal', conf: 88, ev: 'Tata Power thermal fleet + VM600 TG monitoring', state: 'pending' },
        { group: 'Known Project', k: 'Install base', v: 'VM600 rack, CPU MK2 + 4× MPC4 (UGB/LGB/TGB/thrust)', conf: 90, ev: 'Rack configuration in email', state: 'pending' },
      ],
      missing: ['Delivery location and required delivery period', 'Workstation spec (line 6) — hardware only or with OS licences?', 'VibroSight package: number of channels/licences'],
      duplicates: [{ leadId: 'LD-201D', note: 'Same subject "Request for quotation" received twice on 8 Aug (forwarded copy) — 92% body similarity.' }],
      next: ['Accept extracted fields', 'Send clarification for lines 6-7 scope', 'Route to spares workbench for part matching'],
    },
  },
  {
    id: 'LD-202', ts: '2026-08-09T16:40:00Z', channel: 'Email', source: 'Common mailbox',
    from: 'scm@epc-major.example.com', sender: 'Supply Chain — (large EPC)',
    subject: 'Provide offer price for VAMS system for Tarali PSP project',
    ref: 'EPC/TARALI/VAMS/26-118', route: 'Project', urgency: 'Urgent', duplicateRisk: 'Low',
    completeness: 81, suggestedOwner: 'LJS', status: 'New',
    body: 'Dear Sir,\n\nPlease provide offer price as per attached specification for supply of VAMS (Vibration & Air Gap Monitoring System) for Tarali PSP.\n\n3 VAMS panels for the complete installation; 33 sensors per unit per signal list. Interface to plant DCS/SCADA over MODBUS TCP/IP.\n\nKind Regards,\nSupply Chain Management',
    attachments: [{ name: '01_Purchasing_Specification_VAMS.pdf', pages: 42 }, { name: '02_Annexure-I_II.pdf', pages: 18 }, { name: 'Signal_List.xlsx', pages: 4 }],
    ai: {
      summary: 'Full project RFQ from a large EPC for a pumped-storage VAMS package (multi-unit, 3 panels, DCS interface). Signal list conflicts with the contractual sensor requirement — clarification needed before BOQ.',
      fields: [
        { group: 'Customer', k: 'Sell-to customer', v: 'Large EPC (name withheld in demo data)', conf: 84, ev: 'Sender domain', state: 'pending' },
        { group: 'Customer', k: 'Category', v: 'EPC', conf: 95, ev: 'Supply-chain sender, project procurement', state: 'pending' },
        { group: 'RFQ', k: 'Opp type', v: 'Project', conf: 96, ev: '42-page purchasing spec + annexures', state: 'pending' },
        { group: 'RFQ', k: 'Scope', v: 'VAMS, 3 panels, 33 sensors/unit, MODBUS TCP/IP to DCS', conf: 87, ev: 'Spec section 3 + signal list', state: 'pending' },
        { group: 'RFQ', k: 'BU / Segment', v: 'Energy / Hydro (PSP)', conf: 94, ev: 'Tarali pumped storage project', state: 'pending' },
        { group: 'Known Project', k: 'Conflict detected', v: 'Signal list "D" = accelerometer vs contract clause iii = 3 proximity probes', conf: 68, ev: 'Annexure-I p.4 vs signal list', state: 'pending', note: 'Below medium threshold — human review required' },
      ],
      missing: ['Referenced drawing no. (cited in spec, not attached)', 'Panel locations + distances (cabling estimate)', 'Hardwired DCS interface requirements (4-20mA / relays)'],
      duplicates: [],
      next: ['Assign to LJS (large project rule)', 'Draft clarification with the 4 site-data questions', 'Open project workbench'],
    },
  },
  {
    id: 'LD-203', ts: '2026-08-08T13:05:00Z', channel: 'Email', source: 'Common mailbox',
    from: 'agm.koyna@mahagenco.example.in', sender: 'AGM (E&M) — MAHAGENCO Koyna',
    subject: 'Koyna Hydroelectric Project — offer for Stage 3 upgrade as discussed during visit',
    ref: 'KOYNA/ST3/2026', route: 'Project', urgency: 'Normal', duplicateRisk: 'Low',
    completeness: 88, suggestedOwner: 'RS', status: 'New', fastTrack: true,
    body: 'Dear Sir,\n\nPlease send your best offer for Koyna Stage 3 plant as discussed during the joint site visit on 19 Jan.\n\nScope as discussed: upgrade of existing B&K system per machine for stages 1, 2 & 3; condition monitoring addition for stage 4 VMS (all 4 machines); common CMS software per stage; optional spares, display and field cables.\n\nAlso find attached Meggitt BoM details for the stage 4 upgradation carried out earlier.\n\nThanks & Regards',
    attachments: [{ name: 'Meggitt_BOM_Stage4.xlsx', pages: 2 }],
    ai: {
      summary: 'Green customer (existing relationship, post-site-visit) explicitly inviting an offer — fast-track candidate. Scope already agreed verbally during the 19 Jan joint visit; two proposals expected (calibration kit + upgrade scope).',
      fields: [
        { group: 'Customer', k: 'Sell-to customer', v: 'MAHAGENCO (Koyna HEP)', conf: 96, ev: 'Domain + install-base CRM row 12', state: 'pending' },
        { group: 'Customer', k: 'Classification', v: 'Green — past business, on-time payer', conf: 94, ev: 'Customer master + payment history', state: 'pending' },
        { group: 'RFQ', k: 'Opp type', v: 'Upgrade (project route)', conf: 91, ev: '"Upgrade of existing B&K system" in body', state: 'pending' },
        { group: 'RFQ', k: 'Scope', v: 'Stages 1-3 upgrade + stage 4 CMS + common software', conf: 86, ev: 'Body scope list, matches visit notes', state: 'pending' },
        { group: 'Known Project', k: 'Site visit', v: 'Joint visit 19 Jan 2026 — scope pre-agreed', conf: 93, ev: 'Email reference + CRM activity log', state: 'pending' },
      ],
      missing: ['RFQ document (verbal scope only — request written RFQ or proceed on visit notes)'],
      duplicates: [],
      next: ['Fast-track: Green customer, OK to quote', 'Prepare 2 proposals (calibration kit / upgrade scope)'],
    },
  },
  {
    id: 'LD-204', ts: '2026-08-07T10:58:00Z', channel: 'Email', source: 'Common mailbox',
    from: 'npd.sourcing@oem-customer.example.com', sender: 'NPD Sourcing',
    subject: 'Inquiry for Vibration Sensor Specifications & Pricing — VIBROTEST 60 or VST-100',
    ref: '', route: 'Spares', urgency: 'Normal', duplicateRisk: 'Low',
    completeness: 72, suggestedOwner: 'PP', status: 'New',
    body: 'Hi Team,\n\nI am reaching out to get details on your Vibration Sensor for specific model "VIBROTEST 60 or VST-100".\n\n- Technical specifications\n- Lead time, warranty, and service support\n\nRegards,\nNPD Sourcing',
    attachments: [],
    ai: {
      summary: 'Product inquiry citing an OBSOLETE model. Vibrotest 60 is discontinued — VST-100 is the active successor. AI suggests the equivalent-product reply with datasheet, and requesting end-user details before quoting.',
      fields: [
        { group: 'Customer', k: 'Sell-to customer', v: 'Unknown — sourcing team, no company profile matched', conf: 58, ev: 'Generic domain, no CRM match', state: 'pending', note: 'Below medium threshold — blocks registration until resolved' },
        { group: 'RFQ', k: 'Product', v: 'Vibrotest 60 → superseded by VST-100 (bulletin SB-112)', conf: 95, ev: 'Obsolescence register row 7', state: 'pending' },
        { group: 'RFQ', k: 'Opp type', v: 'Spares', conf: 82, ev: 'Single-instrument inquiry', state: 'pending' },
      ],
      missing: ['End user name and location', 'Application / machine details', 'Quantity'],
      duplicates: [],
      next: ['Send obsoletion reply: VST-100 datasheet + KYC request', 'Classify customer (likely Blue — new)'],
    },
  },
  {
    id: 'LD-205', ts: '2026-08-06T09:20:00Z', channel: 'Email', source: 'Common mailbox',
    from: 'gembuyer@example.gov.in', sender: 'GeM Buyer — Cooling Tower Cell',
    subject: 'Technical Clarifications For GeM Bid — cooling tower fan gearbox vibration monitoring & control panel',
    ref: 'GEM/2026/B/7411347', route: 'Project', urgency: 'Urgent', duplicateRisk: 'Low',
    completeness: 64, suggestedOwner: 'PP', status: 'New',
    body: 'Sir,\n\nWith reference to GeM Bid GEM/2026/B/7411347 (cooling tower fan gear box vibration monitoring and control panel with vibration sensor), please provide technical clarifications on sensor type, panel IP rating and integration with existing DCS before bid submission date.\n\nRegards',
    attachments: [{ name: 'GeM_Bid_7411347_extract.pdf', pages: 6 }],
    ai: {
      summary: 'GeM bid clarification request with LOW completeness — bid document extract only, no signal list, quantities or commercial terms. Multiple fields below confidence threshold; registration blocked until reviewed.',
      fields: [
        { group: 'Customer', k: 'Sell-to customer', v: 'Government buyer via GeM portal', conf: 71, ev: 'GeM bid number format', state: 'pending', note: 'Below medium threshold' },
        { group: 'RFQ', k: 'Opp type', v: 'Project (panel + sensors + integration)', conf: 74, ev: 'Bid title', state: 'pending', note: 'Below medium threshold' },
        { group: 'RFQ', k: 'Bid deadline', v: 'Not stated in extract', conf: 40, ev: 'GeM extract p.1', state: 'pending', note: 'Below medium threshold' },
      ],
      missing: ['Full bid document (only extract attached)', 'Signal list / sensor count', 'Bid submission date', 'EMD and eligibility terms'],
      duplicates: [],
      next: ['Pull full bid from GeM portal (GeM_Opportunity_Radar)', 'Resolve low-confidence fields before qualification'],
    },
  },
  {
    id: 'LD-206', ts: '2026-08-11T05:30:00Z', channel: 'Email', source: 'Common mailbox',
    from: 'procurement@capsa-realix.example.ae', sender: 'CAPSA Dubai / Realix',
    subject: 'Provide offer for VMS system and accessories',
    ref: 'CAPSA/VMS/2026-31', route: 'Spares', urgency: 'Normal', duplicateRisk: 'Low',
    completeness: 78, suggestedOwner: 'LJS', status: 'New', redFlag: true,
    body: 'Dear Sir,\n\nPlease provide your best offer for VMS system and accessories as per the attached list. Delivery to Dubai.\n\nRegards,\nProcurement — CAPSA / Realix',
    attachments: [{ name: 'VMS_accessories_list.pdf', pages: 2 }],
    ai: {
      summary: 'RED-CLASS customer (>180 days overdue on previous invoices). Continuation requires joint LJS + AH approval (AP-1). No opportunity ID is generated until approved; AI recommends prepayment-only terms if cleared.',
      fields: [
        { group: 'Customer', k: 'Sell-to customer', v: 'CAPSA Dubai / Realix', conf: 95, ev: 'Sender domain + customer master (Red)', state: 'pending' },
        { group: 'Customer', k: 'Classification', v: 'Red — unpaid record, >180 days overdue', conf: 97, ev: 'Accounting export row 23', state: 'pending' },
        { group: 'RFQ', k: 'Opp type', v: 'Spares (international)', conf: 85, ev: 'Accessories list + Dubai delivery', state: 'pending' },
        { group: 'RFQ', k: 'Suggested owner', v: 'LJS (international rule)', conf: 90, ev: 'Ownership routing table', state: 'pending' },
      ],
      missing: ['End-user disclosure (trader — who operates the equipment?)'],
      duplicates: [],
      next: ['AP-1: request joint LJS + AH continuation approval', 'If approved: 100% prepayment terms only'],
    },
  },
]

// Red-class continuation gate for LD-206 — joint LJS + AH decision (AP-1 demo).
export const seedJointApprovals = [
  {
    id: 'AP-1', oppId: '', leadId: 'LD-206', type: 'Red customer clearance',
    detail: 'CAPSA Dubai / Realix (Red — >180 days overdue) asked for a VMS offer. Continuation needs joint LJS + AH clearance; AI recommends 100% prepayment and end-user disclosure if cleared.',
    requestedBy: 'RS', ts: '2026-08-11T05:35:00Z', approver: 'LJS', status: 'Pending',
    needed: ['LJS', 'AH'], decisions: {},
    conditions: [], decisionTs: '', decisionNote: '',
  },
]
