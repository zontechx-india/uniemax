import { useState } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { Button } from '../../../../shared/ui/Button'
import { ErrorNote, SuccessNote } from '../../../../shared/ui/form'
import { sellerAffiliateApi } from '../../api'
import type { CommissionType, Partner } from '../../api'
import { CopyButton, Empty, Field, StatusChip, inputClass, money, rateText, shortDate, useLoad } from '../../ui'
import { useSellerAffiliate } from './AffiliateLayout'

/** Invite people, watch the invites land, manage the partners they become. */
export function PartnersTab() {
  const { storeId } = useSellerAffiliate()
  const partners = useLoad(() => sellerAffiliateApi.partners(storeId), [storeId])
  const invites = useLoad(() => sellerAffiliateApi.invites(storeId), [storeId])
  const [error, setError] = useState<string | null>(null)

  const act = async (fn: () => Promise<unknown>, then: () => void) => {
    setError(null)
    try {
      await fn()
      then()
    } catch (err) {
      setError(toApiError(err).message)
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <InviteForm storeId={storeId} onSent={invites.reload} />

      {error && <ErrorNote>{error}</ErrorNote>}

      <section>
        <h3 className="text-sm font-semibold text-fg">Partners</h3>
        {partners.error && <ErrorNote>{partners.error}</ErrorNote>}
        {partners.data?.length === 0 && (
          <div className="mt-2"><Empty>No partners yet — send an invitation above.</Empty></div>
        )}
        <ul className="mt-2 space-y-2">
          {partners.data?.map((partner) => (
            <PartnerRow
              key={partner.id}
              partner={partner}
              onPatch={(patch) =>
                act(() => sellerAffiliateApi.updatePartner(storeId, partner.id, patch), partners.reload)
              }
            />
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-fg">Invitations</h3>
        {invites.error && <ErrorNote>{invites.error}</ErrorNote>}
        {invites.data?.length === 0 && <div className="mt-2"><Empty>No invitations sent yet.</Empty></div>}
        <ul className="mt-2 space-y-2">
          {invites.data?.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">{invite.name}</p>
                <p className="text-xs text-muted">
                  {invite.email} · {rateText(invite.commissionType, invite.commissionRate) === '—' ? 'default rate' : rateText(invite.commissionType, invite.commissionRate)} · sent {shortDate(invite.createdAt)}
                </p>
              </div>
              <StatusChip status={invite.status} />
              {invite.status === 'PENDING' && (
                <>
                  <CopyButton text={invite.url} />
                  <button
                    type="button"
                    onClick={() =>
                      act(() => sellerAffiliateApi.cancelInvite(storeId, invite.id), invites.reload)
                    }
                    className="text-xs text-muted hover:text-danger"
                  >
                    Withdraw
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function InviteForm({ storeId, onSent }: { storeId: string; onSent: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', rate: '', type: 'PERCENTAGE' as CommissionType })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSent(null)
    try {
      const invite = await sellerAffiliateApi.invite(storeId, {
        name: form.name,
        email: form.email,
        ...(form.rate ? { commissionType: form.type, commissionRate: Number(form.rate) } : {}),
      })
      setSent(invite.url)
      setForm({ name: '', email: '', rate: '', type: 'PERCENTAGE' })
      onSent()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-line p-4">
      <h3 className="text-sm font-semibold text-fg">Invite a partner</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Special rate (optional)">
          <div className="flex gap-2">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as CommissionType })}
              className={`${inputClass} w-32`}
            >
              <option value="PERCENTAGE">%</option>
              <option value="FIXED">₹ / item</option>
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Programme default"
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: e.target.value })}
              className={inputClass}
            />
          </div>
        </Field>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {sent && (
        <SuccessNote>
          Invitation emailed. You can also share it directly:{' '}
          <code className="break-all text-xs">{sent}</code>
        </SuccessNote>
      )}
      <Button type="submit" size="sm" loading={busy}>
        Send invitation
      </Button>
    </form>
  )
}

function PartnerRow({
  partner,
  onPatch,
}: {
  partner: Partner
  onPatch: (patch: Parameters<typeof sellerAffiliateApi.updatePartner>[2]) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [type, setType] = useState<CommissionType>(partner.commissionType ?? 'PERCENTAGE')
  const [rate, setRate] = useState(partner.hasOverride ? String(partner.commissionRate) : '')

  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">{partner.name}</p>
          <p className="text-xs text-muted">
            {rateText(partner.commissionType, partner.commissionRate)}
            {partner.hasOverride ? ' (special)' : ''} · {partner.commissions} commissions ·{' '}
            {money(partner.earned)} earned · since {shortDate(partner.joinedAt)}
          </p>
        </div>
        <StatusChip status={partner.accountStatus === 'SUSPENDED' ? 'SUSPENDED' : partner.status} />
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="text-xs font-semibold text-brand hover:underline"
        >
          {partner.hasOverride ? 'Change rate' : 'Special rate'}
        </button>
        <select
          value={partner.status}
          onChange={(e) => void onPatch({ status: e.target.value as Partner['status'] })}
          className="h-9 rounded-md border border-line bg-input px-2 text-xs text-fg"
          aria-label={`Status of ${partner.name}`}
        >
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="REMOVED">Removed</option>
        </select>
      </div>

      {editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CommissionType)}
            className="h-9 rounded-md border border-line bg-input px-2 text-sm text-fg"
          >
            <option value="PERCENTAGE">%</option>
            <option value="FIXED">₹ per item</option>
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="h-9 w-28 rounded-md border border-line bg-input px-2 text-sm text-fg"
            placeholder="Rate"
          />
          <button
            type="button"
            disabled={rate === ''}
            onClick={async () => {
              await onPatch({ commissionType: type, commissionRate: Number(rate) })
              setEditing(false)
            }}
            className="rounded-md bg-fg px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-40"
          >
            Save
          </button>
          {partner.hasOverride && (
            <button
              type="button"
              onClick={async () => {
                await onPatch({ commissionType: null, commissionRate: null })
                setEditing(false)
              }}
              className="text-xs text-muted hover:text-fg"
            >
              Use programme default
            </button>
          )}
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:text-fg">
            Cancel
          </button>
        </div>
      )}
    </li>
  )
}
