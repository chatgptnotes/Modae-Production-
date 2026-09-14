// Hover disclosure for text the layout had to cut off.
//
// The app truncates in ~40 places and has no tooltip component, so a clipped
// value was simply unreadable. Rather than hand-adding a `title` to several
// hundred elements — which would rot the moment the copy or the column widths
// change — this measures what is *actually* overflowing and discloses only that.
//
// It never touches a title an author wrote: everything it adds is tagged with
// MARK and only tagged attributes are ever updated or removed.

const MARK = 'data-auto-title'

// Text-bearing things that a container can realistically clip. Deliberately not
// `*`: the cost of this pass scales with how much it looks at.
const SELECTOR = [
  'button', '.btn',
  'td', 'th',
  '.pill', '.chip', '.badge', '.status-badge', '.status-pill',
  '[class*="-title"]', '[class*="-label"]', '[class*="-name"]',
  '[class*="-subject"]', '[class*="-value"]', '[class*="-head"]',
  '.mail-sender', '.mail-owner', '.side-label', '.attach-name',
  '.text-truncate', '.line-clamp-2', '.line-clamp-3',
].join(',')

// Overflowing is not the same as being cut off: content can spill out of an
// `overflow: visible` box and still be perfectly readable. So do the cheap
// geometry test first, and only then pay for a style read to confirm the box
// actually clips on that axis.
function isClipped(el) {
  const wide = el.scrollWidth > el.clientWidth + 1
  const tall = el.scrollHeight > el.clientHeight + 1
  if (!wide && !tall) return false
  const s = getComputedStyle(el)
  if (wide && s.overflowX !== 'visible') return true
  return tall && (s.overflowY !== 'visible' || s.webkitLineClamp !== 'none')
}

function sync(root) {
  for (const el of root.querySelectorAll(SELECTOR)) {
    const own = el.getAttribute('title')
    // An author-written title wins, always.
    if (own != null && !el.hasAttribute(MARK)) continue

    const text = el.textContent.trim().replace(/\s+/g, ' ')
    if (text && isClipped(el)) {
      if (own !== text) {
        el.setAttribute('title', text)
        el.setAttribute(MARK, '')
      }
    } else if (el.hasAttribute(MARK)) {
      // It fits again (window widened, value shortened) — take the tooltip back.
      el.removeAttribute('title')
      el.removeAttribute(MARK)
    }
  }
}

export function startAutoTitle(root) {
  if (!root || typeof ResizeObserver === 'undefined') return () => {}

  let frame = 0
  let writing = false
  const schedule = () => {
    if (writing || frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      writing = true
      try { sync(root) } finally { writing = false }
    })
  }

  // Content changes (route change, filter, new rows) and width changes (sidebar
  // collapse, window resize) both change what fits.
  const mo = new MutationObserver(schedule)
  mo.observe(root, { childList: true, subtree: true, characterData: true })
  const ro = new ResizeObserver(schedule)
  ro.observe(root)

  schedule()
  return () => {
    mo.disconnect()
    ro.disconnect()
    if (frame) cancelAnimationFrame(frame)
  }
}
