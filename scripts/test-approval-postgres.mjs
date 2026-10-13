// Creates and destroys only a uniquely named local synthetic test database.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
const exec = promisify(execFile)
const admin = new URL(process.env.APPROVAL_TEST_ADMIN_URL || 'postgresql://postgres@localhost:55439/postgres')
if (!['localhost','127.0.0.1','[::1]'].includes(admin.hostname)) throw new Error('Approval tests require a local PostgreSQL server.')
const name = `wintrack_approval_test_${randomUUID().replaceAll('-', '')}`
const database = new URL(admin); database.pathname = `/${name}`
const psql = process.env.PSQL_BIN || 'psql'
const run = (url,args) => exec(psql,[url.toString(),'-X','-v','ON_ERROR_STOP=1',...args], { maxBuffer: 4 * 1024 * 1024 })
await run(admin,['-c',`create database ${name}`])
try {
  await run(database,['-f','tests/fixtures/atomic-approval-schema.sql','-f','supabase/011_save_rows_lock_order.sql','-f','supabase/migrations/20261013080111_atomic_approval_commands.sql'])
  const result = await exec(process.execPath,['--test','tests/atomic-approval-db.test.mjs'], {
    env: { ...process.env, APPROVAL_TEST_DATABASE_URL: database.toString() }, maxBuffer: 4 * 1024 * 1024
  })
  process.stdout.write(result.stdout)
} catch (error) {
  process.stderr.write(error.stdout || '')
  process.stderr.write(error.stderr || error.message)
  process.exitCode = 1
} finally {
  await run(admin,['-c',`drop database ${name} with (force)`])
}
