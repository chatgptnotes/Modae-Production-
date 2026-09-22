// Value-list semantics for the Excel-style column filter dropdown.
//
// Kept out of pages/Tracker.jsx deliberately: the tracker's tests are mostly
// source-text regexes, which is how the "(Select All) cannot deselect" bug got
// pinned as correct behaviour. This module has no React and no DOM, so the
// rules below are asserted by running them.
//
// `allowed` is the per-column filter state and is tri-state:
//   undefined      -> no filter on this column, everything passes
//   non-empty Set  -> only these display values pass
//   empty Set      -> nothing passes
// The empty Set is the piece that was unreachable before: normalizeAllowed
// collapses a *full* selection to undefined, never an empty one.

export const FILTER_BLANK_LABEL = '(Blanks)'

/** What the user reads for a value. Blanks are the empty string internally. */
export const filterValueLabel = v => (v === '' ? FILTER_BLANK_LABEL : v)

/**
 * React key for a value row. The old `v || '(blank)'` collided with a real
 * value of "(blank)", which React reports as a duplicate-key warning and
 * which makes the two rows share checkbox identity.
 */
export const filterValueKey = v => (v === '' ? '\u0000blank' : v)

/**
 * Search matches the *label*, which is what makes (Blanks) reachable by
 * typing "blank" — searching the raw '' could never match anything.
 */
export const matchesFilterQuery = (v, q) => filterValueLabel(v).toLowerCase().includes(q)

/** The one rule shared by matchesFilters and every checkbox's checked state. */
export const allowsValue = (allowed, v) => !allowed || allowed.has(v)

/**
 * "Everything is selected" means no filter, so it stores undefined. An empty
 * selection is a real filter and must survive as an empty Set — collapsing it
 * to undefined is what made unchecking (Select All) a no-op with a checkbox
 * that rendered unchecked while filtering nothing.
 */
export const normalizeAllowed = (next, values) =>
  (values.length && values.every(v => next.has(v)) ? undefined : next)

/** Effective selection as a concrete Set, for editing. */
const effective = (allowed, values) => new Set(allowed || values)

export function toggleValueIn(allowed, values, v) {
  const next = effective(allowed, values)
  if (next.has(v)) next.delete(v)
  else next.add(v)
  return normalizeAllowed(next, values)
}

/**
 * (Select All) over the currently searched subset — Excel's "add current
 * selection to filter". Values outside `subset` keep whatever state they had,
 * so searching, ticking, re-searching and ticking again accumulates.
 */
export function toggleSubsetIn(allowed, values, subset) {
  const next = effective(allowed, values)
  const allOn = subset.every(v => next.has(v))
  for (const v of subset) {
    if (allOn) next.delete(v)
    else next.add(v)
  }
  return normalizeAllowed(next, values)
}

/** Narrow to exactly one value. */
export const onlyValue = (values, v) => normalizeAllowed(new Set([v]), values)

/** Peel one value off the current selection. */
export function excludeValue(allowed, values, v) {
  const next = effective(allowed, values)
  next.delete(v)
  return normalizeAllowed(next, values)
}

/** Replace the selection with the searched subset. */
export const filterToSubset = (values, subset) => normalizeAllowed(new Set(subset), values)

/**
 * Distinct display values with a row count each, in one pass.
 *
 * `valueOf(row)` returns the display value, or an array of them for a
 * multi-valued column (a two-product row then counts on both products).
 * `rawOf(row)`, when given, orders each display label by the *minimum* raw
 * value behind it — that is what makes mmm-YY month buckets sort
 * chronologically no matter what order the rows arrive in. Blanks sort last,
 * as they do in Excel.
 */
export function distinctWithCounts(rows, valueOf, rawOf = null) {
  const counts = new Map()
  const order = new Map()
  for (const row of rows) {
    const got = valueOf(row)
    const vals = Array.isArray(got) ? (got.length ? got : ['']) : [got]
    const raw = rawOf ? String(rawOf(row) || '') : null
    for (const v of vals) {
      counts.set(v, (counts.get(v) || 0) + 1)
      if (rawOf) {
        const seen = order.get(v)
        if (seen === undefined || raw < seen) order.set(v, raw)
      }
    }
  }
  const values = [...counts.keys()].sort((a, b) => {
    if (a === b) return 0
    if (a === '') return 1
    if (b === '') return -1
    return rawOf
      ? String(order.get(a)).localeCompare(String(order.get(b)))
      : a.localeCompare(b, undefined, { numeric: true })
  })
  return { values, counts }
}

/**
 * Fixed-row-height windowing for the value list. Hand-rolled because the repo
 * carries no virtualization library, and a render cap was the wrong trade:
 * "(Select All) applies to what you see" must not quietly mean "the arbitrary
 * first N of thousands".
 *
 * padTop + (end - start) * rowH + padBottom === count * rowH, so the scrollbar
 * stays honest.
 */
export function windowSlice(count, scrollTop, rowH, viewportH, overscan = 4) {
  if (count <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 }
  const top = Math.max(0, Math.min(scrollTop, Math.max(0, count * rowH - viewportH)))
  const first = Math.floor(top / rowH)
  const visible = Math.ceil(viewportH / rowH) + 1
  const start = Math.max(0, first - overscan)
  const end = Math.min(count, first + visible + overscan)
  return { start, end, padTop: start * rowH, padBottom: (count - end) * rowH }
}
