import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const styles = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8')
const login = fs.readFileSync(path.join(root, 'src/pages/Login.jsx'), 'utf8')
const supabase = fs.readFileSync(path.join(root, 'src/supabase.js'), 'utf8')

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

test('sign-in gives feedback and prevents duplicate submissions while Supabase responds', () => {
  assert.match(login, /const \[signingIn, setSigningIn\] = useState\(false\)/)
  assert.match(login, /if \(signingIn\) return/)
  assert.match(login, /disabled=\{signingIn\} aria-busy=\{signingIn\}/)
  assert.match(login, /Signing in…/)
})

test('Supabase sign-in clears a rejected persisted session', () => {
  assert.match(supabase, /const result = await withTimeout\(supabase\.auth\.signInWithPassword/)
  assert.match(supabase, /if \(result\.error && isSupabaseAuthError\(result\.error\)\) await clearSupabaseSession\(\)/)
  assert.match(supabase, /if \(isSupabaseAuthError\(error\)\) await clearSupabaseSession\(\)/)
})
