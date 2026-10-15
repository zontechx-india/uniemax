import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert } from '../../../shared/ui/Alert'
import { ChipInput } from '../../../shared/ui/ChipInput'
import { Dialog } from '../../../shared/ui/Dialog'
import { SegmentedTabs } from '../../../shared/ui/form'
import { showToast } from '../../../shared/ui/Toast'
import { adminApi } from '../../features/adminApi'
import type { WaContact, WaMessage, WaQuickReply } from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import {
  Button,
  Card,
  CardHeader,
  Chip,
  Detail,
  ErrorState,
  PageHeader,
  SelectInput,
  Skeleton,
  TextArea,
  TextInput,
} from '../../ui/primitives'
import { formatDateTime, formatRelative } from '../../ui/format'
import { BackIcon } from '../../layout/icons'
import {
  DirectTemplateFields,
  FailureReason,
  MediaInput,
  TemplatePicker,
  WindowChip,
  contactLabel,
  directSendBody,
  directValuesReady,
  emptyDirectValues,
  formatWaId,
  templateKey,
  usePolling,
  useWaTemplates,
  waStatusLabel,
} from './whatsappUi'
import type { DirectValues } from './whatsappUi'

/**
 * One conversation: the thread, a composer, and who the contact is.
 *
 * The composer follows Meta's rules rather than letting the operator find
 * them by error: free text and media only while the 24h reply window is open
 * (the contact wrote in the last day), a template otherwise, nothing at all
 * once they have opted out. The thread polls every 15 s so a reply or a read
 * tick lands without a manual refresh; opening it marks it read.
 */

const PAGE_SIZE = 100
const POLL_MS = 15_000

export default function WhatsAppThreadPage() {
  const { waId = '' } = useParams()
  const contact = useAdminQuery(() => adminApi.getWaContact(waId), [waId])
  const thread = useAdminQuery(() => adminApi.listWaMessages(waId, { pageSize: PAGE_SIZE }), [waId])
  const [override, setOverride] = useState<WaContact | null>(null)

  const refreshAll = useCallback(() => {
    setOverride(null)
    contact.refresh()
    thread.refresh()
  }, [contact.refresh, thread.refresh])
  usePolling(refreshAll, POLL_MS)

  // Opening the thread reads it; so does a new message arriving while open.
  const newest = thread.data?.items[0]?.id
  useEffect(() => {
    if (!waId || !newest) return
    void adminApi.markWaRead(waId).catch(() => undefined)
  }, [waId, newest])

  if (contact.error) return <ErrorState message={contact.error} onRetry={contact.refresh} />
  if (!contact.data) return <Skeleton rows={10} />
  const c = override ?? contact.data

  const setDone = async (done: boolean) => {
    try {
      setOverride(await adminApi.updateWaContact(c.waId, { inboxState: done ? 'DONE' : 'OPEN' }))
      showToast(done ? 'Marked done' : 'Reopened')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update', 'danger')
    }
  }

  return (
    <>
      <Link
        to="/whatsapp/inbox"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
      >
        <BackIcon />
        Inbox
      </Link>

      <PageHeader
        title={contactLabel(c)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {c.name ? <span>{formatWaId(c.waId)}</span> : null}
            {c.optedOut ? <Chip tone="danger">Opted out</Chip> : <WindowChip closesAt={c.windowClosesAt} />}
            {c.inboxState === 'DONE' ? <Chip tone="neutral">Done</Chip> : null}
          </span>
        }
        actions={
          c.inboxState === 'DONE' ? (
            <Button size="md" onClick={() => void setDone(false)}>
              Reopen
            </Button>
          ) : (
            <Button size="md" onClick={() => void setDone(true)}>
              Mark done
            </Button>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" padding="none">
          <Thread
            messages={thread.data?.items ?? null}
            total={thread.data?.meta.total ?? 0}
            error={thread.error}
            onRetry={thread.refresh}
          />
          <div className="border-t border-line p-4 sm:p-5">
            {c.optedOut ? (
              <Alert tone="warning" title="This contact opted out">
                They sent STOP, so nothing can be sent to them. If they send START they are
                opted back in automatically.
              </Alert>
            ) : (
              <Composer waId={c.waId} windowOpen={Boolean(c.windowClosesAt)} onSent={refreshAll} />
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <ContactCard contact={c} onChange={setOverride} />
          <ProfilesCard contact={c} />
        </div>
      </div>
    </>
  )
}

// ---- Side cards ----------------------------------------------------------------

function ContactCard({
  contact: c,
  onChange,
}: {
  contact: WaContact
  onChange: (contact: WaContact) => void
}) {
  const [busy, setBusy] = useState(false)

  const save = async (body: { tags?: string[]; marketingOptIn?: boolean }) => {
    setBusy(true)
    try {
      onChange(await adminApi.updateWaContact(c.waId, body))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const consent = c.optedOut
    ? 'Opted out (sent STOP)'
    : c.marketingOptInAt
      ? `Consented ${formatRelative(c.marketingOptInAt).toLowerCase()}${c.marketingOptInSource ? ` · ${CONSENT_SOURCE[c.marketingOptInSource] ?? c.marketingOptInSource}` : ''}`
      : 'None recorded'

  return (
    <Card>
      <CardHeader title="Contact" />
      <dl>
        <Detail label="Number">{formatWaId(c.waId)}</Detail>
        <Detail label="WhatsApp name">{c.name ?? '—'}</Detail>
        <Detail label="Last wrote to you">
          {c.lastInboundAt ? formatRelative(c.lastInboundAt) : 'Never'}
        </Detail>
        <Detail label="Messages">{c.messageCount.toLocaleString('en-IN')}</Detail>
        <Detail label="Marketing consent">{consent}</Detail>
        <Detail label="First contact">{formatDateTime(c.createdAt)}</Detail>
      </dl>

      {!c.optedOut ? (
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={Boolean(c.marketingOptInAt)}
            disabled={busy}
            onChange={(event) => void save({ marketingOptIn: event.target.checked })}
            className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
          />
          <span>
            Agreed to marketing messages
            <span className="block text-xs text-muted">
              Tick only when they told you so — Meta requires consent for marketing.
            </span>
          </span>
        </label>
      ) : null}

      <div className="mt-4">
        <ChipInput
          label="Tags"
          items={c.tags.map((tag) => ({ key: tag, value: tag }))}
          maxItems={20}
          disabled={busy}
          placeholder="Add a tag…"
          onAdd={(value) => void save({ tags: [...c.tags, value.toLowerCase()] })}
          onRemove={(key) => void save({ tags: c.tags.filter((t) => t !== key) })}
          onRename={(key, value) =>
            void save({ tags: c.tags.map((t) => (t === key ? value.toLowerCase() : t)) })
          }
        />
      </div>
    </Card>
  )
}

const CONSENT_SOURCE: Record<string, string> = {
  import: 'imported',
  admin: 'recorded by an admin',
  start: 'sent START',
}

/** Who this number is on the platform — so a reply has context. */
function ProfilesCard({ contact: c }: { contact: WaContact }) {
  const { stores, customers } = c.profiles
  if (stores.length === 0 && customers.length === 0) return null
  return (
    <Card>
      <CardHeader title="On UnieMax" subtitle="Matched by phone number" />
      <ul className="divide-y divide-line">
        {stores.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
            <Link to={`/stores/${s.id}`} className="min-w-0 truncate text-sm font-medium text-fg hover:text-brand">
              Seller · {s.name}
            </Link>
            <Chip tone={s.suspendedAt ? 'danger' : s.isPublished ? 'success' : 'neutral'}>
              {s.suspendedAt ? 'Suspended' : s.isPublished ? 'Live' : 'Draft'}
            </Chip>
          </li>
        ))}
        {customers.map((cu) => (
          <li key={cu.id} className="flex items-center justify-between gap-3 py-2.5">
            <Link
              to={`/customers/${cu.id}`}
              className="min-w-0 truncate text-sm font-medium text-fg hover:text-brand"
            >
              Customer · {cu.name ?? cu.email ?? 'Unnamed'}
            </Link>
            <span className="shrink-0 text-xs text-muted">
              {cu.orderCount} order{cu.orderCount === 1 ? '' : 's'}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ---- Thread ----------------------------------------------------------------------

function Thread({
  messages,
  total,
  error,
  onRetry,
}: {
  messages: WaMessage[] | null
  total: number
  error: string | null
  onRetry: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastId = messages?.[0]?.id

  // Follow the conversation: jump to the newest message when one arrives.
  // Scrolls the thread box only — never the page around it.
  useEffect(() => {
    const box = scrollRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [lastId])

  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (!messages) return <Skeleton rows={6} className="p-4" />
  if (messages.length === 0) {
    return <p className="p-6 text-center text-sm text-muted">No messages in this conversation yet.</p>
  }

  // The API answers newest first; a chat reads oldest → newest.
  const ordered = messages.slice().reverse()

  return (
    <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto p-4 sm:p-5" aria-live="polite">
      {total > messages.length ? (
        <p className="mb-3 text-center text-xs text-muted">
          Showing the latest {messages.length} of {total.toLocaleString('en-IN')} messages
        </p>
      ) : null}
      <ol className="space-y-3">
        {ordered.map((message) => (
          <Bubble key={message.id} message={message} />
        ))}
      </ol>
    </div>
  )
}

const MEDIA_LABEL: Record<string, string> = {
  image: 'Photo',
  video: 'Video',
  audio: 'Voice message',
  document: 'Document',
  sticker: 'Sticker',
}

function Bubble({ message }: { message: WaMessage }) {
  const out = message.direction === 'OUT'
  const failed = message.lastStatus === 'failed'
  const media = MEDIA_LABEL[message.type]
  // Media we sent is stored by link — show the photo itself.
  const sentImage = out && message.type === 'image' && message.body?.startsWith('http') ? message.body : null

  return (
    <li className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg border px-3 py-2 sm:max-w-[70%] ${
          failed
            ? 'border-danger/35 bg-danger/8'
            : out
              ? 'border-brand/20 bg-brand-soft'
              : 'border-line bg-surface-alt'
        }`}
      >
        {message.templateName ? (
          <p className="mb-1 text-xs font-medium text-muted">Template · {message.templateName}</p>
        ) : null}
        {media ? <p className="text-sm font-medium text-fg">{media}</p> : null}
        {sentImage ? (
          <img src={sentImage} alt="" className="mt-1 max-h-48 rounded-md object-cover" />
        ) : message.body ? (
          <p className="whitespace-pre-wrap break-words text-sm text-fg">{message.body}</p>
        ) : !media && !message.templateName ? (
          <p className="text-sm italic text-muted">Unsupported message ({message.type})</p>
        ) : null}
        <p className={`mt-1 text-right text-xs ${failed ? 'text-danger' : 'text-muted'}`}>
          {formatDateTime(message.createdAt)}
          {out && message.lastStatus ? ` · ${waStatusLabel(message.lastStatus)}` : ''}
        </p>
        {failed ? (
          <FailureReason
            code={message.errorCode}
            title={message.errorTitle}
            details={message.errorDetails}
          />
        ) : null}
      </div>
    </li>
  )
}

// ---- Composer ------------------------------------------------------------------

type Mode = 'text' | 'media' | 'template'

function Composer({
  waId,
  windowOpen,
  onSent,
}: {
  waId: string
  windowOpen: boolean
  onSent: () => void
}) {
  const templates = useWaTemplates()
  const quickReplies = useAdminQuery(() => adminApi.listWaQuickReplies(), [])
  const [managing, setManaging] = useState(false)
  const [mode, setMode] = useState<Mode>(windowOpen ? 'text' : 'template')
  const [text, setText] = useState('')
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image')
  const [mediaLink, setMediaLink] = useState('')
  const [caption, setCaption] = useState('')
  const [key, setKey] = useState('')
  const [values, setValues] = useState<DirectValues>(emptyDirectValues(null))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The window can close while the page is open — fall back to templates.
  useEffect(() => {
    if (!windowOpen) setMode('template')
  }, [windowOpen])

  const template = templates.data?.find((t) => templateKey(t) === key) ?? null
  const ready =
    mode === 'text'
      ? text.trim().length > 0
      : mode === 'media'
        ? /^https?:\/\//.test(mediaLink.trim())
        : directValuesReady(template, values)

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      if (mode === 'text') {
        await adminApi.sendWaText({ to: waId, text: text.trim() })
        setText('')
      } else if (mode === 'media') {
        await adminApi.sendWaMedia({
          to: waId,
          type: mediaType,
          link: mediaLink.trim(),
          ...(caption.trim() ? { caption: caption.trim() } : {}),
        })
        setMediaLink('')
        setCaption('')
      } else if (template) {
        await adminApi.sendWaTemplate(directSendBody(waId, template, values))
        setKey('')
        setValues(emptyDirectValues(null))
      }
      showToast('Message sent')
      onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the message')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {windowOpen ? (
        <SegmentedTabs<Mode>
          tabs={[
            { value: 'text', label: 'Message' },
            { value: 'media', label: 'Photo / video' },
            { value: 'template', label: 'Template' },
          ]}
          value={mode}
          onChange={setMode}
        />
      ) : (
        <Alert tone="info" title="Reply window closed">
          They haven&apos;t written in the last 24 hours, so WhatsApp only allows an approved
          template. Once they reply you can message freely again.
        </Alert>
      )}

      {mode === 'text' ? (
        <>
          <QuickReplyPicker
            replies={quickReplies.data ?? []}
            onPick={(body) => setText((current) => (current.trim() ? `${current}\n${body}` : body))}
            onManage={() => setManaging(true)}
          />
          <TextArea
            label="Message"
            value={text}
            maxLength={4096}
            rows={3}
            placeholder="Write a reply…"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Ctrl/⌘+Enter sends — plain Enter stays a new line.
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && ready && !busy) {
                event.preventDefault()
                void send()
              }
            }}
          />
        </>
      ) : mode === 'media' ? (
        <div className="space-y-3">
          <SegmentedTabs<'image' | 'video'>
            tabs={[
              { value: 'image', label: 'Photo' },
              { value: 'video', label: 'Video' },
            ]}
            value={mediaType}
            onChange={(next) => {
              setMediaType(next)
              setMediaLink('')
            }}
          />
          <MediaInput type={mediaType} value={mediaLink} onChange={setMediaLink} label={mediaType === 'image' ? 'Photo link' : 'Video link'} />
          <TextInput
            label="Caption (optional)"
            value={caption}
            maxLength={1024}
            onChange={(event) => setCaption(event.target.value)}
          />
        </div>
      ) : templates.error ? (
        <ErrorState message={templates.error} onRetry={templates.refresh} />
      ) : !templates.data ? (
        <Skeleton rows={3} />
      ) : (
        <>
          <TemplatePicker
            templates={templates.data}
            value={key}
            onChange={(next) => {
              setKey(next)
              setValues(emptyDirectValues(templates.data?.find((t) => templateKey(t) === next) ?? null))
            }}
          />
          {template ? (
            <DirectTemplateFields template={template} values={values} onChange={setValues} />
          ) : null}
        </>
      )}

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-2 sm:justify-between">
        {/* Keyboard hint is desktop-only — a phone has no Ctrl key. */}
        <p className="hidden text-xs text-muted sm:block">
          {mode === 'text' ? 'Ctrl + Enter to send' : mode === 'media' ? 'JPEG, PNG or MP4' : 'Templates can be sent any time'}
        </p>
        <Button variant="primary" disabled={!ready || busy} onClick={() => void send()}>
          {busy ? 'Sending…' : mode === 'template' ? 'Send template' : 'Send'}
        </Button>
      </div>

      <QuickRepliesDialog
        open={managing}
        replies={quickReplies.data ?? []}
        onClose={() => setManaging(false)}
        onChanged={quickReplies.refresh}
      />
    </div>
  )
}

function QuickReplyPicker({
  replies,
  onPick,
  onManage,
}: {
  replies: WaQuickReply[]
  onPick: (body: string) => void
  onManage: () => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      {replies.length > 0 ? (
        <div className="min-w-0 flex-1">
          <SelectInput
            label="Quick reply"
            value=""
            onChange={(event) => {
              const reply = replies.find((r) => r.id === event.target.value)
              if (reply) onPick(reply.body)
            }}
            options={[
              { value: '', label: 'Insert a saved reply…' },
              ...replies.map((r) => ({ value: r.id, label: r.title })),
            ]}
          />
        </div>
      ) : null}
      <Button variant="ghost" onClick={onManage} className="mb-px">
        {replies.length > 0 ? 'Manage replies' : 'Save quick replies'}
      </Button>
    </div>
  )
}

function QuickRepliesDialog({
  open,
  replies,
  onClose,
  onChanged,
}: {
  open: boolean
  replies: WaQuickReply[]
  onClose: () => void
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<WaQuickReply | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startEdit = (reply: WaQuickReply | null) => {
    setEditing(reply)
    setTitle(reply?.title ?? '')
    setBody(reply?.body ?? '')
    setError(null)
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const input = { title: title.trim(), body: body.trim() }
      if (editing) await adminApi.updateWaQuickReply(editing.id, input)
      else await adminApi.createWaQuickReply(input)
      startEdit(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (reply: WaQuickReply) => {
    setBusy(true)
    try {
      await adminApi.deleteWaQuickReply(reply.id)
      if (editing?.id === reply.id) startEdit(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Quick replies"
      subtitle="Saved answers any admin can insert into a reply"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-5">
        {replies.length > 0 ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {replies.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{r.title}</p>
                  <p className="line-clamp-2 text-xs text-muted">{r.body}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" disabled={busy} onClick={() => startEdit(r)}>
                    Edit
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => void remove(r)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No saved replies yet — add your first below.</p>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-fg">{editing ? 'Edit reply' : 'New reply'}</h3>
          <TextInput
            label="Title"
            value={title}
            maxLength={60}
            placeholder="Delivery times"
            onChange={(event) => setTitle(event.target.value)}
          />
          <TextArea
            label="Message"
            value={body}
            rows={4}
            maxLength={4096}
            onChange={(event) => setBody(event.target.value)}
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            {editing ? <Button onClick={() => startEdit(null)}>Cancel edit</Button> : null}
            <Button
              variant="primary"
              disabled={busy || !title.trim() || !body.trim()}
              onClick={() => void save()}
            >
              {editing ? 'Save changes' : 'Add reply'}
            </Button>
          </div>
        </section>
      </div>
    </Dialog>
  )
}
