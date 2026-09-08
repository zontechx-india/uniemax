import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { notificationsApi } from '../../shared/notifications/notificationsApi'
import type { AppNotification } from '../../shared/notifications/notificationsApi'
import { usePushSubscription } from '../../shared/push/usePushSubscription'

/**
 * Notification bell for signed-in customers and sellers.
 *
 * This is where a seller finds out they have an order without watching their
 * inbox: the same events that send an email also land here, and — once the
 * device is subscribed — arrive as a push even with the tab closed.
 *
 * Push is offered **inside the menu, behind a button**, never as a prompt on
 * page load. A permission dialog nobody asked for is the fastest way to get
 * notifications blocked for good, and a block cannot be undone from the page.
 */

const api = notificationsApi('customer')
const POLL_MS = 60_000

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return `${Math.round(hours / 24)} d ago`
}

export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const push = usePushSubscription(api)

  const loadCount = useCallback(() => {
    api
      .unreadCount()
      .then((result) => setUnread(result.unread))
      .catch(() => {
        /* a failed badge poll is never worth an error message */
      })
  }, [])

  useEffect(() => {
    loadCount()
    const timer = window.setInterval(loadCount, POLL_MS)
    return () => window.clearInterval(timer)
  }, [loadCount])

  useEffect(() => {
    if (!open) return
    api
      .list({ pageSize: 8 })
      .then((result) => setItems(result.items))
      .catch(() => setItems([]))

    const onOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  const openNotification = async (notification: AppNotification) => {
    setOpen(false)
    if (!notification.readAt) {
      setUnread((count) => Math.max(count - 1, 0))
      await api.markRead(notification.id).catch(() => undefined)
    }
    if (!notification.url) return
    // Seller notifications point into the authed router (`/mystores/…`);
    // order confirmations point at the anonymous public router
    // (`/order/…`), which this router doesn't know — those need a real
    // navigation, not a client-side one.
    if (notification.url.startsWith('/order/')) {
      window.location.href = notification.url
    } else {
      navigate(notification.url)
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-alt hover:text-fg"
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
        aria-expanded={open}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
          <path d="M13.7 20a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-danger px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line bg-surface shadow-floating">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-medium text-fg">Notifications</span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => {
                  void api.markAllRead()
                  setUnread(0)
                  setItems(
                    (current) =>
                      current?.map((item) => ({
                        ...item,
                        readAt: item.readAt ?? new Date().toISOString(),
                      })) ?? null,
                  )
                }}
                className="text-xs text-accent hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <ul className="max-h-80 divide-y divide-line overflow-y-auto">
            {items === null ? (
              <li className="px-4 py-6 text-center text-sm text-muted">Loading…</li>
            ) : items.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted">
                Order updates will appear here.
              </li>
            ) : (
              items.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => void openNotification(notification)}
                    className={`block w-full px-4 py-3 text-left transition-colors hover:bg-surface-alt ${
                      notification.readAt ? '' : 'bg-brand/5'
                    }`}
                  >
                    <p className="text-sm font-medium text-fg">{notification.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{notification.body}</p>
                    <p className="mt-1 text-[11px] text-muted">{timeAgo(notification.createdAt)}</p>
                  </button>
                </li>
              ))
            )}
          </ul>

          {push.state === 'off' || push.state === 'on' ? (
            <div className="border-t border-line px-4 py-2.5">
              <button
                type="button"
                disabled={push.busy}
                onClick={() => void (push.state === 'on' ? push.disable() : push.enable())}
                className="text-xs text-accent hover:underline disabled:opacity-50"
              >
                {push.busy
                  ? 'Working…'
                  : push.state === 'on'
                    ? 'Turn off push on this device'
                    : 'Get push alerts on this device'}
              </button>
              {push.error ? <p className="mt-1 text-[11px] text-danger">{push.error}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
