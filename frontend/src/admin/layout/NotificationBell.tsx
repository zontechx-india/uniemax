import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { notificationsApi } from '../../shared/notifications/notificationsApi'
import type { AppNotification } from '../../shared/notifications/notificationsApi'
import { formatRelative } from '../ui/format'
import { IconButton, Skeleton } from '../ui/primitives'

/**
 * The bell: an unread badge plus a dropdown of the latest notifications.
 *
 * The badge polls once a minute rather than holding a socket open — the
 * count is cheap, staleness of up to a minute is harmless, and it keeps the
 * console free of a realtime dependency it doesn't otherwise need. The list
 * itself loads only when the menu opens, so a signed-in tab left all day
 * costs one small count query a minute and nothing else.
 *
 * Clicking a notification marks it read and follows its `url`. Notification
 * urls are in-app paths minted by the server; they are navigated with the
 * router, so an admin never leaves the console.
 */

const api = notificationsApi('admin')
const POLL_MS = 60_000

export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const loadCount = useCallback(() => {
    api
      .unreadCount()
      .then((result) => setUnread(result.unread))
      .catch(() => {
        /* a failed badge poll is not worth interrupting anyone over */
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
    if (notification.url) navigate(notification.url)
  }

  const markAll = async () => {
    await api.markAllRead().catch(() => undefined)
    setUnread(0)
    setItems((current) =>
      current?.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })) ?? null,
    )
  }

  return (
    <div className="relative" ref={containerRef}>
      <IconButton
        icon="bell"
        onClick={() => setOpen((value) => !value)}
        className="relative"
        label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
        aria-expanded={open}
      >
        {unread > 0 ? (
          <span className="nbadge">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </IconButton>

      {open ? (
        <div className="absolute right-0 z-30 mt-1.5 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line bg-surface shadow-floating">
          <div className="card-h">
            <h2>Notifications</h2>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAll}
                className="lnk sm"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {items === null ? (
              <li className="px-4 py-4"><Skeleton rows={3} /></li>
            ) : items.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted">You're all caught up.</li>
            ) : (
              items.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => void openNotification(notification)}
                    className={`block w-full px-4 py-2.5 text-left transition-colors hover:bg-surface-alt ${
                      notification.readAt ? '' : 'bg-brand/5'
                    }`}
                  >
                    <p className="text-sm font-medium text-fg">{notification.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{notification.body}</p>
                    <p className="mt-1 text-xs text-muted">
                      {formatRelative(notification.createdAt)}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="border-t border-line px-4 py-2.5 text-center">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                navigate('/notifications')
              }}
              className="lnk sm"
            >
              View all notifications
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
