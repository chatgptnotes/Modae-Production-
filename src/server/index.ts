import { createApp } from './app.js'
import { assertRuntimeConfig } from './config.js'

const { port } = assertRuntimeConfig()
const server = createApp().listen(port, '0.0.0.0', () => {
  console.log(`WinTrack server listening on 0.0.0.0:${port}`)
})

let shuttingDown = false

async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal}: shutting down WinTrack server`)

  const forceExit = setTimeout(() => process.exit(1), 10_000)
  forceExit.unref()
  server.close(() => {
    clearTimeout(forceExit)
    process.exit(0)
  })
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))
