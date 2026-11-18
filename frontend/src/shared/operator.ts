/**
 * The company that runs UnieMax — Zontechx. Shown in the marketplace footer
 * (`MarketFooter`), on /about and /contact, and in the platform
 * `Organization` JSON-LD (`parentOrganization`). Seller stores never show it.
 *
 * Twin: `backend/src/modules/seo/operator.ts`, which writes the same facts
 * into the page shells for crawlers that run no JavaScript. Change both.
 */
export const OPERATOR = {
  name: 'Zontechx',
  url: 'https://zontechx.com',
  phone: '+91 7708774542',
  address: {
    street:
      '2nd Floor, East Wing Innov8, RMZ Millenia Business Park Perungudi Campus 1A, Dr. M.G.R. Road',
    locality: 'Chennai',
    region: 'Tamil Nadu',
    postalCode: '600096',
    country: 'India',
    countryCode: 'IN',
  },
} as const

/** "2nd Floor, …, Chennai, Tamil Nadu 600096, India". */
export const operatorAddressLine = () => {
  const a = OPERATOR.address
  return `${a.street}, ${a.locality}, ${a.region} ${a.postalCode}, ${a.country}`
}
