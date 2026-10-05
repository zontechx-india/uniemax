import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../features/adminApi'
import { useAdminQuery } from '../features/useAdminQuery'
import { notificationsApi } from '../../shared/notifications/notificationsApi'
import { usePushSubscription } from '../../shared/push/usePushSubscription'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import {
  Button,
  Card,
  CardHeader,
  Chip,
  PageHeader,
  SelectInput,
  Skeleton,
  TextArea,
  TextInput,
} from '../ui/primitives'
import { formatDateTime, formatRelative } from '../ui/format'

/**
 * Notifications: this admin's own feed, their device subscriptions, and the
 * platform broadcast.
 *
 * **Why push is opt-in per device, not per account:** a Web Push subscription
 * belongs to one browser on one machine. Asking on the device where the admin
 * actually wants alerts — from a button they pressed, never on page load —
 * is both the browsers' requirement and the honest model.
 */

const api = notificationsApi('admin')

const PUSH_COPY: Record<string, { label: string; hint: string }> = {
  checking: { label: 'Checking…', hint: '' },
  unsupported: {
    label: 'Not supported',
    hint: 'This browser has no Push API. Try Chrome, Edge or Firefox on desktop, or add the site to your home screen on iOS.',
  },
  unconfigured: {
    label: 'Not configured',
    hint: 'The server has no VAPID keys. Run `npm run push-keys` in backend/ and add them to .env — see docs/PUSH_NOTIFICATIONS.md.',
  },
  denied: {
    label: 'Blocked',
    hint: 'Notifications are blocked for this site. Re-allow them in your browser’s site settings — a page cannot undo it.',
  },
  off: { label: 'Off', hint: 'Get alerted about new orders and platform events on this device.' },
  on: { label: 'On', hint: 'This device receives push notifications.' },
}

const AUDIENCES = [
  { value: 'SELLERS', label: 'Sellers (store owners)' },
  { value: 'CUSTOMERS', label: 'All customers' },
  { value: 'ADMINS', label: 'Admins only' },
]

export default function NotificationsPage() {
  const navigate = useNavigate()
  const feed = useAdminQuery(() => api.list({ pageSize: 30 }), [])
  const push = usePushSubscription(api)

  const [audience, setAudience] = useState('SELLERS')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canBroadcast = title.trim().length >= 3 && body.trim().length >= 3

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      const { recipients } = await adminApi.broadcast({
        audience: audience as 'ADMINS' | 'CUSTOMERS' | 'SELLERS',
        title: title.trim(),
        body: body.trim(),
        url: url.trim() || null,
      })
      setResult(`Sent to ${recipients.toLocaleString('en-IN')} recipient${recipients === 1 ? '' : 's'}.`)
      setTitle('')
      setBody('')
      setUrl('')
      setConfirmOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the announcement')
      setConfirmOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const pushCopy = PUSH_COPY[push.state]!

  return (
    <>
      <PageHeader title="Notifications" subtitle="Your feed, your devices, and platform announcements" />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Push on this device"
              action={
                <Chip tone={push.state === 'on' ? 'success' : push.state === 'denied' ? 'danger' : 'neutral'}>
                  {pushCopy.label}
                </Chip>
              }
            />
            <p className="text-sm text-muted">{pushCopy.hint}</p>
            {push.error ? <p className="mt-2 text-sm text-danger">{push.error}</p> : null}
            {push.state === 'off' || push.state === 'on' ? (
              <div className="mt-3">
                <Button
                  variant={push.state === 'on' ? 'secondary' : 'primary'}
                  disabled={push.busy}
                  onClick={() => void (push.state === 'on' ? push.disable() : push.enable())}
                >
                  {push.busy
                    ? 'Working…'
                    : push.state === 'on'
                      ? 'Turn off on this device'
                      : 'Enable notifications'}
                </Button>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Send an announcement"
              subtitle="One message to a whole audience — feed entry plus push"
            />
            <div className="space-y-3">
              <SelectInput
                label="Audience"
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                options={AUDIENCES}
              />
              <TextInput
                label="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={80}
                placeholder="Scheduled maintenance on Sunday"
              />
              <TextArea
                label="Message"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={300}
                placeholder="UnieMax will be briefly unavailable between 2–3 am IST."
              />
              <TextInput
                label="Link (optional)"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="/stores"
                hint="An in-app path opened when someone taps the notification."
              />
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              {result ? <p className="text-sm text-success">{result}</p> : null}
              <Button
                variant="primary"
                disabled={!canBroadcast || busy}
                onClick={() => setConfirmOpen(true)}
              >
                Review & send
              </Button>
            </div>
          </Card>
        </div>

        <Card className="lg:col-span-2" padding="none">
          <div className="p-4 sm:p-5">
            <CardHeader
              title="Your notifications"
              action={
                <button
                  type="button"
                  onClick={() => void api.markAllRead().then(feed.refresh)}
                  className="text-sm text-accent hover:underline"
                >
                  Mark all read
                </button>
              }
            />
            {feed.loading && !feed.data ? (
              <Skeleton rows={6} />
            ) : feed.data && feed.data.items.length > 0 ? (
              <ul className="divide-y divide-line">
                {feed.data.items.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => {
                        void api.markRead(notification.id).then(feed.refresh)
                        if (notification.url) navigate(notification.url)
                      }}
                      className={`-mx-2 block w-full rounded-md px-2 py-3 text-left transition-colors hover:bg-surface-alt ${
                        notification.readAt ? '' : 'bg-brand/5'
                      }`}
                    >
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                        {notification.title}
                        {notification.readAt ? null : <Chip tone="brand">New</Chip>}
                      </p>
                      <p className="mt-0.5 text-sm text-muted">{notification.body}</p>
                      <p className="mt-1 text-xs text-muted">
                        {formatRelative(notification.createdAt)} ·{' '}
                        {formatDateTime(notification.createdAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-10 text-center text-sm text-muted">
                Nothing yet. New orders and platform events land here.
              </p>
            )}
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        busy={busy}
        title="Send this announcement?"
        tone="neutral"
        confirmLabel="Send now"
        description={
          <div className="space-y-2">
            <p>
              It goes to <strong className="text-fg">{AUDIENCES.find((a) => a.value === audience)?.label}</strong>{' '}
              and cannot be recalled.
            </p>
            <div className="rounded-md border border-line bg-surface-alt p-3">
              <p className="text-sm font-medium text-fg">{title}</p>
              <p className="mt-0.5 text-sm text-muted">{body}</p>
            </div>
          </div>
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void send()}
      />
    </>
  )
}
