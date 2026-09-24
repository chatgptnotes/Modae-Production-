import { execFileSync } from 'node:child_process'

const previous = process.env.VERCEL_GIT_PREVIOUS_COMMIT_SHA
const current = process.env.VERCEL_GIT_COMMIT_SHA

// If Vercel does not provide both commits, build safely. This covers the first
// deployment and manual deployments where there is no reliable diff baseline.
if (!previous || !current || !/^[0-9a-f]{7,40}$/i.test(previous) || !/^[0-9a-f]{7,40}$/i.test(current)) {
  process.exitCode = 1
} else {
  let changedFiles = []
  try {
    changedFiles = execFileSync('git', ['diff', '--name-only', previous, current, '--'], {
      encoding: 'utf8',
    }).split('\n').map(file => file.trim()).filter(Boolean)
  } catch {
    // A missing shallow-clone baseline must never suppress a production build.
    process.exitCode = 1
  }

  if (process.exitCode !== 1) {
    const buildRelevant = file => (
      file.startsWith('src/')
      || file.startsWith('api/')
      || file.startsWith('public/')
      || file.startsWith('branding/')
      || file.startsWith('scripts/')
      || file === 'package.json'
      || file === 'package-lock.json'
      || file === 'vite.config.js'
      || file === 'vercel.json'
      || file === '.env.example'
    )

    // Exit 0 means Vercel skips the build. Any runtime-sensitive file means
    // exit 1 so the deployment proceeds.
    process.exitCode = changedFiles.some(buildRelevant) ? 1 : 0
  }
}
