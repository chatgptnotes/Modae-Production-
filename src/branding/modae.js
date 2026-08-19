import brandProfile from '../../branding/mod-ae/data/brand-profile.json' with { type: 'json' }
import contact from '../../branding/mod-ae/data/contact.json' with { type: 'json' }
import products from '../../branding/mod-ae/data/products.json' with { type: 'json' }
const officialLogoUrl = new URL('../../branding/mod-ae/assets/modae-official-logo.png', import.meta.url).href
const aboutImageUrl = new URL('../../branding/mod-ae/assets/about-us-pic-2.jpg', import.meta.url).href
const antiSurgeImageUrl = new URL('../../branding/mod-ae/assets/Antisurge-Control-System.jpg', import.meta.url).href
const assetHealthImageUrl = new URL('../../branding/mod-ae/assets/products-centrifugal-compressor.jpg', import.meta.url).href
const diagnosticsImageUrl = new URL('../../branding/mod-ae/assets/machinery-diagnostics-1.jpg', import.meta.url).href
const monitoringImageUrl = new URL('../../branding/mod-ae/assets/Monitoring-Systems-1.jpg', import.meta.url).href
const overspeedImageUrl = new URL('../../branding/mod-ae/assets/OverSpeed-Detection-System.jpg', import.meta.url).href
const sensorsImageUrl = new URL('../../branding/mod-ae/assets/Our-Producs-banner-2.jpg', import.meta.url).href
const turbineControlImageUrl = new URL('../../branding/mod-ae/assets/Turbine-Control-System-1.jpg', import.meta.url).href

export const MODAE_BRAND = Object.freeze({
  ...brandProfile,
  contact,
  officialLogoUrl,
  logoUrl: officialLogoUrl,
  letterheadUrl: officialLogoUrl,
  letterhead: Object.freeze({
    legalName: 'MODAE INDIA PRIVATE LIMITED',
    tagline: 'Your Partners in Achieving Excellence',
    officialAddress: '7th Floor, Commerce Mantri, 12, 1 & 2, Bannerghatta Road, BTM Layout, 2nd Stage, BTM Layout, Bangalore, Karnataka – 560076',
    salesOffice: '7th Floor, Commerce Mantri, 12, 1 & 2, Bannerghatta Road, BTM Layout, 2nd Stage, BTM Layout, Bangalore, Karnataka – 560076',
    registeredOffice: '',
    gstin: '29AARCM8622J1ZQ',
    cin: 'U62099KA2024PTC185715',
  }),
  aboutImageUrl,
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
