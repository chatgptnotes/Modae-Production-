import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { MODAE_BRAND, MODAE_PRODUCTS } from '../src/branding/modae.js'
import { BUILT_IN_PROPOSAL_TEMPLATES } from '../src/proposal/templateRegistry.js'
import { SERVICE_RATE_SCHEDULE_URL, STANDARD_TERMS_URL } from '../src/proposal/emailAttachments.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const assetPath = relativePath => path.join(root, 'assets', relativePath)
const requiredAssets = [
  'brand/modae/data/brand-profile.json',
  'brand/modae/data/contact.json',
  'brand/modae/data/products.json',
  'brand/modae/images/official-logo.png',
  'brand/modae/images/icon-source.png',
  'brand/modae/images/about.jpg',
  'brand/modae/images/products/antisurge-control.jpg',
  'brand/modae/images/products/asset-health-management.jpg',
  'brand/modae/images/products/machinery-diagnostics.jpg',
  'brand/modae/images/products/monitoring-systems.jpg',
  'brand/modae/images/products/overspeed-detection.jpg',
  'brand/modae/images/products/sensors.jpg',
  'brand/modae/images/products/turbine-control.jpg',
  'documents/kyc/india-template.docx',
  'documents/proposal/standard-terms-sales.pdf',
  'documents/proposal/services-rate-schedule-fy2025-26.pdf',
  'workbooks/proposal-templates/project.xlsx',
  'workbooks/proposal-templates/service.xlsx',
  'workbooks/proposal-templates/spares.xlsx',
  'workbooks/references/spares/meggitt-item-list.xlsx',
]

test('runtime assets use the canonical tracked hierarchy', () => {
  for (const relativePath of requiredAssets) {
    assert.ok(fs.existsSync(assetPath(relativePath)), `${relativePath} must ship with the application`)
    assert.doesNotMatch(relativePath, /[ A-Z]/, `${relativePath} must use a clean lowercase kebab-case path`)
  }
  assert.equal(fs.existsSync(path.join(root, 'branding')), false)
  assert.equal(fs.existsSync(path.join(root, 'modae doc')), false)
})

test('runtime asset registries resolve to files that are shipped', () => {
  const urls = [
    MODAE_BRAND.officialLogoUrl,
    MODAE_BRAND.aboutImageUrl,
    ...MODAE_PRODUCTS.map(product => product.imageUrl),
    ...BUILT_IN_PROPOSAL_TEMPLATES.map(template => template.url),
    STANDARD_TERMS_URL,
    SERVICE_RATE_SCHEDULE_URL,
  ]
  for (const url of urls) {
    assert.ok(url, 'every registered runtime asset must have a URL')
    assert.ok(fs.existsSync(fileURLToPath(url)), `${url} must resolve to a shipped file`)
  }
})
