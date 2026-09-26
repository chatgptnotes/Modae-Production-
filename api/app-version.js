export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.status(200).json({
    deploymentId: process.env.RAILWAY_GIT_COMMIT_SHA || 'local',
  })
}
