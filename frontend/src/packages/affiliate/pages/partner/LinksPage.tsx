import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../../shared/auth/http'
import { ErrorNote } from '../../../../shared/ui/form'
import { partnerApi } from '../../api'
import type { AffiliateLink } from '../../api'
import { CopyButton, Empty, shortDate, useLoad } from '../../ui'

export function LinksPage() {
  const links = useLoad(() => partnerApi.links(), [])
  const [error, setError] = useState<string | null>(null)

  const toggle = async (link: AffiliateLink) => {
    setError(null)
    try {
      const updated = await partnerApi.updateLink(link.id, { enabled: !link.enabled })
      links.setData((rows) => rows?.map((r) => (r.id === updated.id ? updated : r)) ?? null)
    } catch (err) {
      setError(toApiError(err).message)
    }
  }

  if (links.loading) return <p className="text-sm text-muted">Loading…</p>
  if (links.error) return <ErrorNote>{links.error}</ErrorNote>
  if (!links.data?.length) {
    return (
      <Empty>
        No links yet — pick a product under{' '}
        <Link to="../stores" className="font-semibold text-brand hover:underline">
          Stores &amp; products
        </Link>{' '}
        to create one.
      </Empty>
    )
  }

  return (
    <div>
      {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}
      <ul className="space-y-2">
        {links.data.map((link) => (
          <li
            key={link.id}
            className={`flex flex-wrap items-center gap-3 rounded-lg border border-line p-3 ${
              link.enabled ? '' : 'opacity-60'
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">
                {link.productName ?? `${link.storeName} — store page`}
              </p>
              <p className="text-xs text-muted">
                {link.storeName}
                {link.channel && ` · ${link.channel.charAt(0) + link.channel.slice(1).toLowerCase()}`}
                {link.label && ` · ${link.label}`} · {link.clickCount} clicks · {shortDate(link.createdAt)}
              </p>
              <code className="mt-1 block truncate text-xs text-muted">{link.url}</code>
            </div>
            <CopyButton text={link.url} />
            <button
              type="button"
              onClick={() => toggle(link)}
              className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-fg hover:bg-surface-alt"
            >
              {link.enabled ? 'Disable' : 'Enable'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
