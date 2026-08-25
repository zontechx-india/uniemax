import { Link } from 'react-router-dom'
import { googleMapsLink } from '../../../shared/maps/googleMaps'
import { SOCIAL_META } from '../../../shared/ui/socialIcons'
import {
  FOOTER_POLICY_KEYS,
  FOOTER_SOCIAL_KEYS,
  storeSupportUrl,
  type FooterLocation,
  type FooterPolicyKey,
  type PublicStore,
  type StoreFooter as StoreFooterData,
} from '../stores/storesApi'
import {
  ClockIcon,
  ExternalLinkIcon,
  LifebuoyIcon,
  MailIcon,
  MapPinIcon,
  PhoneCallIcon,
  UserIcon,
} from '../../layout/icons'
import type { Skin } from './storeTheme'

/**
 * Storefront footer — renders the owner's Footer settings (locations, social
 * profiles, store info, support, policy + custom links, copyright). Every
 * block is conditional: a store that configured nothing gets the original
 * minimal footer (brand mark + powered-by), never a wall of empty headings.
 * Fully responsive: one column on phones, two on tablets, four on desktop.
 *
 * The Customer Support block is the one exception to "conditional": it always
 * renders, because **Help & Support is always available** whether or not the
 * owner filled in a phone number — the shopper can message the shop through
 * the app either way, and a footer that hides the only guaranteed contact
 * route to keep a heading tidy is the wrong trade.
 */

const POLICY_LABELS: Record<FooterPolicyKey, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms & Conditions',
  shipping: 'Shipping Policy',
  returns: 'Return & Refund Policy',
  cancellation: 'Cancellation Policy',
}

/** wa.me links want digits only (keep a leading country code, drop the +). */
const waLink = (number: string) => `https://wa.me/${number.replace(/\D/g, '')}`
const telLink = (number: string) => `tel:${number.replace(/[^\d+]/g, '')}`

export function StoreFooter({ store, skin }: { store: PublicStore; skin: Skin }) {
  const footer = store.footer
  const socials = FOOTER_SOCIAL_KEYS.filter((key) => footer.social[key])
  const policies = FOOTER_POLICY_KEYS.filter((key) => footer.policies[key])
  const hasLinks = footer.links.length > 0 || policies.length > 0

  // The block grid always renders now: Customer Support is unconditional
  // (it carries the in-app Help & Support link, which every store has), so
  // the old "configured nothing → minimal footer" branch can no longer be
  // reached and the flags that decided it are gone.

  const copyright =
    footer.copyrightText ??
    `© ${new Date().getFullYear()} ${store.name}. All Rights Reserved.`

  return (
    <footer className={`mt-10 border-t ${skin.border}`}>
      <div className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-10">
        <div className="grid gap-10 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <BrandBlock store={store} socials={socials} />
          {hasLinks && (
            <FooterBlock title="Quick Links">
              <ul className="space-y-2">
                {footer.links.map((link) => (
                  <li key={`${link.label}-${link.url}`}>
                    <FooterAnchor href={link.url}>{link.label}</FooterAnchor>
                  </li>
                ))}
                {policies.map((key) => (
                  <li key={key}>
                    <FooterAnchor href={footer.policies[key]!}>
                      {POLICY_LABELS[key]}
                    </FooterAnchor>
                  </li>
                ))}
              </ul>
            </FooterBlock>
          )}
          {footer.locations.length > 0 && (
            <FooterBlock
              title={footer.locations.length > 1 ? 'Our Locations' : 'Visit Us'}
            >
              <ul className="space-y-5">
                {[...footer.locations]
                  .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
                  .map((location) => (
                    <LocationBlock
                      key={location.id ?? location.address}
                      location={location}
                    />
                  ))}
              </ul>
            </FooterBlock>
          )}
          <FooterBlock title="Customer Support">
            <ul className="space-y-2.5 text-sm">
              {/* First, and always present: the tracked conversation. A
                  phone number can go unanswered; this one has a record. */}
              <ContactRow icon={<LifebuoyIcon className="h-4 w-4" />}>
                <Link
                  to={storeSupportUrl(store.slug)}
                  className="font-semibold transition hover:text-brand"
                >
                  Help &amp; Support
                </Link>
              </ContactRow>
              {footer.support.phone && (
                <ContactRow icon={<PhoneCallIcon className="h-4 w-4" />}>
                  <a
                    href={telLink(footer.support.phone)}
                    className="transition hover:text-brand"
                  >
                    {footer.support.phone}
                  </a>
                </ContactRow>
              )}
              {footer.support.whatsapp && (
                <ContactRow
                  icon={
                    <SOCIAL_META.whatsapp.Icon className="h-4 w-4" />
                  }
                >
                  <a
                    href={waLink(footer.support.whatsapp)}
                    target="_blank"
                    rel="noreferrer"
                    className="transition hover:text-brand"
                  >
                    WhatsApp: {footer.support.whatsapp}
                  </a>
                </ContactRow>
              )}
              {footer.support.email && (
                <ContactRow icon={<MailIcon className="h-4 w-4" />}>
                  <a
                    href={`mailto:${footer.support.email}`}
                    className="break-all transition hover:text-brand"
                  >
                    {footer.support.email}
                  </a>
                </ContactRow>
              )}
              {footer.support.hours && (
                <ContactRow icon={<ClockIcon className="h-4 w-4" />}>
                  {footer.support.hours}
                </ContactRow>
              )}
            </ul>
          </FooterBlock>
        </div>

        <div
          className={`flex flex-col items-center justify-between gap-2 border-t ${skin.border} py-6 text-center text-xs sm:flex-row sm:text-left ${skin.muted}`}
        >
          <div>
            <p>{copyright}</p>
            <RegistrationLine info={footer.info} />
          </div>
          <span>Powered by UnieMax</span>
        </div>
      </div>
    </footer>
  )
}

function BrandBlock({
  store,
  socials,
}: {
  store: PublicStore
  socials: (typeof FOOTER_SOCIAL_KEYS)[number][]
}) {
  const { footer } = store
  return (
    <div className="sm:col-span-2 lg:col-span-1">
      <Link
        to={`/store/${store.slug}`}
        className="inline-flex items-center gap-2.5"
      >
        {store.logoUrl && (
          <img
            src={store.logoUrl}
            alt=""
            className="h-9 w-9 rounded-md object-cover"
          />
        )}
        <span className="metal-text font-heading text-lg font-semibold">
          {store.name}
        </span>
      </Link>
      {footer.info.establishedYear && (
        <p className="mt-1.5 text-xs text-muted">
          Serving you since {footer.info.establishedYear}
        </p>
      )}
      {footer.info.about && (
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
          {footer.info.about}
        </p>
      )}
      {socials.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {socials.map((key) => {
            const { label, Icon } = SOCIAL_META[key]
            const value = footer.social[key]!
            const href = key === 'whatsapp' ? waLink(value) : value
            return (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                title={label}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-alt text-muted transition hover:bg-surface hover:text-brand"
              >
                <Icon className="h-[18px] w-[18px]" />
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FooterBlock({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="font-heading text-sm font-semibold uppercase tracking-wider text-fg">
        {title}
      </h3>
      <div className="mt-3.5">{children}</div>
    </div>
  )
}

/**
 * External URLs get a real anchor (new tab). In-app paths get a router Link
 * ONLY when they live in this (public) router — anything else (e.g. a
 * custom "/about" link) needs a full page load to cross into the
 * marketplace router, or React Router 404s.
 */
const PUBLIC_ROUTER_PATH = /^\/(store|cart|checkout|order)(\/|$)/

function FooterAnchor({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const className = 'text-sm text-muted transition hover:text-brand'
  if (/^https?:\/\//i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    )
  }
  if (PUBLIC_ROUTER_PATH.test(href)) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <a href={href} className={className}>
      {children}
    </a>
  )
}

function ContactRow({
  icon,
  children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-2.5 text-muted">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">{children}</span>
    </li>
  )
}

function LocationBlock({ location }: { location: FooterLocation }) {
  const mapsUrl = googleMapsLink(location.lat, location.lng, location.address)
  return (
    <li className="text-sm">
      {location.label && (
        <p className="font-semibold text-fg">{location.label}</p>
      )}
      <ul className={`space-y-2 ${location.label ? 'mt-2' : ''}`}>
        <ContactRow icon={<MapPinIcon className="h-4 w-4" />}>
          <span className="whitespace-pre-line">{location.address}</span>
        </ContactRow>
        {location.contactPerson && (
          <ContactRow icon={<UserIcon className="h-4 w-4" />}>
            {location.contactPerson}
          </ContactRow>
        )}
        <ContactRow icon={<PhoneCallIcon className="h-4 w-4" />}>
          <a href={telLink(location.phone)} className="transition hover:text-brand">
            {location.phone}
          </a>
          {location.altPhone && (
            <>
              {' · '}
              <a
                href={telLink(location.altPhone)}
                className="transition hover:text-brand"
              >
                {location.altPhone}
              </a>
            </>
          )}
        </ContactRow>
        <ContactRow icon={<MailIcon className="h-4 w-4" />}>
          <a
            href={`mailto:${location.email}`}
            className="break-all transition hover:text-brand"
          >
            {location.email}
          </a>
        </ContactRow>
        {location.hours && (
          <ContactRow icon={<ClockIcon className="h-4 w-4" />}>
            {location.hours}
          </ContactRow>
        )}
      </ul>
      {mapsUrl && (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand transition hover:opacity-80"
        >
          View on Google Maps
          <ExternalLinkIcon className="h-3.5 w-3.5" />
        </a>
      )}
    </li>
  )
}

/** GST / registration small print under the copyright line. */
function RegistrationLine({ info }: { info: StoreFooterData['info'] }) {
  const parts = [
    info.gstNumber ? `GSTIN: ${info.gstNumber}` : null,
    info.registrationNumber ? `Reg. No: ${info.registrationNumber}` : null,
  ].filter(Boolean)
  if (parts.length === 0) return null
  return <p className="mt-1 opacity-80">{parts.join(' · ')}</p>
}
