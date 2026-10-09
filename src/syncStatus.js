// Raw status can outlive the shared session that produced it (for example
// when localhost falls back to a browser-only demo login).
export function workspaceSyncStatus({ status, enabled, localDemo = false, configError = '' }) {
  if (localDemo) return 'local-only'
  if (configError) return 'config-error'
  return enabled ? status : 'local-only'
}
