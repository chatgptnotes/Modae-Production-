// Record ids that stay unique across devices.
//
// Every generator in the store used to derive its id from the local array —
// `CL-${max+1}`, `SV-${length+1}`. That was harmless while the whole
// clarifications array was one JSONB blob: two devices minting `CL-7` merged
// into one list. Once `id` is a primary key in Supabase, the second `CL-7`
// upserts straight over the first and one salesperson's record disappears.
//
// The fix keeps the human-readable prefix and sequence the UI and the workflow
// documents rely on, and appends a short per-device tag: `CL-7-kdqa`. The tag
// is letters only, so the digit-run parser below still reads the sequence.

const DEVICE_KEY = 'modae-device'
const ALPHA = 'abcdefghijklmnopqrstuvwxyz'

// Four lowercase letters, minted once per browser and kept in localStorage so
// the same device keeps its tag across reloads. Falls back to a per-process
// value where there is no storage (Node tests, private mode with storage off).
let cached = ''
export function deviceTag() {
  if (cached) return cached
  try {
    const saved = localStorage.getItem(DEVICE_KEY)
    if (saved && /^[a-z]{4}$/.test(saved)) {
      cached = saved
      return cached
    }
  } catch { /* storage unavailable — fall through to a session-local tag */ }
  cached = randomTag()
  try { localStorage.setItem(DEVICE_KEY, cached) } catch { /* not persistable */ }
  return cached
}

function randomTag() {
  const g = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  const bytes = new Uint8Array(4)
  if (g?.getRandomValues) g.getRandomValues(bytes)
  else for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256)
  return [...bytes].map(b => ALPHA[b % 26]).join('')
}

// The leading digit run of an id: 'CL-7-kdqa' → 7, 'AP-101' → 101, '' → 0.
export function seqOf(id) {
  const m = /(\d+)/.exec(String(id ?? ''))
  return m ? parseInt(m[1], 10) : 0
}

// Next sequence for a collection, never below `floor` (approvals start at 100).
export function nextSeq(rows, floor = 0) {
  return (rows || []).reduce((max, r) => Math.max(max, seqOf(r?.id)), floor) + 1
}

// `CL-7-kdqa`. The sequence stays readable and roughly ordered; the tag makes a
// cross-device collision effectively impossible.
export function mintId(prefix, rows, floor = 0) {
  return `${prefix}-${nextSeq(rows, floor)}-${deviceTag()}`
}
