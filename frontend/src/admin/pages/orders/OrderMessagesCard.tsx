import { useEffect, useState } from 'react'
import { adminApi } from '../../features/adminApi'
import type { OrderMessageChannel, OrderMessagePreview, OrderMessages } from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import { Dialog } from '../../../shared/ui/Dialog'
import { Button, Card, CardHeader, Chip, ErrorState, Skeleton } from '../../ui/primitives'
import { WA_TEMPLATE_DOCS } from '../docs/whatsappTemplateDocs'

/**
 * Send an order's email or WhatsApp message again, by hand — for when the
 * first one never arrived or the customer asks for it.
 *
 * The text and the recipient are the automatic send's own (the server builds
 * them); nothing here is typed. A message can only go out once the order has
 * reached its stage, and every send first shows EXACTLY what will go out —
 * the email as the recipient sees it, the WhatsApp message with its values
 * filled in — with "Send now" under it.
 */

type Message = OrderMessages['messages'][number]

interface Pending {
  message: Message
  channel: OrderMessageChannel
}

const CHANNEL_LABEL: Record<OrderMessageChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
}

/** 919876543210 → +919876543210; an email is shown as it is. */
const showRecipient = (channel: OrderMessageChannel, to: string) =>
  channel === 'whatsapp' ? `+${to}` : to

export function OrderMessagesCard({ orderId }: { orderId: string }) {
  const { data, loading, error, refresh } = useAdminQuery(
    () => adminApi.listOrderMessages(orderId),
    [orderId],
  )
  const [pending, setPending] = useState<Pending | null>(null)
  const [result, setResult] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader
        title="Send messages"
        subtitle="Sends the same message again. The order itself is not changed."
      />
      {error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : !data || loading ? (
        <Skeleton rows={4} />
      ) : (
        <>
          {!data.whatsappEnabled ? (
            <p className="mb-3 text-xs text-muted">
              WhatsApp is switched off on this server, so only email can be sent.
            </p>
          ) : null}
          {!data.emailDelivered ? (
            <p className="mb-3 text-xs text-warning">
              Email is not set up on this server (no RESEND_API_KEY) — emails are printed to the
              server log, not delivered.
            </p>
          ) : null}
          {result ? (
            <p
              role="status"
              className="mb-3 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-fg"
            >
              {result}
            </p>
          ) : null}
          <ul className="divide-y divide-line">
            {data.messages.map((message) => (
              <li key={message.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${message.reached ? 'text-fg' : 'text-muted'}`}>
                    {message.label}
                  </p>
                  <p className="text-xs text-muted">
                    To {message.audience}
                    {message.reached ? '' : ' · stage not reached'}
                  </p>
                </div>
                {message.reached ? (
                  <div className="flex gap-2">
                    {message.whatsapp ? (
                      <SendButton
                        channel="whatsapp"
                        to={data.whatsappEnabled ? message.whatsapp.to : null}
                        missing={data.whatsappEnabled ? 'No usable phone number' : 'WhatsApp is off'}
                        onPick={() => setPending({ message, channel: 'whatsapp' })}
                      />
                    ) : null}
                    <SendButton
                      channel="email"
                      to={message.email.to}
                      missing="No email address"
                      onPick={() => setPending({ message, channel: 'email' })}
                    />
                  </div>
                ) : (
                  <Chip>Not reached</Chip>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {pending ? (
        <SendPreviewDialog
          orderId={orderId}
          pending={pending}
          onClose={() => setPending(null)}
          onSent={(text) => {
            setResult(text)
            setPending(null)
          }}
        />
      ) : null}
    </Card>
  )
}

/**
 * The message exactly as it will go out, fetched from the server (which
 * builds it with the same code that sends it), and the button that sends it.
 */
function SendPreviewDialog({
  orderId,
  pending,
  onClose,
  onSent,
}: {
  orderId: string
  pending: Pending
  onClose: () => void
  onSent: (result: string) => void
}) {
  const { message, channel } = pending
  const [preview, setPreview] = useState<OrderMessagePreview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    adminApi
      .previewOrderMessage(orderId, { message: message.key, channel })
      .then((value) => {
        if (live) setPreview(value)
      })
      .catch((err: unknown) => {
        if (live) setLoadError(err instanceof Error ? err.message : 'Could not load the message')
      })
    return () => {
      live = false
    }
  }, [orderId, message.key, channel])

  const to = preview?.email?.to ?? preview?.whatsapp?.to ?? null

  async function send() {
    setBusy(true)
    setSendError(null)
    try {
      const sent = await adminApi.sendOrderMessage(orderId, { message: message.key, channel })
      onSent(
        `${message.label} sent by ${CHANNEL_LABEL[channel]} to ${showRecipient(channel, sent.to)}.`,
      )
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send the message')
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      size="lg"
      title={`${message.label} · ${CHANNEL_LABEL[channel]}`}
      subtitle={
        to ? (
          <>
            To the {message.audience}: <span className="font-medium text-fg">{showRecipient(channel, to)}</span>
          </>
        ) : (
          `To the ${message.audience}`
        )
      }
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <>
          {sendError ? <p className="mr-auto text-sm text-danger">{sendError}</p> : null}
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !preview || !to} onClick={() => void send()}>
            {busy ? 'Sending…' : 'Send now'}
          </Button>
        </>
      }
    >
      {loadError ? (
        <p className="text-sm text-danger">{loadError}</p>
      ) : !preview ? (
        <Skeleton rows={6} />
      ) : preview.email ? (
        <EmailPreview email={preview.email} />
      ) : preview.whatsapp ? (
        <WhatsAppPreview whatsapp={preview.whatsapp} />
      ) : null}
    </Dialog>
  )
}

export function EmailPreview({ email }: { email: NonNullable<OrderMessagePreview['email']> }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Subject: <span className="font-medium text-fg">{email.subject}</span>
      </p>
      {/* The email's own HTML, as the recipient's mail app draws it. `sandbox`
          with no permissions: no scripts, no navigation, no forms. Always on
          white — emails are designed for it, whatever the console's theme. */}
      <iframe
        title="Email preview"
        sandbox=""
        srcDoc={email.html}
        className="h-80 w-full rounded-md border border-line bg-white"
      />
      <details className="text-sm">
        <summary className="cursor-pointer text-muted hover:text-fg">Plain-text version</summary>
        <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-line bg-surface-alt p-3 font-mono text-xs text-fg">
          {email.text}
        </pre>
      </details>
      {!email.delivered ? (
        <p className="text-xs text-warning">
          This server has no email provider — the email will be printed to the server log, not
          delivered.
        </p>
      ) : null}
    </div>
  )
}

export function WhatsAppPreview({ whatsapp }: { whatsapp: NonNullable<OrderMessagePreview['whatsapp']> }) {
  // Meta's approved text when the server could reach it; otherwise the copy
  // in Documents → WhatsApp templates, filled with the same values.
  const doc = WA_TEMPLATE_DOCS.find((d) => d.name === whatsapp.templateName)
  const fill = (text: string) =>
    text.replace(/\{\{(\d+)\}\}/g, (match, n: string) => whatsapp.bodyParams[Number(n) - 1] ?? match)
  const body = whatsapp.body ?? (doc ? fill(doc.body) : null)
  const header = whatsapp.body !== null ? whatsapp.header : (doc?.header ?? null)
  const footer = whatsapp.body !== null ? whatsapp.footer : (doc?.footer ?? null)
  const buttons = whatsapp.body !== null ? whatsapp.buttons : doc?.button ? [doc.button.label] : []

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Template: <span className="font-mono text-fg">{whatsapp.templateName}</span> ·{' '}
        {whatsapp.language}
      </p>
      <div className="rounded-lg border border-line bg-surface-alt p-3">
        <div className="max-w-md rounded-md bg-surface p-3 text-sm text-fg">
          {header ? <p className="mb-1 font-semibold">{header}</p> : null}
          {body ? (
            <p className="whitespace-pre-wrap break-words">{body}</p>
          ) : (
            <p className="text-muted">The template text is not available here.</p>
          )}
          {footer ? <p className="mt-2 text-xs text-muted">{footer}</p> : null}
          {buttons.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2">
              {buttons.map((label) => (
                <span key={label} className="text-sm font-medium text-accent">
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {whatsapp.body === null && body ? (
        <p className="text-xs text-muted">
          Text from Documents → WhatsApp templates — Meta&apos;s template list isn&apos;t reachable
          from this server. The values are the real ones.
        </p>
      ) : null}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted hover:text-fg">
          Values sent ({whatsapp.bodyParams.length})
        </summary>
        <ol className="mt-2 space-y-1">
          {whatsapp.bodyParams.map((value, i) => (
            <li key={i} className="flex gap-2 text-xs">
              <span className="w-10 shrink-0 font-mono text-accent">{`{{${i + 1}}}`}</span>
              <span className="break-all text-fg">{value}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  )
}

/** One channel's button. Without a recipient it stays disabled and says why. */
function SendButton({
  channel,
  to,
  missing,
  onPick,
}: {
  channel: OrderMessageChannel
  to: string | null
  missing: string
  onPick: () => void
}) {
  return (
    <Button disabled={!to} title={to ? undefined : missing} onClick={onPick}>
      {CHANNEL_LABEL[channel]}
    </Button>
  )
}
