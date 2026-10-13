import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Alert } from '../../../shared/ui/Alert'
import { adminApi } from '../../features/adminApi'
import type { WaIntegrationStatus, WaStatus, WaTemplate } from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import { Card, Chip, ErrorState, PageHeader, SelectInput, Skeleton, TextInput } from '../../ui/primitives'
import type { ChipTone } from '../../ui/primitives'
import { Tabs } from '../../ui/Toolbar'
import { formatRelative } from '../../ui/format'

/**
 * Pieces shared by the WhatsApp pages (Inbox · Campaigns · Templates and the
 * thread / campaign detail screens).
 *
 * Every page starts from the integration's STATUS, which the API serves even
 * while WhatsApp is switched off — so a console on an unconfigured server
 * explains why, instead of showing three tabs of 503 errors.
 */

// ---- Shell -------------------------------------------------------------------

const TABS = [
  { value: '/whatsapp', label: 'Inbox' },
  { value: '/whatsapp/campaigns', label: 'Campaigns' },
  { value: '/whatsapp/templates', label: 'Templates' },
]

export function useWhatsAppStatus() {
  return useAdminQuery(() => adminApi.whatsappStatus(), [])
}

/** Page title, environment banner and the three tabs around a tab's content. */
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
        subtitle="Conversations, template messages and campaigns on the business number"
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
    <div className="mb-4 space-y-3">
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

export function CampaignStateChip({ finishedAt }: { finishedAt: string | null }) {
  return finishedAt ? <Chip tone="success">Finished</Chip> : <Chip tone="pending">Sending</Chip>
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

/**
 * Template choice + (optionally) its {{n}} values, with a live preview of
 * the message as the recipient will read it.
 *
 * Only templates the send endpoints can fill are offered; the rest are
 * counted, with a pointer to the Templates tab that says why. `withParams =
 * false` is the campaign form, where the values come per recipient instead.
 */
export function TemplateFields({
  templates,
  value,
  onChange,
  params,
  onParamsChange,
  withParams = true,
  previewParams,
}: {
  templates: WaTemplate[]
  value: string
  onChange: (key: string) => void
  params: string[]
  onParamsChange: (params: string[]) => void
  withParams?: boolean
  /** Values to preview with when the form has no inputs (a campaign's first recipient). */
  previewParams?: string[]
}) {
  const sendable = templates.filter((t) => t.sendable)
  const hidden = templates.length - sendable.length
  const selected = sendable.find((t) => templateKey(t) === value) ?? null

  // Keep the value array as long as the chosen template needs.
  useEffect(() => {
    if (selected && params.length !== selected.paramCount) {
      onParamsChange(Array.from({ length: selected.paramCount }, (_, i) => params[i] ?? ''))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resize only when the template changes
  }, [selected?.name, selected?.language])

  if (sendable.length === 0) {
    return (
      <Alert tone="warning" title="No templates can be sent yet">
        {templates.length === 0
          ? 'Create a template in WhatsApp Manager and wait for Meta to approve it.'
          : `${templates.length} template${templates.length === 1 ? '' : 's'} exist but none is approved with simple {{1}} variables — see the Templates tab.`}
      </Alert>
    )
  }

  return (
    <div className="space-y-3">
      <SelectInput
        label="Template"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        options={[
          { value: '', label: 'Choose a template…' },
          ...sendable.map((t) => ({
            value: templateKey(t),
            label: `${t.name} · ${t.language}${t.paramCount ? ` · ${t.paramCount} value${t.paramCount === 1 ? '' : 's'}` : ''}`,
          })),
        ]}
      />
      {hidden > 0 ? (
        <p className="text-xs text-muted">
          {hidden} more template{hidden === 1 ? '' : 's'} can&apos;t be sent from here (pending,
          media headers or named variables) — the Templates tab lists why.
        </p>
      ) : null}

      {selected ? (
        <>
          {withParams && selected.paramCount > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {params.map((param, index) => (
                <TextInput
                  key={index}
                  label={`Value for {{${index + 1}}}`}
                  value={param}
                  maxLength={1024}
                  onChange={(event) => {
                    const next = params.slice()
                    next[index] = event.target.value
                    onParamsChange(next)
                  }}
                />
              ))}
            </div>
          ) : null}
          <TemplatePreview template={selected} params={withParams ? params : (previewParams ?? [])} />
        </>
      ) : null}
    </div>
  )
}

/** The message as it will look — header, body with values, footer, buttons. */
export function TemplatePreview({ template, params }: { template: WaTemplate; params: string[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface-alt p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Preview</p>
      <div className="rounded-md bg-surface p-3 text-sm text-fg">
        {template.header ? <p className="mb-1 font-semibold">{template.header}</p> : null}
        <p className="whitespace-pre-wrap">{fillTemplate(template.body, params)}</p>
        {template.footer ? <p className="mt-2 text-xs text-muted">{template.footer}</p> : null}
        {template.buttons.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-2">
            {template.buttons.map((label) => (
              <span key={label} className="text-sm font-medium text-accent">
                {label}
              </span>
            ))}
          </div>
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
