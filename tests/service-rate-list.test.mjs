import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { serviceRateRows } from '../src/serviceRates.js'

test('service rate list exposes every configured commercial charge with its unit', () => {
  const rows = serviceRateRows({
    currency: 'INR',
    gst: 18,
    rates: {
      engineerDay: 45, seniorDay: 65, travelDay: 20, otHour: 6,
      weekendPct: 50, standbyDay: 25, minCallout: 90, flight: 18,
      hotelNight: 6, transportDay: 4, perDiem: 3, tools: 12,
    },
    roles: [{ role: 'Service Engineer', rateKey: 'engineerDay' }],
  }, 'India')

  assert.deepEqual(rows.map(row => row.key), [
    'engineerDay', 'seniorDay', 'travelDay', 'otHour', 'weekendPct',
    'standbyDay', 'minCallout', 'flight', 'hotelNight', 'transportDay',
    'perDiem', 'tools', 'gst',
  ])
  assert.deepEqual(rows.find(row => row.key === 'engineerDay'), {
    key: 'engineerDay', label: 'Service Engineer / day', value: 45, unit: 'K₹ / day',
  })
  assert.deepEqual(rows.find(row => row.key === 'weekendPct'), {
    key: 'weekendPct', label: 'Weekend premium', value: 50, unit: '%',
  })
  assert.deepEqual(rows.find(row => row.key === 'gst'), {
    key: 'gst', label: 'GST', value: 18, unit: '%',
  })
})

test('Price Lists exposes Service Rates as a top-level tab backed by live rate sheets', () => {
  const page = fs.readFileSync('src/pages/PriceLists.jsx', 'utf8')
  assert.match(page, /Service Rates/)
  assert.match(page, /serviceRateRows/)
  assert.match(page, /store\.rateSheets/)
  assert.match(page, /Extract to Excel/)
})
