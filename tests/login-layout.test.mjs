import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const styles = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8')
const login = fs.readFileSync(path.join(root, 'src/pages/Login.jsx'), 'utf8')
const supabase = fs.readFileSync(path.join(root, 'src/supabase.js'), 'utf8')
const store = fs.readFileSync(path.join(root, 'src/store.jsx'), 'utf8')
const datastore = fs.readFileSync(path.join(root, 'src/datastore.js'), 'utf8')

test('login card is centered on a viewport-sized layout', () => {
  assert.match(styles, /\.login-bg \{ min-height: 100dvh; display: flex; align-items: center; justify-content: center;/)
  assert.match(styles, /\.login-card \{ box-sizing: border-box;/)
})

test('short login view remains reachable and preserves email/password auth actions', () => {
  assert.match(styles, /@media \(max-height: 720px\) \{\s*\.login-bg \{ align-items: flex-start; \}/)
  assert.match(login, /onSubmit=\{submitSignIn\}/)
  assert.match(login, /onSubmit=\{submitRegister\}/)
  assert.doesNotMatch(login, /Quick login|quickLogin|quickAccounts|ql-title|ql-grid|ql-btn/)
  assert.doesNotMatch(login, /Sign in with Microsoft|microsoftSignIn|msNotice/)
})

test('password fields provide an accessible visibility toggle', () => {
  assert.match(login, /const \[showPassword, setShowPassword\] = useState\(false\)/)
  assert.match(login, /type=\{showPassword \? 'text' : 'password'\}/)
  assert.match(login, /aria-label=\{showPassword \? 'Hide password' : 'Show password'\}/)
  assert.match(login, /aria-pressed=\{showPassword\}/)
  assert.match(login, /id="lg-pw"[\s\S]*type=\{showPassword \? 'text' : 'password'\}/)
  assert.match(login, /id="rg-pw"[\s\S]*type=\{showPassword \? 'text' : 'password'\}/)
})

test('password visibility control remains inside the password field boundary', () => {
  assert.match(styles, /\.password-field \{ position: relative; display: flex; align-items: stretch; \}/)
  assert.match(styles, /\.password-toggle \{ position: absolute; top: 0; right: 6px; bottom: 0; margin: auto 0; transform: none;/)
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

test('localhost Supabase failures can use local demo auth without enabling it remotely', () => {
  assert.match(login, /canUseLocalDemoAuth\(window\.location\.hostname, supabase, error\)/)
  assert.match(login, /store\.login\(email, pw, 'local-demo'\)/)
  assert.match(store, /auth: \{ source, user:/)
  assert.match(store, /!isLocalDemoSession\(stateRef\.current\)/)
  assert.match(datastore, /export const dbEnabled = \(\) => !!supabase && !localDemoMode/)
})
