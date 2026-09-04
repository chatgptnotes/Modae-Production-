import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const sourceRoots = ['src', 'api'].map(dir => path.join(root, dir))
const sourceExtensions = new Set(['.css', '.js', '.jsx', '.mjs', '.html'])
const mojibake = /[ÃÂâ�]/

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(fullPath)
    return sourceExtensions.has(path.extname(entry.name)) ? [fullPath] : []
  })
}

test('application source contains no mojibake characters', () => {
  const badFiles = sourceRoots.flatMap(sourceFiles).filter(file => mojibake.test(fs.readFileSync(file, 'utf8')))
  assert.deepEqual(badFiles, [])
})

test('workbench keeps one UTF-8 opportunity summary and uses the rupee symbol', () => {
  const workbench = fs.readFileSync(path.join(root, 'src/pages/Workbench.jsx'), 'utf8')
  assert.equal(workbench.includes('mojibake-summary'), false)
  assert.match(workbench, /`₹\$\{fmt\(opp\.valueK \|\| 0\)\}\,000`/)
})

test('commercial deviation blockers explain the customer ask and AH approval', () => {
  const workbench = fs.readFileSync(path.join(root, 'src/pages/Workbench.jsx'), 'utf8')
  assert.match(workbench, /Customer requested:/)
  assert.match(workbench, /ModAE offered:/)
  assert.match(workbench, /AH approval is required before submission/)
  assert.match(workbench, /Request AH approval for commercial deviations/)
})

test('approval requests persist context for the Approvals page', () => {
  const workbench = fs.readFileSync(path.join(root, 'src/pages/Workbench.jsx'), 'utf8')
  const approvals = fs.readFileSync(path.join(root, 'src/pages/Approvals.jsx'), 'utf8')
  assert.match(workbench, /blockingReason/)
  assert.match(workbench, /opportunitySummary/)
  assert.match(workbench, /opportunitySnapshot/)
  assert.match(workbench, /deviationDetails/)
  assert.match(approvals, /Why this is blocked/)
  assert.match(approvals, /Opportunity summary/)
})
