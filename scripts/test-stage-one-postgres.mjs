// Run only against a uniquely named synthetic local database, then remove it.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
const exec = promisify(execFile)
const admin = new URL(process.env.STAGE_ONE_TEST_ADMIN_URL || 'postgresql://postgres@127.0.0.1:55441/postgres')
if (!['localhost','127.0.0.1','[::1]'].includes(admin.hostname)) throw new Error('Stage 1 tests require a local PostgreSQL server.')
const name = `wintrack_stage_one_test_${randomUUID().replaceAll('-', '')}`
const database = new URL(admin); database.pathname = `/${name}`
const psql = process.env.PSQL_BIN || 'psql'
const run = args => exec(psql, [admin.toString(), '-X', '-v', 'ON_ERROR_STOP=1', ...args])
await run(['-c', `create database ${name}`])
try {
  const result = await exec(process.execPath, ['--test', 'tests/stage-one-postgres.test.mjs'], {
    env: { ...process.env, STAGE_ONE_TEST_DATABASE_URL: database.toString() }, maxBuffer: 4 * 1024 * 1024,
  })
  process.stdout.write(result.stdout)
} catch (error) {
  process.stderr.write(error.stdout || '')
  process.stderr.write(error.stderr || error.message)
  process.exitCode = 1
} finally { await run(['-c', `drop database ${name} with (force)`]) }
