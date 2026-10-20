export const rows = [
  ['1', 'BV-UT-201 / 202', 'EPS-BV50-SK-316', 'Ball valve seal kit; DN50, Class 150; PTFE seats and graphite packing', '4', 'sets'],
  ['2', 'BV-UT-203', 'EPS-BV80-SK-316', 'Ball valve seal kit; DN80, Class 150; PTFE seats and graphite packing', '2', 'sets'],
  ['3', 'FL-UT-201 to 206', 'EPS-SWG50-150', 'Spiral-wound gasket; DN50; SS316 winding with graphite filler', '12', 'nos.'],
  ['4', 'FL-UT-207 / 208', 'EPS-SWG80-150', 'Spiral-wound gasket; DN80; SS316 winding with graphite filler', '6', 'nos.'],
  ['5', 'ACT-UT-201 / 202', 'EPS-PA63-RK-NBR', 'Pneumatic actuator repair kit; 63 mm bore; NBR piston seals', '2', 'sets'],
  ['6', 'ACT-UT-201 / 202', 'EPS-SV24-14-NAM', 'NAMUR solenoid valve; 5/2-way, 24 V DC, 1/4 in BSP ports, IP65', '2', 'nos.'],
]
export const enquiry = `From: Anita Rao <anita.rao@example.com>
To: ModAE Sales Team <sales@modae.example>
Date: 20 October 2026, 10:35 IST
Subject: RFQ | Shutdown maintenance spares for valve assemblies | EPS/RFQ/26-27/184

Dear ModAE Sales Team,
We are planning the November maintenance shutdown. Please quote the following valve and actuator spares.
Item Equipment ref. Part number Description / specification Qty Unit
${rows.map(r => r.join(' ')).join('\n')}
Please quote each line separately in INR, showing GST and freight separately.
Delivery address
Example Process Systems Pvt. Ltd.
Stores Department, Plot 28, 2nd Phase
Peenya Industrial Area, Bengaluru, Karnataka 560058, India

Kindly send your quotation by 23 October 2026.
Regards,
Anita Rao
Senior Engineer — Procurement
Example Process Systems Pvt. Ltd.
Mobile: +91 90000 00000
Email: anita.rao@example.com`
