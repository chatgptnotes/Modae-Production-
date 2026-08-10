// Costing math per the "Imported Items Pricing & Costing Factors" box on the
// Priced BoQ sheet: Euro-₹ Base 112.00 × (1 + 16% CD+ERV+Cont.) × (1 − 50% B&K
// disc) → Eff. Rate 65 (rounded up). Euro list price × Eff. Rate = landed ₹ cost.
export function effectiveRate(c) {
  return Math.ceil(c.baseRate * (1 + c.cdErvContPct / 100) * (1 - c.bnkDiscPct / 100))
}

export function unitCostINR(listPriceEUR, costing) {
  return listPriceEUR * effectiveRate(costing)
}

// Target (sell) price applies Input GM% on top of landed cost.
export function unitSellINR(listPriceEUR, costing) {
  return unitCostINR(listPriceEUR, costing) / (1 - costing.inputGMPct / 100)
}

export function fmt(n, digits = 0) {
  if (n === '' || n == null || isNaN(n)) return ''
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: digits })
}

export function fmtLakh(valueK) {
  // valueK is ₹ thousands
  const l = valueK / 100
  if (l >= 100) return `₹${(l / 100).toFixed(2)} Cr`
  return `₹${l.toFixed(1)} L`
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function monthKey(dateStr) {
  if (!dateStr) return ''
  return dateStr.slice(0, 7) // YYYY-MM
}

// "Jun-26" style, as in the pipeline sheet's date columns.
export function mmmYY(dateStr) {
  if (!dateStr) return ''
  const [y, m] = dateStr.split('-')
  return `${MONTHS[parseInt(m, 10) - 1]}-${y.slice(2)}`
}

export function monthLabel(key) {
  return mmmYY(key + '-01')
}

// "Extract to Excel" — CSV download (opens directly in Excel).
export function exportCSV(filename, headers, rows) {
  const esc = v => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
