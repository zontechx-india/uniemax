import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert } from '../../../shared/ui/Alert'
import { SegmentedTabs } from '../../../shared/ui/form'
import { showToast } from '../../../shared/ui/Toast'
import { adminApi } from '../../features/adminApi'
import type { WaMessage } from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import {
  Button,
  Card,
  CardHeader,
  Chip,
  Detail,
  ErrorState,
  PageHeader,
  Skeleton,
  TextArea,
} from '../../ui/primitives'
import { formatDateTime, formatRelative } from '../../ui/format'
import { BackIcon } from '../../layout/icons'
import {
  FailureReason,
  TemplateFields,
  WindowChip,
  contactLabel,
  formatWaId,
  templateKey,
  usePolling,
  useWaTemplates,
  waStatusLabel,
} from './whatsappUi'

/**
 * One conversation: the thread, a composer, and who the contact is.
 *
 * The composer follows Meta's rules rather than letting the operator find
 * them by error: free text only while the 24h reply window is open (the
 * contact wrote in the last day), a template otherwise, nothing at all once
 * they have opted out. The thread polls every 15 s so a reply or a read tick
 * lands without a manual refresh.
 */

const PAGE_SIZE = 100
const POLL_MS = 15_000

export default function WhatsAppThreadPage() {
  const { waId = '' } = useParams()
  const contact = useAdminQuery(() => adminApi.getWaContact(waId), [waId])
  const thread = useAdminQuery(() => adminApi.listWaMessages(waId, { pageSize: PAGE_SIZE }), [waId])

  const refreshAll = useCallback(() => {
    contact.refresh()
    thread.refresh()
  }, [contact.refresh, thread.refresh])
  usePolling(refreshAll, POLL_MS)

  if (contact.error) return <ErrorState message={contact.error} onRetry={contact.refresh} />
  if (!contact.data) return <Skeleton rows={10} />
  const c = contact.data

  return (
    <>
      <Link
        to="/whatsapp"
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
          </span>
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
              <Composer
                waId={c.waId}
                windowOpen={Boolean(c.windowClosesAt)}
                onSent={refreshAll}
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Contact" />
          <dl>
            <Detail label="Number">{formatWaId(c.waId)}</Detail>
            <Detail label="WhatsApp name">{c.name ?? '—'}</Detail>
            <Detail label="Last wrote to you">
              {c.lastInboundAt ? formatRelative(c.lastInboundAt) : 'Never'}
            </Detail>
            <Detail label="Messages">{c.messageCount.toLocaleString('en-IN')}</Detail>
            <Detail label="Marketing">{c.optedOut ? 'Opted out (STOP)' : 'Subscribed'}</Detail>
            <Detail label="First contact">{formatDateTime(c.createdAt)}</Detail>
          </dl>
        </Card>
      </div>
    </>
  )
}

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
        {message.body ? (
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

type Mode = 'text' | 'template'

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
  const [mode, setMode] = useState<Mode>(windowOpen ? 'text' : 'template')
  const [text, setText] = useState('')
  const [key, setKey] = useState('')
  const [params, setParams] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The window can close while the page is open — fall back to templates.
  useEffect(() => {
    if (!windowOpen) setMode('template')
  }, [windowOpen])

  const template = templates.data?.find((t) => templateKey(t) === key) ?? null
  const ready =
    mode === 'text' ? text.trim().length > 0 : Boolean(template) && params.every((p) => p.trim())

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      if (mode === 'text') {
        await adminApi.sendWaText({ to: waId, text: text.trim() })
        setText('')
      } else if (template) {
        await adminApi.sendWaTemplate({
          to: waId,
          templateName: template.name,
          languageCode: template.language,
          bodyParams: params.map((p) => p.trim()),
        })
        setKey('')
        setParams([])
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
      ) : templates.error ? (
        <ErrorState message={templates.error} onRetry={templates.refresh} />
      ) : !templates.data ? (
        <Skeleton rows={3} />
      ) : (
        <TemplateFields
          templates={templates.data}
          value={key}
          onChange={setKey}
          params={params}
          onParamsChange={setParams}
        />
      )}

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-2 sm:justify-between">
        {/* Keyboard hint is desktop-only — a phone has no Ctrl key. */}
        <p className="hidden text-xs text-muted sm:block">
          {mode === 'text' ? 'Ctrl + Enter to send' : 'Templates can be sent any time'}
        </p>
        <Button variant="primary" disabled={!ready || busy} onClick={() => void send()}>
          {busy ? 'Sending…' : mode === 'text' ? 'Send message' : 'Send template'}
        </Button>
      </div>
    </div>
  )
}
