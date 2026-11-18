/**
 * The company that runs UnieMax — Zontechx. Meta (WhatsApp display-name
 * review) and other crawlers that run no JavaScript must be able to see that
 * UnieMax belongs to this verified business, so the page shells write these
 * facts into the first byte: the Organization JSON-LD's `parentOrganization`,
 * `<meta name="author">` and a plain-text block in the body (`pageHead.ts`).
 *
 * Twin: `frontend/src/shared/operator.ts` (the footer, About and Contact
 * pages). Change both together.
 */
export const OPERATOR = {
  name: "Zontechx",
  url: "https://zontechx.com",
  phone: "+91 7708774542",
  email: "support@uniemax.com",
  address: {
    street:
      "2nd Floor, East Wing Innov8, RMZ Millenia Business Park Perungudi Campus 1A, Dr. M.G.R. Road",
    locality: "Chennai",
    region: "Tamil Nadu",
    postalCode: "600096",
    country: "India",
    countryCode: "IN",
  },
} as const;

/** One line: "2nd Floor, …, Chennai, Tamil Nadu 600096, India". */
export const operatorAddressLine = () => {
  const a = OPERATOR.address;
  return `${a.street}, ${a.locality}, ${a.region} ${a.postalCode}, ${a.country}`;
};
