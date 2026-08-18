import React from 'react'
import { MODAE_BRAND } from './modae.js'

export default function BrandWatermark({ variant = 'shell', className = '' }) {
  return (
    <div
      className={`brand-watermark brand-watermark--${variant} ${className}`.trim()}
      aria-hidden="true"
    >
      <img
        className="brand-watermark__mark"
        src={MODAE_BRAND.logoUrl}
        alt=""
        draggable="false"
      />
    </div>
  )
}
