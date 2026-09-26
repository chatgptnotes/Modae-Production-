import { createApp } from './app.js'
import { assertRuntimeConfig } from './config.js'

const { port } = assertRuntimeConfig()
createApp().listen(port, () => console.log(`WinTrack server listening on port ${port}`))
