import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { useGoBack } from '../../../shared/useGoBack'
import { storesApi } from '../../features/stores/storesApi'
import { ArrowLeftIcon, ImageIcon } from '../../layout/icons'

/**
 * Create Store — deliberately minimal to reduce friction, but a name AND a
 * logo are both required: a storefront without a mark looks unfinished, and
 * the API enforces the same rule. The logo is **staged locally** (validate →
 * crop 1:1, same pipeline as Store Details) and posted together with the name
 * in the single multipart create request, so a store is never left
 * half-created. Everything remains editable afterwards from Store Details.
 */
export function CreateStorePage() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Staged logo — cropped locally, sent with the create request.
  const config = useMediaConfig()
  const inputRef = useRef<HTMLInputElement>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [logo, setLogo] = useState<{ blob: Blob; filename: string } | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  // Revoke the previous preview URL on replace and on unmount.
  useEffect(
    () => () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview)
    },
    [logoPreview],
  )

  /**
   * This page is reached from several places (homepage "Sell on UnieMax" /
   * Become a Seller, the account menu, the My Stores list), so Back returns
   * to wherever the visitor actually came from. Fallback for a direct open
   * (no in-app history, e.g. straight after login): the marketplace home.
   */
  const goBack = useGoBack('/')

  const pick = (file: File | undefined) => {
    if (!file || !config) return
    setError(null)
    const problem = validateImageSource(file, config.logo)
    if (problem) return setError(problem)
    setCropFile(file)
  }

  const stageLogo = (blob: Blob, filename: string) => {
    setLogo({ blob, filename })
    setLogoPreview(URL.createObjectURL(blob))
    setCropFile(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Please enter a store name.')
    if (!logo) return setError('Please add a store logo.')

    setError(null)
    setBusy(true)
    try {
      const store = await storesApi.create(
        { name: name.trim() },
        logo.blob,
        logo.filename,
      )
      navigate(`/stores/${store.slug}`)
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <button
        type="button"
        onClick={goBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-fg"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back
      </button>

      <div className="mt-3 rounded-lg bg-surface p-5 shadow-floating sm:p-6">
        <h1 className="text-xl font-bold tracking-tight text-fg">
          Create Your Store
        </h1>
        <p className="mt-1 text-sm text-muted">
          A name and a logo to get started — you can customize everything else
          afterwards.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
          <TextField
            label="Store name *"
            placeholder="e.g. Anwin's Sports Hub"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
          />

          {/* Required — staged locally, sent with the create request. */}
          <div>
            <span className="mb-2 block text-sm font-medium text-muted">
              Store logo *
            </span>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Store logo preview"
                  className="h-20 w-20 shrink-0 rounded-md border border-line object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-line bg-surface-alt text-muted">
                  <ImageIcon className="h-7 w-7" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={busy || !config}
                    className="h-9 rounded-md border border-line bg-surface px-3.5 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
                  >
                    {logo ? 'Replace' : 'Choose Logo'}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {config
                    ? `Square logo · ${ruleHint(config.logo)}`
                    : 'Loading…'}
                </p>
              </div>
            </div>
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}

          <button
            type="submit"
            disabled={busy}
            className="h-12 w-full rounded-md bg-brand-gradient px-4 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
          >
            {busy ? 'Creating…' : 'Create Store'}
          </button>
        </form>
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

      {cropFile && (
        <ImageEditDialog
          file={cropFile}
          // A logo is shown in a square everywhere, so its frame stays fixed.
          aspects={[{ label: 'Square', value: 1 }]}
          allowOriginal={false}
          title="Crop your logo"
          confirmLabel="Use this logo"
          onCancel={() => setCropFile(null)}
          onDone={stageLogo}
        />
      )}
    </div>
  )
}
