import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@babel/parser'

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))

test('native form controls declare a nonempty id or name for browser identification', () => {
  const missing = []
  function scan(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) { scan(filename); continue }
      if (!/\.[jt]sx?$/.test(filename)) continue
      const source = parse(fs.readFileSync(filename, 'utf8'), {
        sourceType: 'module', plugins: ['jsx', ...(/\.tsx?$/.test(filename) ? ['typescript'] : [])],
      })
      function visit(node) {
        if (!node || typeof node !== 'object') return
        if (node.type === 'JSXOpeningElement' && ['input', 'select', 'textarea'].includes(node.name?.name)) {
          const identified = node.attributes.some(attribute => {
            if (attribute.type !== 'JSXAttribute' || !['id', 'name'].includes(attribute.name.name)) return false
            const value = attribute.value
            if (value?.type === 'StringLiteral') return Boolean(value.value.trim())
            const expression = value?.expression
            return expression && expression.type !== 'NullLiteral' && expression.type !== 'JSXEmptyExpression' &&
              !(expression.type === 'Identifier' && expression.name === 'undefined') &&
              !(expression.type === 'StringLiteral' && !expression.value.trim())
          })
          if (!identified) {
            missing.push(`${path.relative(sourceRoot, filename)}:${node.loc.start.line}`)
          }
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach(visit)
          else if (value && typeof value === 'object') visit(value)
        }
      }
      visit(source)
    }
  }
  scan(sourceRoot)
  assert.equal(missing.length, 0, `Form controls missing identifiers:\n${missing.join('\n')}`)
})
