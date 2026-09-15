import { Outlet, useOutletContext } from 'react-router-dom'
import { ErrorNote } from '../../../../shared/ui/form'
import { partnerApi } from '../../api'
import type { Me } from '../../api'
import { Empty, TabNav, useLoad } from '../../ui'

export interface PartnerContext {
  me: Me
  reload: () => void
}

export const usePartner = () => useOutletContext<PartnerContext>()

/** /affiliate — the partner portal shell: header, tabs, and the profile the tabs share. */
export function PartnerLayout() {
  const me = useLoad(() => partnerApi.me(), [])

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-body text-xl font-semibold text-fg">Affiliate Partner</h1>
      <p className="mt-1 text-sm text-muted">
        Share products from the stores you partner with and earn a commission on every order.
      </p>

      {me.loading && <p className="mt-6 text-sm text-muted">Loading…</p>}

      {me.error && (
        <div className="mt-6">
          {me.error.includes('not an affiliate') ? (
            <Empty>
              Affiliate partnerships are by invitation. When a store invites you, the link in
              that email brings you here.
            </Empty>
          ) : (
            <ErrorNote>{me.error}</ErrorNote>
          )}
        </div>
      )}

      {me.data && (
        <>
          <TabNav
            tabs={[
              { label: 'Overview', to: '.', end: true },
              { label: 'Stores & products', to: 'stores' },
              { label: 'My links', to: 'links' },
              { label: 'Commissions', to: 'commissions' },
            ]}
          />
          <div className="mt-5">
            <Outlet context={{ me: me.data, reload: me.reload } satisfies PartnerContext} />
          </div>
        </>
      )}
    </div>
  )
}
