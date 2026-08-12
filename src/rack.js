// Signal list and rack sizing — derived from the priced BoQ.
//
// The BoQ already carries the engineering content (how many accelerometers,
// probes, keyphasors are being supplied), so the signal list is a projection of
// it rather than a second place to type the same numbers. The rack in turn is a
// projection of the signal count. Both stay editable: these functions only
// produce the default the UI offers.

// Canonical rows, in the same order as newProposal()'s seed (seed.js) so the
// table shape never changes underneath the user.
export const SIGNAL_TYPES = [
  'Radial Vibration X/Y',
  'Axial Position',
  'Air Gap',
  'Keyphasor',
]

// VC-8000/RCK is a 16-slot chassis. Every rack spends four slots on fixed
// infrastructure — redundant power, the rack condition monitor and the eSAM —
// leaving the rest for monitoring modules.
export const RACK_SLOTS = 16
export const FIXED_MODULES = ['PSU', 'PSU', 'RCM', 'eSAM']
export const UMM_SLOTS = RACK_SLOTS - FIXED_MODULES.length

// Channels per universal monitoring module. NOT stated in the B&K price list
// description (seed.js, VC-8000/UMM) — change this one constant if engineering
// quotes a different figure.
export const UMM_CHANNELS = 8

// Part numbers as they appear on the B&K price list, so the module table can be
// cross-checked against — and pushed into — the hardware BoQ.
export const MODULE_PN = {
  RCK: 'VC-8000/RCK',
  PSU: 'VC-8000/PSU',
  RCM: 'VC-8000/RCM',
  eSAM: 'VC-8000/eSAM',
  UMM: 'VC-8000/UMM',
}

// Which BoQ lines represent a measured signal. Only sensing elements count: a
// driver/conditioner pairs 1:1 with a probe and a cable carries a signal, so
// counting either would double-count the channel.
function signalTypeOf(line) {
  const cat = line.itemCategory || ''
  const desc = line.desc || ''
  // Category first: an armoured cable's description often names the sensor it
  // serves ("Armoured Cable — 5 Mtr for Accelerometer"), so reading the text
  // before the category would count the channel twice.
  if (/^cable$|driver|signal conditioner/i.test(cat)) return null
  if (/armou?red cable|extension cable/i.test(desc)) return null
  const text = `${cat} ${desc}`
  if (/air ?gap/i.test(text)) return 'Air Gap'
  if (/key ?phasor|phasor/i.test(text)) return 'Keyphasor'
  if (/axial|thrust/i.test(text)) return 'Axial Position'
  if (/acceleromet|proximity probe|velocity (sensor|transducer)|seismic/i.test(text)) return 'Radial Vibration X/Y'
  return null
}

// Split a total quantity back into the sheet's Per Unit × Units form. When the
// quantity divides evenly across the machine trains that is the honest reading;
// when it doesn't (spares tenders quote absolute counts) keep the total exact
// rather than rounding a per-unit figure that would inflate it.
function splitQty(qty, units) {
  if (units > 1 && qty % units === 0) return { perUnit: qty / units, units }
  return { perUnit: qty, units: 1 }
}

// totalQty is injected from Proposal.jsx so the Qty/Unit × units + Common +
// Spares math lives in exactly one place.
export function signalsFromBom(bom, units, totalQty) {
  const qty = {}
  for (const line of bom || []) {
    const type = signalTypeOf(line)
    if (!type) continue
    qty[type] = (qty[type] || 0) + totalQty(line)
  }
  return SIGNAL_TYPES.map(signal => ({ signal, ...splitQty(qty[signal] || 0, units) }))
}

export const countSignals = signals =>
  (signals || []).reduce((s, r) => s + (r.perUnit || 0) * (r.units || 0), 0)

// True when the stored rows carry no counts at all — the state a tender-intake
// proposal is saved in, and the cue to adopt the BoQ-derived defaults.
export const signalsAreEmpty = signals => countSignals(signals) === 0

// Modules and slot occupancy for a given channel count. Spills into further
// racks once the UMMs outgrow one chassis.
export function rackLayout(totalSignals) {
  const ummCount = Math.ceil((totalSignals || 0) / UMM_CHANNELS)
  const rackCount = Math.max(1, Math.ceil(ummCount / UMM_SLOTS))
  const racks = []
  let remaining = ummCount
  for (let r = 0; r < rackCount; r++) {
    const umms = Math.min(remaining, UMM_SLOTS)
    remaining -= umms
    const slots = [
      ...FIXED_MODULES,
      ...Array(umms).fill('UMM'),
      ...Array(RACK_SLOTS - FIXED_MODULES.length - umms).fill(null), // spare
    ]
    racks.push(slots)
  }
  const slotsUsed = FIXED_MODULES.length * rackCount + ummCount
  return {
    ummCount,
    rackCount,
    racks,
    slotsUsed,
    totalSlots: RACK_SLOTS * rackCount,
    spareSlots: RACK_SLOTS * rackCount - slotsUsed,
    // Bill of modules, in slot order, for the summary table and the BoQ push.
    modules: [
      { key: 'RCK', pn: MODULE_PN.RCK, label: '16-slot rack', qty: rackCount },
      { key: 'PSU', pn: MODULE_PN.PSU, label: 'Redundant power supply', qty: 2 * rackCount },
      { key: 'RCM', pn: MODULE_PN.RCM, label: 'Rack condition monitor', qty: rackCount },
      { key: 'eSAM', pn: MODULE_PN.eSAM, label: 'eSAM module', qty: rackCount },
      { key: 'UMM', pn: MODULE_PN.UMM, label: `Universal monitoring module (${UMM_CHANNELS} ch)`, qty: ummCount },
    ],
  }
}
