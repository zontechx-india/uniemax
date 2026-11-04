import { useState } from 'react'
import { adminApi } from '../../features/adminApi'
import type { OrderMessageChannel, OrderMessages } from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Button, Card, CardHeader, Chip, ErrorState, Skeleton } from '../../ui/primitives'

/**
 * Send an order's email or WhatsApp message again, by hand — for when the
 * first one never arrived or the customer asks for it.
 *
 * The text and the recipient are the automatic send's own (the server builds
 * them); nothing here is typed. A message can only go out once the order has
 * reached its stage, and every send asks first, naming who receives it.
 */

type Message = OrderMessages['messages'][number]

interface Pending {
  message: Message
  channel: OrderMessageChannel
  to: string
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
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  async function send() {
    if (!pending) return
    setBusy(true)
    setSendError(null)
    try {
      const sent = await adminApi.sendOrderMessage(orderId, {
        message: pending.message.key,
        channel: pending.channel,
      })
      setResult(
        `${pending.message.label} sent by ${CHANNEL_LABEL[pending.channel]} to ${showRecipient(
          pending.channel,
          sent.to,
        )}.`,
      )
      setPending(null)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send the message')
    } finally {
      setBusy(false)
    }
  }

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
            <p role="status" className="mb-3 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-fg">
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
                        onPick={(to) => {
                          setSendError(null)
                          setPending({ message, channel: 'whatsapp', to })
                        }}
                      />
                    ) : null}
                    <SendButton
                      channel="email"
                      to={message.email.to}
                      missing="No email address"
                      onPick={(to) => {
                        setSendError(null)
                        setPending({ message, channel: 'email', to })
                      }}
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

      <ConfirmDialog
        open={pending !== null}
        busy={busy}
        tone="neutral"
        title={pending ? `Send "${pending.message.label}" by ${CHANNEL_LABEL[pending.channel]}?` : ''}
        confirmLabel="Send now"
        description={
          pending ? (
            <div className="space-y-2">
              <p>
                The {pending.message.audience} gets this message again, at{' '}
                <strong className="font-medium text-fg">
                  {showRecipient(pending.channel, pending.to)}
                </strong>
                .
              </p>
              {pending.channel === 'whatsapp' && pending.message.whatsapp?.templateName ? (
                <p className="text-xs text-muted">
                  Template: <span className="font-mono">{pending.message.whatsapp.templateName}</span>
                </p>
              ) : null}
              {sendError ? <p className="text-sm text-danger">{sendError}</p> : null}
            </div>
          ) : null
        }
        onCancel={() => setPending(null)}
        onConfirm={() => void send()}
      />
    </Card>
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
  onPick: (to: string) => void
}) {
  return (
    <Button
      disabled={!to}
      title={to ? undefined : missing}
      onClick={() => {
        if (to) onPick(to)
      }}
    >
      {CHANNEL_LABEL[channel]}
    </Button>
  )
}
