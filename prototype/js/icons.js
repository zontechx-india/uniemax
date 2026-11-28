// The two icon sets, copied path for path from the real app. Exceptions:
// x, pause, alert, mapPin and phone in the seller set are drawn here (the
// real seller app imports those from other files).
//
//   Icon(name, cls)    seller / storefront set — storefront/layout/icons.tsx
//                      (stroke 1.8, sized by Tailwind classes)
//   AIcon(name, size)  admin console set — admin/layout/icons.tsx
//                      (stroke 2, class "ic", sized in px)

const SELLER_ICONS = {
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /> <path d="m16 17 5-5-5-5" /> <path d="M21 12H9" />',
  search: '<circle cx="11" cy="11" r="7" /> <path d="m21 21-4.3-4.3" />',
  chevronRight: '<path d="m9 6 6 6-6 6" />',
  chevronDown: '<path d="m6 9 6 6 6-6" />',
  user: '<circle cx="12" cy="8" r="4" /> <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />',
  store: '<path d="M4 9.5V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9.5" /> <path d="M3.5 6 5 3h14l1.5 3a2.5 2.5 0 0 1-5 .5 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0A2.5 2.5 0 0 1 3.5 6Z" /> <path d="M9.5 20v-5.5h5V20" />',
  plus: '<path d="M12 5v14M5 12h14" />',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a2 2 0 0 1 0-4h6a3 3 0 0 0 3-3c0-3.5-4-6-9-6Z" /> <circle cx="7.5" cy="11" r="0.5" /> <circle cx="9.5" cy="7" r="0.5" /> <circle cx="14.5" cy="6.5" r="0.5" />',
  tag: '<path d="M20.6 13.4 12.4 5.2A2 2 0 0 0 11 4.6H5.6a1 1 0 0 0-1 1V11c0 .5.2 1 .6 1.4l8.2 8.2a2 2 0 0 0 2.8 0l4.4-4.4a2 2 0 0 0 0-2.8Z" /> <circle cx="8.5" cy="8.5" r="1" />',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /> <path d="m3 8 9 5 9-5" /> <path d="M12 13v8" />',
  share: '<circle cx="6" cy="12" r="3" /> <circle cx="18" cy="6" r="3" /> <circle cx="18" cy="18" r="3" /> <path d="m8.7 10.7 6.6-3.4M8.7 13.3l6.6 3.4" />',
  check: '<path d="m4.5 12.5 5 5 10-11" />',
  cart: '<circle cx="9" cy="20" r="1.5" /> <circle cx="17" cy="20" r="1.5" /> <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.4a1 1 0 0 0 1-.8L20.5 8H6" />',
  arrowLeft: '<path d="M19 12H5" /> <path d="m12 19-7-7 7-7" />',
  bank: '<path d="m3 9 9-6 9 6" /> <path d="M4 9.5h16" /> <path d="M6 13v5M10 13v5M14 13v5M18 13v5" /> <path d="M3 20.5h18" />',
  card: '<rect x="2.5" y="5.5" width="19" height="13" rx="2" /> <path d="M2.5 9.5h19" /> <path d="M6 14.5h4" />',
  truck: '<path d="M2.5 6.5h11v10h-11z" /> <path d="M13.5 10h4l3 3v3.5h-7" /> <circle cx="6.5" cy="17.5" r="1.8" /> <circle cx="17" cy="17.5" r="1.8" />',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2" /> <path d="M9 4a3 3 0 0 1 6 0" /> <path d="M9 10.5h6M9 14h6M9 17.5h3.5" />',
  shieldCheck: '<path d="M12 3.5 5 6v6c0 4.2 2.9 7.4 7 8.5 4.1-1.1 7-4.3 7-8.5V6l-7-2.5Z" /> <path d="m9 12 2 2 4-4" />',
  chart: '<path d="M4 20.5h16" /> <path d="M6.5 20.5v-7M12 20.5V5.5M17.5 20.5v-11" />',
  megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h2l4 4V5L7 9H5a1 1 0 0 0-1 1z" /> <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12" />',
  lifebuoy: '<circle cx="12" cy="12" r="8.5" /> <circle cx="12" cy="12" r="3.5" /> <path d="m6 6 3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5" />',
  chat: '<path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-4.3A7 7 0 0 1 4 12a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7Z" />',
  panelLeft: '<rect x="3" y="4" width="18" height="16" rx="2" /> <path d="M9 4v16" />',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z" /> <path d="M10 21a2.2 2.2 0 0 0 4 0" />',
  users: '<circle cx="9" cy="8.5" r="3.5" /> <path d="M2.5 20a6.5 6.5 0 0 1 13 0" /> <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />',
  arrowRight: '<path d="M4.5 12h15M13.5 6l6 6-6 6" />',
  dots: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /> <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /> <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />',
  rupee: '<path d="M7 4h11" /> <path d="M7 9h11" /> <path d="M7 4h3.5a4.5 4.5 0 0 1 0 9H7l8 7" />',
  sun: '<circle cx="12" cy="12" r="4" /> <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />',
  x: '<path d="M18 6 6 18M6 6l12 12" />',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1" /> <rect x="14" y="5" width="4" height="14" rx="1" />',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3" /> <path d="M12 9v4M12 17h.01" />',
  mapPin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /> <circle cx="12" cy="9.5" r="2.5" />',
  phone: '<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />',
}

function Icon(name, cls = 'h-5 w-5') {
  return raw(
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
      `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SELLER_ICONS[name] || ''}</svg>`,
  )
}

const ADMIN_ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />',
  orders: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.3 7 12 12l8.7-5M12 22V12" />',
  card: '<rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />',
  tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z" /><circle cx="7.5" cy="7.5" r="1" />',
  layers: '<path d="m12.8 2.2a2 2 0 0 0-1.6 0L2.6 6.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.6 0l8.6-3.9a1 1 0 0 0 0-1.8z" /><path d="m22 12.6-9.2 4.2a2 2 0 0 1-1.6 0L2 12.6M22 17.6l-9.2 4.2a2 2 0 0 1-1.6 0L2 17.6" />',
  shuffle: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" /><path d="m18 2 4 4-4 4M2 6h1.9c1.5 0 2.9.9 3.6 2.2M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8M18 14l4 4-4 4" />',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />',
  scale: '<path d="m16 16 3-8 3 8c-.9.7-1.9 1-3 1s-2.1-.3-3-1zM2 16l3-8 3 8c-.9.7-1.9 1-3 1s-2.1-.3-3-1z" /><path d="M7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />',
  percent: '<path d="M19 5 5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />',
  store: '<path d="M3 9 4.5 4h15L21 9" /><path d="M3 9h18v1.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" /><path d="M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7M10 21v-5h4v5" />',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.6a1 1 0 0 0-.2-.6l-3.5-4.4a1 1 0 0 0-.8-.4H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" />',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3" /><path d="M12 9v4M12 17h.01" />',
  alertCircle: '<circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />',
  banknote: '<rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" />',
  help: '<circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><path d="m4.9 4.9 4.3 4.3M14.8 9.2l4.3-4.3M14.8 14.8l4.3 4.3M9.2 14.8l-4.3 4.3" />',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />',
  image: '<rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />',
  palette: '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1a1.6 1.6 0 0 1 1.7-1.7h2c3 0 5.5-2.5 5.5-5.5C22 6 17.5 2 12 2z" /><circle cx="13.5" cy="6.5" r="1" /><circle cx="17.5" cy="10.5" r="1" /><circle cx="8.5" cy="7.5" r="1" /><circle cx="6.5" cy="12.5" r="1" />',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2" />',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z" />',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v4a2 2 0 0 0 2 2h4M16 13H8M16 17H8M10 9H8" />',
  search: '<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />',
  menu: '<path d="M4 6h16M4 12h16M4 18h16" />',
  x: '<path d="M18 6 6 18M6 6l12 12" />',
  back: '<path d="m15 18-6-6 6-6" />',
  chevron: '<path d="m9 18 6-6-6-6" />',
  chevronDown: '<path d="m6 9 6 6 6-6" />',
  chevronUp: '<path d="m18 15-6-6-6 6" />',
  gem: '<path d="M6 3h12l4 6-10 13L2 9Z" /><path d="M11 3 8 9l4 13 4-13-3-6M2 9h20" />',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" />',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />',
  sun: '<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />',
  external: '<path d="M15 3h6v6M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z" />',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.8 9.8 0 0 1 6.7 2.7L21 8" /><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.8 9.8 0 0 1-6.7-2.7L3 16" /><path d="M8 16H3v5" />',
}

function AIcon(name, size = 16) {
  return raw(
    `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ADMIN_ICONS[name] || ''}</svg>`,
  )
}
