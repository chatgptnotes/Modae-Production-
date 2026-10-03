import brandProfile from '../../assets/brand/modae/data/brand-profile.json' with { type: 'json' }
import contact from '../../assets/brand/modae/data/contact.json' with { type: 'json' }
import products from '../../assets/brand/modae/data/products.json' with { type: 'json' }
const officialLogoUrl = new URL('../../assets/brand/modae/images/official-logo.png', import.meta.url).href
const aboutImageUrl = new URL('../../assets/brand/modae/images/about.jpg', import.meta.url).href
const antiSurgeImageUrl = new URL('../../assets/brand/modae/images/products/antisurge-control.jpg', import.meta.url).href
const assetHealthImageUrl = new URL('../../assets/brand/modae/images/products/asset-health-management.jpg', import.meta.url).href
const diagnosticsImageUrl = new URL('../../assets/brand/modae/images/products/machinery-diagnostics.jpg', import.meta.url).href
const monitoringImageUrl = new URL('../../assets/brand/modae/images/products/monitoring-systems.jpg', import.meta.url).href
const overspeedImageUrl = new URL('../../assets/brand/modae/images/products/overspeed-detection.jpg', import.meta.url).href
const sensorsImageUrl = new URL('../../assets/brand/modae/images/products/sensors.jpg', import.meta.url).href
const turbineControlImageUrl = new URL('../../assets/brand/modae/images/products/turbine-control.jpg', import.meta.url).href

export const MODAE_BRAND = Object.freeze({
  ...brandProfile,
  contact,
  officialLogoUrl,
  logoUrl: officialLogoUrl,
  letterheadUrl: officialLogoUrl,
  letterhead: Object.freeze({
    legalName: 'MODAE INDIA PRIVATE LIMITED',
    // Capital "In" — the 18 Aug branding-guideline email spells the tagline
    // "Your Partners In Achieving Excellence" in the document header spec.
    tagline: 'Your Partners In Achieving Excellence',
    officialAddress: '7th Floor, Commerce Mantri, 12, 1 & 2, Bannerghatta Road, BTM Layout, 2nd Stage, BTM Layout, Bangalore, Karnataka – 560076',
    salesOffice: '7th Floor, Commerce Mantri, 12, 1 & 2, Bannerghatta Road, BTM Layout, 2nd Stage, BTM Layout, Bangalore, Karnataka – 560076',
    // The samples and the May 2026 letterhead both print the registered office
    // alongside the sales office; it was blank, so the proposal footer carried
    // only half the statutory identity.
    registeredOffice: '503C, Hiranandani Hill Crest, Begur Hulimavu Road, Hulimavu, Bangalore 560076, India',
    gstin: '29AARCM8622J1ZQ',
    cin: 'U62099KA2024PTC185715',
  }),
  aboutImageUrl,
})

// ---------------------------------------------------------- visual identity
// Read off mod-ae.com's own theme stylesheet
// (wp-content/themes/Qfactum/assets/css/style.css) after the 20 Aug review
// asked for the full brand identity — colours and buttons — rather than the
// logo and font alone. The BT prototype's :root carries the same palette, so
// the two references agree.
//
// This is the source of truth; styles.css mirrors it into CSS custom
// properties. Keep them in step — tests/mobile-deploy.test.mjs asserts it.
//
// One deliberate departure. The brand colour is a red, and this app also uses
// red to mean *lost*, *overdue* and *Red-class customer*. Those stay a separate
// hue (`status.bad`) so a destructive state never reads as a primary button.
export const MODAE_COLORS = Object.freeze({
  primary: '#ED3F2F',        // .btn__primary, links, accents
  primaryDark: '#C7291B',    // hover / pressed
  primaryLight: '#FDEDEB',   // tinted fills
  primaryBorder: '#F6C3BD',
  ink: '#282828',            // headings, sidebar, dark chrome
  inkSoft: '#3F3F3F',        // body copy
  muted: '#616161',
  border: '#E3E3E5',
  canvas: '#F7F7F8',
  surface: '#FFFFFF',
  // Semantic, deliberately not the brand red.
  status: Object.freeze({
    good: '#37A64A',
    info: '#2F80ED',
    warn: '#D99200',
    bad: '#C93838',   // one step darker than the website tone: white text needs 4.5:1
  }),
  // Customer-approved sales funnel palette, from forest green to soft sage.
  ramp: Object.freeze(['#064E3B', '#047857', '#059669', '#10B981', '#6EE7B7']),
})

export const MODAE_TYPE = Object.freeze({
  heading: "'Candara', 'Segoe UI', system-ui, sans-serif",
  body: "'Candara', 'Segoe UI', system-ui, sans-serif",
  document: "'Candara', 'Segoe UI', system-ui, sans-serif",
  // Website buttons are 60px tall hero controls. The colour, radius, weight and
  // letter-spacing carry across; the metrics do not — this is a dense
  // enterprise UI, not a marketing page.
  buttonRadius: '7px',
  buttonWeight: 700,
  buttonTracking: '.3px',
  cardRadius: '12px',
})

// Shared source of truth for every customer-facing document and export.
// Keep the visible footer text exactly as approved by ModAE India.
export const MODAE_DOCUMENT_STANDARDS = Object.freeze({
  fontFamily: MODAE_TYPE.document,
  bodySizePt: 11,
  headingSizePt: 12,
  marginsInches: Object.freeze({ left: 0.75, right: 0.75, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 }),
  header: Object.freeze({ tagline: 'Your Partners In Achieving Excellence' }),
  footerLines: Object.freeze([
    'ModAE India Private Limited',
    '7th Floor, Commerce Mantri, 12, 1 & 2, Bannerghatta Road, BTM Layout, 2nd Stage, BTM Layout, Bangalore, Karnataka – 560076',
    'CIN: U62099KA2024PTC185715 | GST: 29AARCM8622J1ZQ',
  ]),
  orientation: Object.freeze({
    cover: 'portrait', report: 'portrait', proposal: 'portrait', policy: 'portrait',
    signalList: 'landscape', rackLayout: 'landscape', compliance: 'landscape',
    boq: 'landscape', pricing: 'landscape', issues: 'landscape',
    clarifications: 'portrait', sensorComparison: 'landscape', sow: 'portrait',
  }),
})

const imageBySlug = {
  'antisurge-control-system': antiSurgeImageUrl,
  'asset-health-management': assetHealthImageUrl,
  'machinery-diagnostics': diagnosticsImageUrl,
  'monitoring-systems': monitoringImageUrl,
  'overspeed-detection-system': overspeedImageUrl,
  sensors: sensorsImageUrl,
  'turbine-control-system': turbineControlImageUrl,
}

export const MODAE_PRODUCTS = Object.freeze(products.map(product => Object.freeze({
  ...product,
  imageUrl: imageBySlug[product.slug] || '',
})))

export const productBrandProfile = value => {
  const selected = Array.isArray(value) ? value : [value]
  const names = selected.map(v => String(v || '').trim()).filter(Boolean)
  const lower = names.map(v => v.toLowerCase())
  return MODAE_PRODUCTS.find(product =>
    lower.some(name => name === product.title.toLowerCase() || name.includes(product.title.toLowerCase()))
  ) || null
}

export const productBrandProfiles = value => {
  const selected = Array.isArray(value) ? value : [value]
  return selected.map(productBrandProfile).filter(Boolean)
}
