export const DEPLOYMENT_MARKER_KEY = 'wintrack-modae-deployment-id'

const hasStoredData = storage => {
  try { return !!storage && storage.length > 0 } catch { return false }
}

const readMarker = storage => {
  try { return storage?.getItem(DEPLOYMENT_MARKER_KEY) || '' } catch { return '' }
}

const writeMarker = (storage, deploymentId) => {
  try { storage?.setItem(DEPLOYMENT_MARKER_KEY, deploymentId); return true } catch { return false }
}

// An unmarked browser that already has state belongs to an older deployed
// version and must be cleaned once. A genuinely clean first visit records its
// deployment immediately, before the app has a chance to persist state.
export function shouldResetForDeployment(deploymentId, local, session) {
  const saved = readMarker(local)
  if (saved) return saved !== deploymentId
  if (hasStoredData(local) || hasStoredData(session)) return true
  writeMarker(local, deploymentId)
  return false
}

export function recordDeploymentMarker(storage, deploymentId) {
  return writeMarker(storage, deploymentId)
}
