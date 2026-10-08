export const validPriceAmount = value =>
  (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
  Number.isFinite(Number(value)) && Number(value) >= 0

export const validPriceListParts = parts => Array.isArray(parts) && parts.length > 0 &&
  parts.every(part => String(part.pn || '').trim() && validPriceAmount(part.price) &&
    (part.adders || []).every(adder => validPriceAmount(adder.price)))

export const validServiceRatePatch = patch => !!patch &&
  (patch.gst === undefined || (validPriceAmount(patch.gst) && Number(patch.gst) <= 100)) &&
  Object.values(patch.rates || {}).every(validPriceAmount)
