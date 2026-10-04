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
import { ErrorNote, TextField } from '../../../shared/ui/form'
import { buttonClass } from '../../../shared/ui/Button'
import { storesApi } from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { ImageIcon, StoreIcon } from '../../layout/icons'
import { MediaImg } from '../../../shared/media/MediaImg'
import { GlassCard } from './ui/GlassCard'
import { PageHeader } from './ui/PageHeader'
import { SaveBar } from './ui/SaveBar'
import { showToast } from './ui/Toast'

/**
 * Store Details section — the shop's name and logo, as customers see them.
 *
 * The logo flow is pick → validate (size/type per the server's media config)
 * → crop (1:1) → upload (WebP, with progress) to the dedicated logo bucket.
 * The logo is mandatory (set when the store is created), so it can only be
 * replaced, never removed — and it saves the moment it is uploaded. The name
 * uses the shared SaveBar: it appears only once the name changes.
 */
export function StoreDetailsPage() {
  const { store, onStoreChange } = useManagedStore()

  const [name, setName] = useState(store.name)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const dirty = name.trim() !== store.name

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Your shop needs a name.')

    setError(null)
    setBusy(true)
    try {
      const updated = await storesApi.update(store.id, { name: name.trim() })
      onStoreChange(updated)
      setName(updated.name)
      showToast('Shop name saved')
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={StoreIcon}
        title="Shop name & logo"
        description="How your shop looks to customers. Your contact and address details are in Business Details."
      />

      <LogoField />

      <form onSubmit={submit} noValidate>
        <GlassCard title="Shop name">
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            hint="Changing the name does not change your shop link."
            error={error ?? undefined}
          />
        </GlassCard>
        <SaveBar
          dirty={dirty}
          saving={busy}
          onDiscard={() => {
            setName(store.name)
            setError(null)
          }}
        />
      </form>
    </div>
  )
}

/**
 * Logo uploader — self-contained (uploads save immediately, independent of
 * the name form, because an upload is not a form field).
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
      onStoreChange(await storesApi.uploadLogo(store.id, blob, filename, setProgress))
      setCropFile(null)
      showToast('New logo saved')
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setProgress(null)
    }
  }

  return (
    <GlassCard title="Logo" description="A small square picture for your shop.">
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        {store.logoUrl ? (
          <MediaImg
            sizes="112px"
            src={store.logoUrl}
            alt={`${store.name} logo`}
            className="h-28 w-28 shrink-0 rounded-3xl border border-line object-cover shadow-[0_10px_28px_-12px_rgba(0,0,0,0.35)]"
          />
        ) : (
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-3xl border-2 border-dashed border-line bg-fg/5 text-muted">
            <ImageIcon className="h-9 w-9" />
          </div>
        )}

        <div className="w-full min-w-0 text-center sm:w-auto sm:text-left">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || !config}
            className={buttonClass({ variant: 'ring', size: 'lg', className: 'w-full px-6 sm:w-auto' })}
          >
            <ImageIcon className="h-5 w-5" />
            {store.logoUrl ? 'Change logo' : 'Add a logo'}
          </button>
          <p className="mt-2 text-hint text-muted">
            {config ? `A square photo works best · ${ruleHint(config.logo)}` : 'Loading…'}
          </p>
          {uploading && (
            <div className="mx-auto mt-2 h-2 w-48 overflow-hidden rounded-pill bg-fg/10 sm:mx-0">
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
        <div className="mt-3">
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
    </GlassCard>
  )
}
