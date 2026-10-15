import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Alert } from '../../../shared/ui/Alert'
import { adminApi } from '../../features/adminApi'
import type {
  WaCampaignStatus,
  WaField,
  WaHeaderMediaType,
  WaIntegrationStatus,
  WaMapping,
  WaStatus,
  WaTemplate,
} from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import {
  Button,
  Card,
  Chip,
  ErrorState,
  PageHeader,
  SelectInput,
  Skeleton,
  TextInput,
} from '../../ui/primitives'
import type { ChipTone } from '../../ui/primitives'
import { Tabs } from '../../ui/Toolbar'
import { formatRelative } from '../../ui/format'

/**
 * Pieces shared by the WhatsApp pages (Overview · Inbox · Campaigns ·
 * Audiences · Automations · Templates and the thread / campaign screens).
 *
 * Every page starts from the integration's STATUS, which the API serves even
 * while WhatsApp is switched off — so a console on an unconfigured server
 * explains why, instead of showing six tabs of 503 errors.
 */

// ---- Shell -------------------------------------------------------------------

const TABS = [
  { value: '/whatsapp', label: 'Overview' },
  { value: '/whatsapp/inbox', label: 'Inbox' },
  { value: '/whatsapp/campaigns', label: 'Campaigns' },
  { value: '/whatsapp/audiences', label: 'Audiences' },
  { value: '/whatsapp/automations', label: 'Automations' },
  { value: '/whatsapp/templates', label: 'Templates' },
]

export function useWhatsAppStatus() {
  return useAdminQuery(() => adminApi.whatsappStatus(), [])
}

/** Page title, environment banner and the tabs around a tab's content. */
export function WhatsAppShell({
  actions,
  children,
}: {
  actions?: ReactNode
  children: (status: WaIntegrationStatus) => ReactNode
}) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const status = useWhatsAppStatus()

  const tab =
    TABS.slice()
      .reverse()
      .find((t) => pathname.startsWith(t.value))?.value ?? '/whatsapp'

  if (status.error) return <ErrorState message={status.error} onRetry={status.refresh} />
  if (!status.data) return <Skeleton rows={8} />

  return (
    <>
      <PageHeader
        title="WhatsApp"
        subtitle="Marketing campaigns, automations and conversations on the business number"
        actions={status.data.enabled ? actions : null}
      />
      {status.data.enabled ? (
        <>
          <EnvironmentBanner status={status.data} />
          <Card padding="none">
            <Tabs value={tab} onChange={(value) => navigate(value)} options={TABS} />
            {children(status.data)}
          </Card>
        </>
      ) : (
        <Alert tone="warning" title="WhatsApp is not switched on for this server">
          Set <code className="font-mono">WA_ENABLED=true</code> and the WhatsApp credentials
          in this environment&apos;s backend env file, then restart the API. The setup steps
          are in <code className="font-mono">backend/README.md</code> → WhatsApp Cloud API.
        </Alert>
      )}
    </>
  )
}

/** Dev mode and "no webhook yet" are the two things that explain odd behaviour. */
function EnvironmentBanner({ status }: { status: WaIntegrationStatus }) {
  return (
    <div className="mb-4 space-y-3 empty:hidden">
      {status.production ? null : (
        <Alert tone="info" title="Test mode — sends only reach allowlisted numbers">
          {status.allowlist && status.allowlist.length > 0
            ? `Allowed: ${status.allowlist.map(formatWaId).join(', ')}. `
            : 'No numbers are allowlisted yet, so every send will be refused. '}
          Add numbers to <code className="font-mono">WA_DEV_ALLOWED_RECIPIENTS</code> to test
          with them.
        </Alert>
      )}
      {status.lastWebhookAt ? null : (
        <Alert tone="warning" title="No messages received yet">
          Meta has not delivered any webhook to this server, so replies and delivery
          ticks won&apos;t appear. Check the webhook URL and verify token in the Meta app.
        </Alert>
      )}
    </div>
  )
}

// ---- Formatting ------------------------------------------------------------

/** "919876543210" → "+91 98765 43210"; other countries keep a plain "+digits". */
export function formatWaId(waId: string): string {
  if (/^91\d{10}$/.test(waId)) return `+91 ${waId.slice(2, 7)} ${waId.slice(7)}`
  return `+${waId}`
}

export function contactLabel(contact: { name: string | null; waId: string }): string {
  return contact.name ?? formatWaId(contact.waId)
}

/** {{1}}, {{2}}… replaced by the values typed so far; blanks stay visible. */
export function fillTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, n: string) => {
    const value = params[Number(n) - 1]?.trim()
    return value ? value : match
  })
}

/** "Sent 3 hr ago" style relative time, lower-cased for mid-sentence use. */
export const ago = (at: string) => formatRelative(at).toLowerCase()

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`

// ---- Chips -------------------------------------------------------------------

const STATUS_META: Record<WaStatus, { label: string; tone: ChipTone }> = {
  accepted: { label: 'Queued', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'info' },
  read: { label: 'Read', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
}

export function waStatusLabel(status: WaStatus): string {
  return STATUS_META[status].label
}

export function WaStatusChip({ status }: { status: WaStatus | null }) {
  if (!status) return null
  const meta = STATUS_META[status] ?? { label: status, tone: 'neutral' as const }
  return <Chip tone={meta.tone}>{meta.label}</Chip>
}

/**
 * Free-form text is only allowed for 24h after the contact last wrote — the
 * chip says how long is left, because "open" alone hides that it is closing.
 */
export function WindowChip({ closesAt }: { closesAt: string | null }) {
  if (!closesAt) return null
  const hours = Math.max(0, (new Date(closesAt).getTime() - Date.now()) / 3_600_000)
  const left = hours >= 1 ? `${Math.floor(hours)}h left` : `${Math.max(1, Math.round(hours * 60))}m left`
  return <Chip tone="success">Reply window · {left}</Chip>
}

const CAMPAIGN_META: Record<WaCampaignStatus, { label: string; tone: ChipTone }> = {
  SCHEDULED: { label: 'Scheduled', tone: 'info' },
  SENDING: { label: 'Sending', tone: 'pending' },
  PAUSED: { label: 'Paused', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
}

export function CampaignStatusChip({ status }: { status: WaCampaignStatus }) {
  const meta = CAMPAIGN_META[status] ?? { label: status, tone: 'neutral' as const }
  return <Chip tone={meta.tone}>{meta.label}</Chip>
}

export function CategoryChip({ category }: { category: string | null }) {
  if (!category) return null
  return (
    <Chip tone={category === 'MARKETING' ? 'brand' : 'neutral'}>
      {category.charAt(0) + category.slice(1).toLowerCase()}
    </Chip>
  )
}

// ---- Failures ----------------------------------------------------------------

/**
 * Meta's error codes an operator actually meets, in words that say what to
 * do. Anything else falls back to Meta's own title, so an unknown code is
 * still explained — just less helpfully.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
const FAILURE_HINTS: Record<number, string> = {
  131042: 'No working payment method on the WhatsApp Business account — add or fix one in Meta Business Settings → Billing & payments.',
  131026: "This number can't receive the message — it may not be on WhatsApp, or is on an old app version.",
  131047: 'More than 24 hours since they last wrote — only a template can be sent now.',
  131049: 'WhatsApp held this marketing message back to limit how many the person gets. Try again later.',
  131050: 'This person has stopped marketing messages from your business.',
  131056: 'Too many messages to this number in a short time — wait before sending again.',
  132000: "The number of values doesn't match the template's {{1}}… variables.",
  132001: "The template doesn't exist in this language, or isn't approved.",
  131053: "WhatsApp couldn't download the media — check the image or video link is public.",
  190: 'The WhatsApp access token is invalid or expired (WA_ACCESS_TOKEN on the server).',
}

export function failureSummary(code: number | null, title: string | null): string {
  const hint = code !== null ? FAILURE_HINTS[code] : undefined
  return hint ?? title ?? 'WhatsApp did not say why'
}

/** Why a message failed, inside its bubble: plain words, Meta's code, Meta's detail. */
export function FailureReason({
  code,
  title,
  details,
}: {
  code: number | null
  title: string | null
  details: string | null
}) {
  // Meta often embeds the fix-it page in the detail ("Visit https://… to
  // resolve this issue") — lift it into a link rather than wrap a 200-char URL.
  const url = details?.match(/https:\/\/\S+?(?=[\s,)]|\.?\s|$)/)?.[0] ?? null
  const text = url
    ? details!.replace(url, '').replace(/\s*Visit\s+to resolve this issue\.?/i, '').trim()
    : details

  return (
    <div className="mt-2 border-t border-danger/25 pt-2 text-xs">
      <p className="font-medium text-danger">
        {failureSummary(code, title)}
        {code !== null ? <span className="font-normal text-muted"> · error {code}</span> : null}
      </p>
      {text && text !== title ? <p className="mt-1 break-words text-muted">{text}</p> : null}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-1 inline-block font-medium text-accent hover:underline"
        >
          Resolve in Meta ↗
        </a>
      ) : null}
    </div>
  )
}

// ---- Templates -------------------------------------------------------------

export const templateKey = (t: Pick<WaTemplate, 'name' | 'language'>) => `${t.name}|${t.language}`

export function useWaTemplates() {
  return useAdminQuery(() => adminApi.listWaTemplates(), [])
}

/** The fixed part of a link button's URL — what the value is appended to. */
export const urlPrefix = (url: string) => url.replace(/\{\{\s*\d+\s*\}\}.*$/, '')

/** A button whose template link ends in /api/v1/r/{{1}} can count clicks. */
export const isTrackingUrl = (url: string) => /\/api\/v1\/r\/\{\{/.test(url)

/** What a template needs filled, in words — "2 values · 1 link · image". */
export function templateNeeds(t: WaTemplate): string {
  const parts = [
    t.paramCount > 0 ? plural(t.paramCount, 'value') : null,
    t.urlButtons.length > 0 ? plural(t.urlButtons.length, 'link') : null,
    t.headerMedia,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'nothing to fill'
}

/**
 * Template choice. Only templates that can be sent are offered; the rest are
 * counted, with a pointer to the Templates tab that says why.
 */
export function TemplatePicker({
  templates,
  value,
  onChange,
  label = 'Template',
}: {
  templates: WaTemplate[]
  value: string
  onChange: (key: string) => void
  label?: string
}) {
  const sendable = templates.filter((t) => t.sendable)
  const hidden = templates.length - sendable.length

  if (sendable.length === 0) {
    return (
      <Alert tone="warning" title="No templates can be sent yet">
        {templates.length === 0
          ? 'Create a template in WhatsApp Manager and wait for Meta to approve it.'
          : `${plural(templates.length, 'template')} exist but none is approved yet — see the Templates tab.`}
      </Alert>
    )
  }

  return (
    <div className="space-y-1.5">
      <SelectInput
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        options={[
          { value: '', label: 'Choose a template…' },
          ...sendable.map((t) => ({
            value: templateKey(t),
            label: `${t.name} · ${t.language}${t.category ? ` · ${t.category.toLowerCase()}` : ''}`,
          })),
        ]}
      />
      {hidden > 0 ? (
        <p className="text-xs text-muted">
          {plural(hidden, 'more template')} can&apos;t be sent (pending, rejected or an
          unsupported format) — the Templates tab lists why.
        </p>
      ) : null}
    </div>
  )
}

// ---- Direct sends (one person, values typed) -----------------------------------

export interface DirectValues {
  params: string[]
  buttons: string[]
  headerLink: string
}

export const emptyDirectValues = (t: WaTemplate | null): DirectValues => ({
  params: Array.from({ length: t?.paramCount ?? 0 }, () => ''),
  buttons: Array.from({ length: t?.urlButtons.length ?? 0 }, () => ''),
  headerLink: '',
})

export function directValuesReady(t: WaTemplate | null, v: DirectValues): boolean {
  if (!t) return false
  return (
    v.params.length === t.paramCount &&
    v.params.every((p) => p.trim()) &&
    v.buttons.length === t.urlButtons.length &&
    v.buttons.every((b) => b.trim()) &&
    (!t.headerMedia || /^https?:\/\//.test(v.headerLink.trim()))
  )
}

export function directSendBody(to: string, t: WaTemplate, v: DirectValues) {
  return {
    to,
    templateName: t.name,
    languageCode: t.language,
    bodyParams: v.params.map((p) => p.trim()),
    buttonParams: v.buttons.map((b) => b.trim()),
    header: t.headerMedia ? { type: t.headerMedia, link: v.headerLink.trim() } : null,
  }
}

/** Every value a template needs for one message, with a live preview. */
export function DirectTemplateFields({
  template,
  values,
  onChange,
}: {
  template: WaTemplate
  values: DirectValues
  onChange: (values: DirectValues) => void
}) {
  // Re-shape when the template changes.
  useEffect(() => {
    if (
      values.params.length !== template.paramCount ||
      values.buttons.length !== template.urlButtons.length
    ) {
      onChange(emptyDirectValues(template))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reshape only when the template changes
  }, [template.name, template.language])

  return (
    <div className="space-y-3">
      {template.headerMedia ? (
        <MediaInput
          type={template.headerMedia}
          value={values.headerLink}
          onChange={(headerLink) => onChange({ ...values, headerLink })}
        />
      ) : null}
      {template.paramCount > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {values.params.map((param, index) => (
            <TextInput
              key={index}
              label={`Value for {{${index + 1}}}`}
              value={param}
              maxLength={1024}
              onChange={(event) => {
                const params = values.params.slice()
                params[index] = event.target.value
                onChange({ ...values, params })
              }}
            />
          ))}
        </div>
      ) : null}
      {template.urlButtons.map((button, index) => (
        <TextInput
          key={button.index}
          label={`“${button.text}” button link`}
          value={values.buttons[index] ?? ''}
          maxLength={2000}
          placeholder="the rest of the link"
          hint={`Goes after ${urlPrefix(button.url)}`}
          onChange={(event) => {
            const buttons = values.buttons.slice()
            buttons[index] = event.target.value
            onChange({ ...values, buttons })
          }}
        />
      ))}
      <TemplatePreview
        template={template}
        params={values.params}
        headerLink={values.headerLink}
      />
    </div>
  )
}

// ---- Media -----------------------------------------------------------------------

const MEDIA_ACCEPT: Record<WaHeaderMediaType, string> = {
  image: 'image/jpeg,image/png',
  video: 'video/mp4',
  document: '',
}

/**
 * A media link: paste one, or upload a JPEG/PNG/MP4 to the platform's media
 * bucket and use its public URL. WhatsApp fetches it from there, so it has
 * to be publicly reachable.
 */
export function MediaInput({
  type,
  value,
  onChange,
  label,
}: {
  type: WaHeaderMediaType
  value: string
  onChange: (link: string) => void
  label?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canUpload = type !== 'document'

  const upload = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setProgress(0)
    try {
      const result = await adminApi.uploadWaMedia(file, file.name, setProgress)
      if (result.type !== type) {
        setError(`That is a ${result.type} — this needs a ${type}`)
        return
      }
      onChange(result.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <TextInput
            label={label ?? `Header ${type}`}
            value={value}
            inputMode="url"
            placeholder="https://…"
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
        {canUpload ? (
          <>
            <Button
              disabled={progress !== null}
              onClick={() => fileRef.current?.click()}
              className="mb-px"
            >
              {progress !== null ? `Uploading ${Math.round(progress * 100)}%` : `Upload ${type}`}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept={MEDIA_ACCEPT[type]}
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                void upload(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </>
        ) : null}
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {type === 'image' && /^https?:\/\//.test(value) ? (
        <img
          src={value}
          alt="Header preview"
          className="h-24 w-auto rounded-md border border-line object-cover"
        />
      ) : null}
    </div>
  )
}

// ---- Mappings (many people, values from their fields) ------------------------------

export function useWaFields() {
  return useAdminQuery(() => adminApi.waFields(), [])
}

/** A blank mapping shaped for a template. */
export function defaultMapping(t: WaTemplate): WaMapping {
  return {
    body: Array.from({ length: t.paramCount }, () => ({ value: '' })),
    buttons: t.urlButtons.map((b) => ({ value: '', track: isTrackingUrl(b.url) })),
    header: t.headerMedia ? { type: t.headerMedia, link: '' } : null,
  }
}

/** Why the mapping can't be used yet, or null. */
export function mappingProblem(t: WaTemplate, m: WaMapping): string | null {
  if (m.body.length !== t.paramCount || m.buttons.length !== t.urlButtons.length) {
    return 'The values don’t match this template'
  }
  const blank = m.body.findIndex((s) => !s.value.trim())
  if (blank >= 0) return `Fill in {{${blank + 1}}}`
  const blankButton = m.buttons.findIndex((s) => !s.value.trim())
  if (blankButton >= 0) return `Fill in the “${t.urlButtons[blankButton]?.text}” button link`
  if (t.headerMedia && !/^https?:\/\//.test(m.header?.link.trim() ?? '')) {
    return `Add the header ${t.headerMedia}`
  }
  return null
}

/** Clean copy for the API — trimmed, empty fallbacks dropped. */
export function cleanMapping(m: WaMapping): WaMapping {
  return {
    body: m.body.map((s) => ({
      value: s.value.trim(),
      ...(s.fallback?.trim() ? { fallback: s.fallback.trim() } : {}),
    })),
    buttons: m.buttons.map((s) => ({
      value: s.value.trim(),
      track: s.track,
      ...(s.fallback?.trim() ? { fallback: s.fallback.trim() } : {}),
    })),
    header: m.header ? { type: m.header.type, link: m.header.link.trim() } : null,
  }
}

/** Fill {field} placeholders with example values — the preview before a real person. */
export function exampleFill(text: string, fields: WaField[]): string {
  return text.replace(/\{([a-z_]+)\}/g, (match, key: string) => {
    const field = fields.find((f) => f.key === key)
    return field ? field.example : match
  })
}

/**
 * Per slot: what goes in, from the recipient's fields. Field chips insert a
 * {field} at the end of the value; the fallback covers an empty field (blank
 * fallback = that person is skipped instead).
 */
export function MappingEditor({
  template,
  mapping,
  onChange,
  fields,
  allowTracking,
}: {
  template: WaTemplate
  mapping: WaMapping
  onChange: (mapping: WaMapping) => void
  fields: WaField[]
  /** Campaigns can count clicks; automations send links straight through. */
  allowTracking: boolean
}) {
  const setBody = (index: number, patch: Partial<WaMapping['body'][number]>) => {
    const body = mapping.body.slice()
    body[index] = { ...body[index]!, ...patch }
    onChange({ ...mapping, body })
  }
  const setButton = (index: number, patch: Partial<WaMapping['buttons'][number]>) => {
    const buttons = mapping.buttons.slice()
    buttons[index] = { ...buttons[index]!, ...patch }
    onChange({ ...mapping, buttons })
  }

  return (
    <div className="space-y-5">
      {template.headerMedia && mapping.header ? (
        <MediaInput
          type={template.headerMedia}
          value={mapping.header.link}
          onChange={(link) => onChange({ ...mapping, header: { type: template.headerMedia!, link } })}
        />
      ) : null}

      {mapping.body.map((slot, index) => (
        <SlotFields
          key={`b${index}`}
          title={`{{${index + 1}}}`}
          value={slot.value}
          fallback={slot.fallback ?? ''}
          fields={fields}
          placeholder="Text, or tap a field below"
          onValue={(value) => setBody(index, { value })}
          onFallback={(fallback) => setBody(index, { fallback })}
        />
      ))}

      {mapping.buttons.map((slot, index) => {
        const button = template.urlButtons[index]!
        const trackable = allowTracking && isTrackingUrl(button.url)
        return (
          <div key={`u${index}`} className="space-y-2">
            <SlotFields
              title={`“${button.text}” button`}
              value={slot.value}
              fallback={slot.fallback ?? ''}
              fields={fields}
              placeholder={slot.track ? 'https://uniemax.com/…' : 'the rest of the link'}
              hint={
                slot.track
                  ? 'Where the button takes them — the click is counted on the way'
                  : `Goes after ${urlPrefix(button.url)}`
              }
              onValue={(value) => setButton(index, { value })}
              onFallback={(fallback) => setButton(index, { fallback })}
            />
            {trackable ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={slot.track}
                  onChange={(event) => setButton(index, { track: event.target.checked })}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                Count clicks on this button
              </label>
            ) : null}
          </div>
        )
      })}

      {template.paramCount === 0 && template.urlButtons.length === 0 && !template.headerMedia ? (
        <p className="text-sm text-muted">This template has nothing to fill — it is sent as is.</p>
      ) : null}
    </div>
  )
}

function SlotFields({
  title,
  value,
  fallback,
  fields,
  placeholder,
  hint,
  onValue,
  onFallback,
}: {
  title: string
  value: string
  fallback: string
  fields: WaField[]
  placeholder: string
  hint?: string
  onValue: (value: string) => void
  onFallback: (value: string) => void
}) {
  const usesField = /\{[a-z_]+\}/.test(value)
  return (
    <fieldset className="space-y-2 rounded-lg border border-line p-3">
      <legend className="px-1 text-sm font-medium text-fg">{title}</legend>
      <TextInput
        aria-label={`${title} value`}
        value={value}
        maxLength={1024}
        placeholder={placeholder}
        {...(hint ? { hint } : {})}
        onChange={(event) => onValue(event.target.value)}
      />
      {fields.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Insert a field">
          {fields.map((field) => (
            <Button
              key={field.key}
              variant="ghost"
              title={`e.g. ${field.example}`}
              onClick={() => onValue(`${value}{${field.key}}`)}
            >
              + {field.label}
            </Button>
          ))}
        </div>
      ) : null}
      {usesField ? (
        <TextInput
          label="If a field is empty, use"
          value={fallback}
          maxLength={1024}
          placeholder="Leave blank to skip that person"
          onChange={(event) => onFallback(event.target.value)}
        />
      ) : null}
    </fieldset>
  )
}

/** The message as it will look — header, body with values, footer, buttons. */
export function TemplatePreview({
  template,
  params,
  headerLink,
  buttonLinks,
}: {
  template: WaTemplate
  params: string[]
  headerLink?: string
  /** Full button URLs, when known (campaign sample). */
  buttonLinks?: string[]
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-alt p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Preview</p>
      <div className="rounded-md bg-surface p-3 text-sm text-fg">
        {template.headerMedia ? (
          template.headerMedia === 'image' && headerLink && /^https?:\/\//.test(headerLink) ? (
            <img
              src={headerLink}
              alt=""
              className="mb-2 max-h-40 w-full rounded-md object-cover"
            />
          ) : (
            <p className="mb-2 rounded-md border border-dashed border-line py-6 text-center text-xs text-muted">
              {template.headerMedia} header
            </p>
          )
        ) : null}
        {template.header ? <p className="mb-1 font-semibold">{template.header}</p> : null}
        <p className="whitespace-pre-wrap break-words">{fillTemplate(template.body, params)}</p>
        {template.footer ? <p className="mt-2 text-xs text-muted">{template.footer}</p> : null}
        {template.buttons.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2">
            {template.buttons.map((label) => (
              <span key={label} className="text-sm font-medium text-accent">
                {label}
              </span>
            ))}
          </div>
        ) : null}
        {buttonLinks && buttonLinks.length > 0 ? (
          <ul className="mt-2 space-y-0.5">
            {buttonLinks.map((link) => (
              <li key={link} className="truncate font-mono text-xs text-muted">
                {link}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

// ---- Misc --------------------------------------------------------------------

/** Re-runs `refresh` every `ms` while `active` — threads and running campaigns. */
export function usePolling(refresh: () => void, ms: number, active = true) {
  useEffect(() => {
    if (!active) return
    const timer = setInterval(refresh, ms)
    return () => clearInterval(timer)
  }, [refresh, ms, active])
}

export function LastSeen({ at }: { at: string | null }) {
  return <span className="whitespace-nowrap text-sm text-muted">{at ? formatRelative(at) : '—'}</span>
}

/** Save a Blob as a download — CSV exports. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
