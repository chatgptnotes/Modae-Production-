import React from 'react'

// Inline stroke icon set (lucide-style): currentColor, no emoji anywhere.
const PATHS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9.5 21v-6h5v6" /></>,
  sheet: <><rect x="3" y="3" width="18" height="18" rx="1.5" /><path d="M3 9h18M9 3v18" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  bot: <><rect x="4.5" y="8" width="15" height="12" rx="2" /><path d="M12 8V4.5" /><circle cx="12" cy="3.5" r="1" /><circle cx="9" cy="13" r="0.6" fill="currentColor" /><circle cx="15" cy="13" r="0.6" fill="currentColor" /><path d="M9 17h6" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  tag: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1" /></>,
  chartBar: <><path d="M3 21h18" /><path d="M7 21v-8M12 21V7M17 21v-5" /></>,
  chartLine: <><path d="M3 3v18h18" /><path d="m6.5 15 4-5 3 3 5-7" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M17.5 13.7a6.5 6.5 0 0 1 4 6.3" /></>,
  shield: <path d="M12 3 4.5 6v5c0 4.5 3 8.5 7.5 10 4.5-1.5 7.5-5.5 7.5-10V6Z" />,
  fileText: <><path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5Z" /><path d="M14 2.5V7.5h5" /><path d="M8.5 13h7M8.5 17h7" /></>,
  fileSheet: <><path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5Z" /><path d="M14 2.5V7.5h5" /><path d="M8.5 12h7M8.5 16h7M12 12v7.5" /></>,
  upload: <><path d="M12 16V4.5" /><path d="m6.5 9.5 5.5-5 5.5 5" /><path d="M4 20h16" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7.5 9 6 9-6" /></>,
  printer: <><path d="M7 8V3.5h10V8" /><rect x="3" y="8" width="18" height="8" rx="1.5" /><path d="M7 16h10v4.5H7z" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.5 9" /></>,
  alert: <><path d="M12 3.5 2.5 20h19Z" /><path d="M12 9.5v4.5" /><path d="M12 17.3v.2" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" /></>,
  cards: <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  download: <><path d="M12 4v11.5" /><path d="m6.5 10.5 5.5 5 5.5-5" /><path d="M4 20h16" /></>,
  inbox: <><path d="M21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5" /><path d="M5.5 5h13L21 13h-5l-1.5 2.5h-5L8 13H3Z" /></>,
  list: <><path d="M8.5 6h12M8.5 12h12M8.5 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
  sparkles: <><path d="M12 3.5 13.8 8.7 19 10.5l-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8Z" /><path d="M19 3v3M17.5 4.5h3" /><path d="M5.5 17.5v3M4 19h3" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" /></>,
  play: <path d="M7 4.5v15l12-7.5Z" />,
  clipboardCheck: <><rect x="5" y="4" width="14" height="17.5" rx="1.5" /><path d="M9 4a3 3 0 0 1 6 0" /><path d="m8.5 13.5 2.5 2.5 4.5-5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a13.5 13.5 0 0 1 0 18 13.5 13.5 0 0 1 0-18Z" /></>,
  send: <><path d="M21.5 2.5 10.5 13.5" /><path d="M21.5 2.5 14.5 21.5l-4-8-8-4Z" /></>,
  phone: <path d="M5 3.5h4L11 8l-2.5 2a12.5 12.5 0 0 0 5.5 5.5L16 13l4.5 2v4a1.5 1.5 0 0 1-1.6 1.5A17.5 17.5 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5Z" />,
  key: <><circle cx="7.5" cy="15.5" r="4" /><path d="m10.5 12.5 9-9" /><path d="M15.5 7.5 18 10M18.5 4.5 21 7" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M4 4l16 16" /><path d="M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4M6 8a16.5 16.5 0 0 0-3.5 4S6 18.5 12 18.5a9.3 9.3 0 0 0 4-.9" /></>,
  cloud: <path d="M17.5 18.5H7a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 10.6a4 4 0 0 1-.5 7.9Z" />,
  refresh: <><path d="M20 5v5h-5" /><path d="M4 19v-5h5" /><path d="M19.5 10a8 8 0 0 0-14.4-3M4.5 14a8 8 0 0 0 14.4 3" /></>,
  arrowRight: <><path d="M4 12h16" /><path d="m14 6 6 6-6 6" /></>,
  gitCompare: <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M6 8.5V15a3 3 0 0 0 3 3h3M18 15.5V9a3 3 0 0 0-3-3h-3" /><path d="m14.5 3.5 -2.5 2.5 2.5 2.5M9.5 20.5 12 18l-2.5-2.5" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  layers: <><path d="m12 3 9.5 5L12 13 2.5 8Z" /><path d="m4 12.5 8 4.2 8-4.2M4 17l8 4.2 8-4.2" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4.5c4-2.3 7 2 11.5 0V13c-4.5 2-7.5-2.3-11.5 0" /></>,
  tablet: <><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M11 18.5h2" /></>,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="1.5" /><path d="M9 21h6M12 17v4" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0" /><path d="M12 17.5V21M8.5 21h7" /></>,
  note: <><path d="M4 4.5h16v11l-5 5H4Z" /><path d="M15 20.5v-5h5" /><path d="M8 9.5h8M8 13h5" /></>,
  install: <><path d="M12 3v10.5" /><path d="m7 9 5 5 5-5" /><rect x="4" y="16.5" width="16" height="4.5" rx="1" /></>,
  logout: <><path d="M14 4.5h4A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5h-4" /><path d="M10 8l-4 4 4 4M6 12h9.5" /></>,
  building: <><rect x="4" y="3.5" width="12" height="17" rx="1" /><path d="M16 9.5h4v11H4" /><path d="M7.5 7.5h2M7.5 11h2M7.5 14.5h2M11 7.5h2M11 11h2M11 14.5h2" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 9.5h18" /><path d="M16 14.5h2" /></>,
  bell: <><path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" /><path d="M13.7 19a2 2 0 0 1-3.4 0" /></>,
  wifi: <><path d="M2.5 9a16 16 0 0 1 19 0" /><path d="M5.5 12.5a11.5 11.5 0 0 1 13 0" /><path d="M8.5 16a7 7 0 0 1 7 0" /><circle cx="12" cy="19.5" r="1" fill="currentColor" /></>,
  sun: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" /></>,
  moon: <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />,
  trendUp: <><path d="M3.5 17 10 10.5l3.5 3.5L20.5 7" /><path d="M15.5 7h5v5" /></>,
  trendDown: <><path d="M3.5 7 10 13.5l3.5-3.5L20.5 17" /><path d="M15.5 17h5v-5" /></>,
}

// Geometric placeholder wordmark for the Home header — swap for the official
// ModAE asset when brand guidelines arrive.
export function BrandMark({ height = 30, className = '' }) {
  return (
    <span className={`brandmark ${className}`} aria-label="ModAE">
      <svg viewBox="0 0 48 34" height={height} fill="none" aria-hidden="true">
        <path d="M3 31 15 6l9 16 9-16 12 25" stroke="currentColor" strokeWidth="4.5"
          strokeLinejoin="round" strokeLinecap="round" opacity=".55" />
        <path d="M15 31 24 14l9 17Z" fill="currentColor" opacity=".9" />
      </svg>
      <b>MODAE</b>
    </span>
  )
}

export function Icon({ name, size = 18, className = '' }) {
  return (
    <svg className={`ic ${className}`} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] || null}
    </svg>
  )
}
