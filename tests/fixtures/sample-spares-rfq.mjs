export const sampleSparesRows = [
  ['1', 'P-101A', 'MSK-045-EPDM', 'Mechanical seal kit, 45 mm shaft', '2', 'SET'],
  ['2', 'P-101A', 'BRG-6309-C3', 'Deep-groove ball bearing, C3', '4', 'NOS'],
  ['3', 'P-101B', 'GSK-P101-01', 'Pump casing gasket set', '3', 'SET'],
  ['4', 'C-201', 'AF-C201-10', 'Compressor air inlet filter element', '6', 'NOS'],
  ['5', 'C-201', 'OF-C201-25', 'Compressor oil filter element', '4', 'NOS'],
  ['6', 'V-301', 'SK-DN80-EPDM', 'Butterfly valve seat kit, DN80', '2', 'SET'],
  ['7', 'V-302', 'PK-DN50-PTFE', 'Valve gland packing, DN50', '5', 'SET'],
  ['8', 'P-102', 'OR-P102-VIT', 'Pump O-ring kit, FKM', '2', 'KIT'],
]
export const sampleSparesScope = 'Supply of pump seals, bearings, gaskets, compressor filters and valve service kits.'
export const sampleSparesRfq = `SAMPLE CUSTOMER ENQUIRY
Request for Quotation | Spares
RFQ No: DVE/SP/2026/1042 Date: 21 October 2026
Customer Demo Valley Engineering Pvt. Ltd.
Contact person Ananya Rao | Maintenance Procurement Manager
Email ananya.rao@example.com
Telephone +91 00000 00000 (test placeholder)
Delivery address Plot 12, Sample Industrial Estate, Pune, Maharashtra 411001, India
To ModAE Sales Team
Subject Spares for pump, compressor and cooling-water valve maintenance
Dear Sales Team,
Please quote for the following spare parts required for our planned maintenance shutdown.
Scope: ${sampleSparesScope}
No. Equipment ref. Part number Description Qty Unit
${sampleSparesRows.map(row => row.join(' ')).join('\n')}
Commercial and delivery requirements
Quotation due 28 October 2026
Required delivery 20 November 2026 at the delivery address above
Currency / terms INR; itemise GST, packing and freight separately. Payment: 30 days from receipt.
Regards, Ananya Rao
FICTIONAL TEST DOCUMENT - Customer, references and part numbers are illustrative.`
