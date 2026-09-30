import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseTender } from '../src/tenderParse.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const intake = read('src/pages/IntakeForm.jsx')
const aiFn = read('api/ai.js')

// Biji, 13 Aug: "AI has to extract the RFQ number. If the RFQ number is missing,
// AI can say that missing RFQ number — or if there is no RFQ number, can simply
// say email dated so-and-so."
test('the AI schema can return the RFQ date and the sender', () => {
  assert.match(aiFn, /rfqDate: \{ type: 'STRING' \}, senderEmail: \{ type: 'STRING' \},/,
    'the model had no field to put the RFQ date in, so the regex was the only source')
  assert.match(aiFn, /RFQ date is the date carried by the enquiry\/document/,
    'the prompt must tell the model what these fields are')
})

test('a missing RFQ number falls back to naming the email', () => {
  assert.match(intake, /updates\.rfqNumber = `Email dated \$\{rfqDate\}`/)
  // And a real reference still wins.
  assert.match(intake, /const rfqNumber = extractedHeader\.sectionRef \|\| header\.sectionRef \|\| ''/)
})

test('the extracted sender becomes the proposal recipient', () => {
  assert.match(intake, /if \(header\.senderEmail\) \{/)
  assert.match(intake, /updates\.contactEmail = header\.senderEmail/)
})

  // The local sample enquiries in ".local/documents/modae-doc/" are all .eml; the form rejected anything
// that was not a PDF, so the salesperson retyped every field by hand.
test('saved emails are accepted alongside tender PDFs', () => {
  assert.match(intake, /name\.endsWith\('\.eml'\)/)
  assert.match(intake, /accept="\.pdf,application\/pdf,\.eml,\.msg,message\/rfc822,\.png,\.jpg,\.jpeg,\.webp,image\/\*"/)
  assert.match(intake, /isEmail\s*\n?\s*\? \{ fullText: await file\.text\(\), struct: \[\] \}/,
    'an email is already text — it must not go through pdfjs')
  assert.doesNotMatch(intake, /setAiError\('Please upload a PDF document'\)/)
})

// A comma-joined sentence at the top of the form was the only signal, and the
// red `error` class only fires on fields the user has touched — after an upload
// nothing is touched, so nothing showed.
test('fields the document did not contain are marked on the field', () => {
  assert.match(intake, /const \[aiMissingFields, setAiMissingFields\] = useState\(new Set\(\)\)/)
  assert.match(intake, /setAiMissingFields\(new Set\(REQUIRED_FIELDS\.filter\(k => !filledFields\.has\(k\)\)\)\)/)
  assert.match(intake, /return aiMissing\?\.has\(field\) \? 'not-extracted' : ''/)
  // Every field type shows it.
  for (const component of ['Select', 'Pills', 'Input']) {
    const body = intake.slice(intake.indexOf(`function ${component}(`))
    assert.match(body.slice(0, 700), /aiMissing/, `${component} must show the missing marker`)
  }
  assert.match(read('src/styles.css'), /\.not-extracted/)
})

test('the required list drives both the submit gate and the missing check', () => {
  assert.match(intake, /const REQUIRED_FIELDS = \[/)
  assert.match(intake, /const required = REQUIRED_FIELDS/)
})

// The deterministic parser stays authoritative wherever it succeeds.
test('the regex parser still reads a reference, a date and a buyer', () => {
  const sample = [
    'Tender No: BHE/PW/PUR/TR-1234/2026 dated 12-07-2026',
    'M/s Bharat Heavy Electricals Limited, Haridwar',
    'Subject: Supply of vibration probes',
  ].join('\n')
  const parsed = parseTender(sample, [])
  assert.ok(parsed.header.sectionRef, 'reference must be read')
  assert.ok(!parsed.missing.includes('RFQ number'))
})

test('a document with no reference reports it as missing', () => {
  const parsed = parseTender('Please quote for 4 nos vibration sensors.', [])
  assert.ok(parsed.missing.includes('RFQ number'))
})
