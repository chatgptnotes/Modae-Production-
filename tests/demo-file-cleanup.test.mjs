import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

test('demo file cleanup is scoped by is_demo and user ownership', () => {
  const source = fs.readFileSync(path.join(root, 'src/userFiles.js'), 'utf8')
  assert.match(source, /\.eq\('user_id', userId\)/)
  assert.match(source, /\.eq\('is_demo', true\)/)
  assert.match(source, /is_demo: isDemoMode\(\)/)
})

test('manual migration adds the demo-file marker', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/005_demo_file_cleanup.sql'), 'utf8')
  assert.match(sql, /add column if not exists is_demo boolean not null default false/)
})
