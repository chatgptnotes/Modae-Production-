import React, { useState } from 'react'
import { usePwaInstall } from './pwa.js'
import { Icon } from './icons.jsx'

// Dismissing the login banner is a snooze, not a permanent no — a phone user
// who skips it today should still be offered the app in a fortnight.
const DISMISS_KEY = 'wt.installDismissed'
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000

function dismissedRecently() {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY))
    return !!t && (Date.now() - t) < SNOOZE_MS
  } catch (e) {
    return false
  }
}

// Compact button for the tablet top bar.
export function InstallButton() {
  const { canInstall, install, isStandalone, isIOS } = usePwaInstall()
  const [showIos, setShowIos] = useState(false)
  if (isStandalone) return null
  if (canInstall) {
    return <button className="install" onClick={install}><Icon name="install" size={14} /> Install app</button>
  }
  if (isIOS) {
    return (
      <>
        <button className="install" onClick={() => setShowIos(v => !v)}><Icon name="install" size={14} /> Install</button>
        {showIos && (
          <div className="modal form-card" style={{ top: 70 }}>
            <div className="section-title">Add WinTrack to your Home Screen</div>
            <p style={{ fontSize: 13 }}>In Safari: tap the <b>Share</b> button, then <b>"Add to Home Screen"</b>. WinTrack opens full-screen like an app.</p>
            <div className="forms-actions"><button onClick={() => setShowIos(false)}>Close</button></div>
          </div>
        )}
      </>
    )
  }
  return null
}

// Banner for the login card — the only install affordance a user sees before
// signing in, so it carries the iOS instructions inline rather than in a modal.
export function InstallBanner() {
  const { canInstall, install, isStandalone, isIOS } = usePwaInstall()
  const [gone, setGone] = useState(() => dismissedRecently())
  const [showSteps, setShowSteps] = useState(false)

  if (isStandalone || gone) return null
  if (!canInstall && !isIOS) return null

  const dismiss = () => {
    setGone(true)
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch (e) { /* private mode */ }
  }

  return (
    <div className="install-banner">
      <button className="ib-close" type="button" onClick={dismiss} aria-label="Dismiss">
        <Icon name="x" size={13} />
      </button>
      <div className="ib-row">
        <span className="ib-icon"><Icon name="install" size={17} /></span>
        <div className="ib-text">
          <b>Install WinTrack</b>
          <div className="ib-sub">Add it to your home screen — opens full-screen, like an app.</div>
        </div>
      </div>
      {canInstall ? (
        <button className="install" type="button" onClick={install}>Install</button>
      ) : (
        <button className="install" type="button" onClick={() => setShowSteps(v => !v)}>
          {showSteps ? 'Hide steps' : 'How'}
        </button>
      )}
      {showSteps && (
        <div className="ib-steps">
          In Safari: tap the <b>Share</b> button, then <b>"Add to Home Screen"</b>.
        </div>
      )}
    </div>
  )
}
