import { useEffect, useState } from 'react'
import { usePrivatePageTitle } from '../../shared/seo'
import { toApiError } from '../../shared/auth/http'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { ErrorNote, SuccessNote } from '../../shared/ui/form'
import { addressesApi, formatAddressLine } from '../features/addresses/addressesApi'
import type { AddressInput, CustomerAddress } from '../features/addresses/addressesApi'
import { AddressForm } from '../features/addresses/AddressForm'
import {
  CheckIcon,
  MapPinIcon,
  PencilIcon,
  PhoneCallIcon,
  PlusIcon,
  TrashIcon,
} from '../layout/icons'

/**
 * Saved Addresses (/addresses) — the customer's address book. Up to 10
 * addresses; exactly one is PRIMARY (the default checkout suggestion —
 * deleting it promotes the oldest remaining). Checkout offers this list as
 * selectable rows, so keeping it current makes ordering one tap.
 */

const MAX_ADDRESSES = 10

export function AddressesPage() {
  usePrivatePageTitle('Saved Addresses')

  const [addresses, setAddresses] = useState<CustomerAddress[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // 'new' → add form; an address id → that row's edit form.
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<CustomerAddress | null>(null)

  useEffect(() => {
    let cancelled = false
    addressesApi
      .list()
      .then((rows) => {
        if (!cancelled) setAddresses(rows)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(toApiError(err).message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true)
    setActionError(null)
    setSaved(false)
    try {
      await action()
      setSaved(true)
      return true
    } catch (err) {
      setActionError(toApiError(err).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const refresh = async () => setAddresses(await addressesApi.list())

  const create = (input: AddressInput) =>
    run(async () => {
      await addressesApi.create(input)
      await refresh()
      setEditing(null)
    })

  const update = (addressId: string, input: AddressInput) =>
    run(async () => {
      await addressesApi.update(addressId, input)
      await refresh()
      setEditing(null)
    })

  const setPrimary = (addressId: string) =>
    run(async () => {
      await addressesApi.setPrimary(addressId)
      await refresh()
    })

  const remove = async () => {
    if (!confirmDelete) return
    const ok = await run(async () => {
      await addressesApi.remove(confirmDelete.id)
      await refresh()
    })
    if (ok) setConfirmDelete(null)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-body text-2xl font-semibold tracking-normal text-fg">
        Saved Addresses
      </h1>
      <p className="mt-1 text-sm text-muted">
        Your delivery addresses — pick one in a single tap at checkout. The
        primary address is suggested first.
      </p>

      <div className="mt-5 space-y-3">
        {addresses === null && !loadError && (
          <p className="py-10 text-center text-sm text-muted">
            Loading addresses…
          </p>
        )}
        {loadError && <ErrorNote>{loadError}</ErrorNote>}

        {addresses !== null && addresses.length === 0 && editing !== 'new' && (
          <div className="flex flex-col items-center rounded-lg border border-line bg-surface px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-brand/10 text-brand">
              <MapPinIcon className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-semibold text-fg">
              No saved addresses yet
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Add a delivery address once and reuse it at every checkout.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {(addresses ?? []).map((address) =>
            editing === address.id ? (
              <li key={address.id}>
                <AddressForm
                  initial={address}
                  busy={busy}
                  submitLabel="Save Changes"
                  onCancel={() => setEditing(null)}
                  onSubmit={(input) => void update(address.id, input)}
                />
              </li>
            ) : (
              <li
                key={address.id}
                className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                  <MapPinIcon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                    {address.name}
                    {address.label && (
                      <span className="rounded-pill bg-surface-alt px-2 py-0.5 text-[11px] font-semibold text-muted">
                        {address.label}
                      </span>
                    )}
                    {address.isPrimary && (
                      <span className="inline-flex items-center gap-1 rounded-pill bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                        <CheckIcon className="h-3 w-3" />
                        Primary
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {formatAddressLine(address)}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <PhoneCallIcon className="h-3 w-3" /> {address.phone}
                    </span>
                    {address.email && <span>{address.email}</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!address.isPrimary && (
                    <button
                      type="button"
                      onClick={() => void setPrimary(address.id)}
                      disabled={busy}
                      className="rounded-md px-2 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-alt hover:text-fg disabled:cursor-not-allowed"
                    >
                      Set primary
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing(address.id)}
                    disabled={busy}
                    aria-label="Edit address"
                    className="rounded-md p-1.5 text-muted transition hover:bg-surface-alt hover:text-fg disabled:cursor-not-allowed"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(address)}
                    disabled={busy}
                    aria-label="Delete address"
                    className="rounded-md p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>

        {editing === 'new' ? (
          <AddressForm
            busy={busy}
            submitLabel="Add Address"
            onCancel={() => setEditing(null)}
            onSubmit={(input) => void create(input)}
          />
        ) : (
          addresses !== null &&
          addresses.length < MAX_ADDRESSES && (
            <button
              type="button"
              onClick={() => setEditing('new')}
              disabled={busy}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
            >
              <PlusIcon className="h-4 w-4" />
              Add Address
            </button>
          )
        )}

        {actionError && <ErrorNote>{actionError}</ErrorNote>}
        {saved && !editing && <SuccessNote>Addresses updated.</SuccessNote>}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete this address?"
        description={`"${confirmDelete?.label || confirmDelete?.addressLine || ''}" will be removed from your address book.`}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
