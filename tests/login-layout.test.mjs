import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const styles = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8')
const login = fs.readFileSync(path.join(root, 'src/pages/Login.jsx'), 'utf8')

test('login card is centered on a viewport-sized layout', () => {
  assert.match(styles, /\.login-bg \{ min-height: 100dvh; display: flex; align-items: center; justify-content: center;/)
  assert.match(styles, /\.login-card \{ box-sizing: border-box;/)
})

test('short login view remains reachable and preserves existing auth actions', () => {
  assert.match(styles, /@media \(max-height: 720px\) \{\s*\.login-bg \{ align-items: flex-start; \}/)
  assert.match(login, /onSubmit=\{submitSignIn\}/)
  assert.match(login, /onSubmit=\{submitRegister\}/)
  assert.match(login, /quickLogin/)
})
