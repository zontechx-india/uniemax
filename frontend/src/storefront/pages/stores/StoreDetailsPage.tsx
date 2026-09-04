import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { toApiError } from '../../../shared/auth/http'
import { ImageEditDialog } from '../../../shared/media/ImageEditDialog'
import {
  acceptAttr,
  ruleHint,
  useMediaConfig,
  validateImageSource,
} from '../../../shared/media/mediaConfig'
import { ErrorNote, SuccessNote, TextField } from '../../../shared/ui/form'
import { storesApi } from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { ImageIcon } from '../../layout/icons'

/**
 * Store Details section — name plus the store logo. The logo flow is
 * pick → validate (size/type per the server's media config) → crop (1:1)
 * → upload (WebP, with progress) to the dedicated logo bucket. The logo is
 * mandatory (set when the store is created), so it can only be replaced,
 * never removed. Business information, contact details,
 * address, and policies get their own sections in future updates.
 */
export function StoreDetailsPage() {
  const { store, onStoreChange } = useManagedStore()

  const [name, setName] = useState(store.name)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const dirty = name !== store.name

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Store name cannot be empty.')

    setError(null)
    setSaved(false)
    setBusy(true)
    try {
      const updated = await storesApi.update(store.id, { name: name.trim() })
      onStoreChange(updated)
      setSaved(true)
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
        Store Details
      </h2>
      <p className="mt-1 text-sm text-muted">
        The essentials shown to your customers. More settings (business
        info, contact, address, policies) are coming in future updates.
      </p>

      <form onSubmit={submit} className="mt-4 max-w-md space-y-5" noValidate>
        <TextField
          label="Store name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
        />

        <LogoField />

        {error && <ErrorNote>{error}</ErrorNote>}
        {saved && !dirty && <SuccessNote>Store details saved.</SuccessNote>}

        <button
          type="submit"
          disabled={busy || !dirty}
          className="h-11 rounded-md bg-brand-gradient px-6 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
        >
          {busy ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}

/**
 * Logo uploader — self-contained (uploads save immediately, independent of
 * the name form's Save button, because an upload is not a form field).
 */
function LogoField() {
  const { store, onStoreChange } = useManagedStore()
  const config = useMediaConfig()
  const inputRef = useRef<HTMLInputElement>(null)

  const [cropFile, setCropFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const uploading = progress !== null

  const pick = (file: File | undefined) => {
    if (!file || !config) return
    setError(null)
    const problem = validateImageSource(file, config.logo)
    if (problem) return setError(problem)
    setCropFile(file)
  }

  const upload = async (blob: Blob, filename: string) => {
    setProgress(0)
    try {
      onStoreChange(
        await storesApi.uploadLogo(store.id, blob, filename, setProgress),
      )
      setCropFile(null)
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setProgress(null)
    }
  }

  return (
    <div>
      <span className="mb-2 block text-sm font-medium text-muted">
        Store logo
      </span>
      <div className="flex items-center gap-4">
        {store.logoUrl ? (
          <img
            src={store.logoUrl}
            alt={`${store.name} logo`}
            className="h-20 w-20 shrink-0 rounded-md border border-line object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-line bg-surface-alt text-muted">
            <ImageIcon className="h-7 w-7" />
          </div>
        )}

        <div className="min-w-0">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || !config}
            className="h-9 rounded-md border border-line bg-surface px-3.5 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
          >
            {store.logoUrl ? 'Replace' : 'Upload Logo'}
          </button>
          <p className="mt-1.5 text-xs text-muted">
            {config ? `Square logo · ${ruleHint(config.logo)}` : 'Loading…'}
          </p>
          {uploading && (
            <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-pill bg-surface-alt">
              <div
                className="h-full rounded-pill bg-brand transition-[width]"
                style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={config ? acceptAttr(config.logo) : 'image/*'}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {error && (
        <div className="mt-2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {cropFile && (
        <ImageEditDialog
          file={cropFile}
          // A logo is shown in a square everywhere, so its frame stays fixed.
          aspects={[{ label: 'Square', value: 1 }]}
          allowOriginal={false}
          title="Crop your logo"
          confirmLabel="Use this logo"
          busy={uploading}
          onCancel={() => setCropFile(null)}
          onDone={upload}
        />
      )}
    </div>
  )
}
