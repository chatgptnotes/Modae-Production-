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
