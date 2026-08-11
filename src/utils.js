// Costing math per the "Imported Items Pricing & Costing Factors" box on the
// Priced BoQ sheet: Eff. Rate = ROUNDUP(base × (1 + CD+ERV+Cont.) × (1 − B&K
// disc)) — e.g. 112 × 1.16 × 0.50 → ₹65. List price × Eff. Rate = landed ₹ cost.
// Imports come in € or $ (separate base rates); the 50% discount is B&K-list
// only; INR-quoted parts (ad-hoc/local) are already landed cost.
export function effectiveRate(c, currency = 'EUR', applyBnkDisc = true) {
  if (currency === 'INR') return 1
  // A cleared/legacy usdBase falls back to the default $ rate, never the € rate.
  const base = currency === 'USD' ? (c.usdBase > 0 ? c.usdBase : 90) : c.baseRate
  const disc = applyBnkDisc ? c.bnkDiscPct / 100 : 0
  return Math.ceil(base * (1 + c.cdErvContPct / 100) * (1 - disc))
}

export function unitCostINR(listPrice, costing, currency = 'EUR', applyBnkDisc = true) {
  return listPrice * effectiveRate(costing, currency, applyBnkDisc)
}

// Target (sell) price applies Input GM% on top of landed cost. GM is clamped
// below 100% so a typo can't push Infinity into totals and the tracker.
export function unitSellINR(listPrice, costing, currency = 'EUR', applyBnkDisc = true) {
  const gm = Math.min(costing.inputGMPct || 0, 95)
  return unitCostINR(listPrice, costing, currency, applyBnkDisc) / (1 - gm / 100)
}

// Folder-wall / tracker colour convention: green = Won, red = Lost, plain =
// Open. (The real OneDrive wall uses four colours with unconfirmed meaning —
// pending Swami's answer — so the app keeps this three-state scheme for now.)
export function stageClass(o) {
  return o.stage === 'Won' ? 'won' : o.stage === 'Lost' ? 'lost' : 'open'
}

import { ROLES, PERMS } from './seed.js'

// Commercial visibility (Value/COGS/GM, forecast, pricing) follows the active
// persona, per the wireframe's "Restricted — commercial data" rule.
export const canViewCommercial = role => !!ROLES[role]?.commercial
export const isAdminRole = role => !!ROLES[role]?.admin
// LJS (strategic) and AH (commercial & ops) decide gates; admins can see the queue.
export const isApprover = role => role === 'LJS' || role === 'AH' || isAdminRole(role)
// Page-level permission from the PERMS matrix (unknown role sees nothing).
export const canSeePage = (role, page) => (PERMS[role] || []).includes(page)

export function ageDays(dateStr) {
  if (!dateStr) return null
  const d = Math.round((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000)
  return d < 0 ? 0 : d
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

// "28-Jul-26" style, as the sheet's Last Updated column shows day-level dates.
export function ddMmmYY(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}-${MONTHS[parseInt(m, 10) - 1]}-${y.slice(2)}`
}

// Evaluate an Excel-style formula ("=8.5%+2.5%+5%", "=112*1.16*0.5", "4299").
// Arithmetic + parentheses + percent literals only. Returns { value, usedPct }
// or null if the text isn't a valid formula.
export function evalFormula(text) {
  let s = String(text ?? '').trim()
  if (!s) return null
  if (s.startsWith('=')) s = s.slice(1)
  const usedPct = /%/.test(s)
  s = s.replace(/(?<=\d),(?=\d)/g, '')                       // strip 4,299-style grouping commas
  s = s.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)')
  s = s.replace(/ROUNDUP\s*\(((?:[^(),]|\([^()]*\))*),\s*0\s*\)/gi, 'C($1)')
  if (s.includes(',')) return null                           // any leftover comma would be the JS comma operator
  if (!/^[-+*/().\d\sC]+$/.test(s)) return null
  try {
    // C = Excel ROUNDUP(x, 0): away from zero, unlike Math.ceil for negatives.
    const value = Function('C', '"use strict"; return (' + s + ')')(x => (x < 0 ? Math.floor(x) : Math.ceil(x)))
    return typeof value === 'number' && isFinite(value) ? { value, usedPct } : null
  } catch {
    return null
  }
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
