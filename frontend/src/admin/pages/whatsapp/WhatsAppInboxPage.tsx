import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog } from '../../../shared/ui/Dialog'
import { showToast } from '../../../shared/ui/Toast'
import { adminApi } from '../../features/adminApi'
import type { WaContactRow, WaIntegrationStatus } from '../../features/adminApi'
import { useAdminList } from '../../features/useAdminQuery'
import { Button, Chip, ErrorState, Skeleton, TextInput } from '../../ui/primitives'
import { DataTable, Pagination } from '../../ui/DataTable'
import type { Column } from '../../ui/DataTable'
import { FilterSelect, SearchInput, Toolbar } from '../../ui/Toolbar'
import {
  LastSeen,
  TemplateFields,
  WaStatusChip,
  WhatsAppShell,
  WindowChip,
  contactLabel,
  formatWaId,
  templateKey,
  useWaTemplates,
} from './whatsappUi'

/**
 * Inbox — every number the business has talked to, the most recent
 * conversation first.
 *
 * "Awaiting reply" is derived, not stored: the last message came FROM the
 * contact. That is the question an operator scans the list for, and it can
 * never drift out of sync with the thread the way a read flag would.
 */

const FILTERS = [
  { value: '', label: 'All conversations' },
  { value: 'window', label: 'Reply window open' },
  { value: 'optedOut', label: 'Opted out' },
]

function preview(row: WaContactRow): string {
  const last = row.lastMessage
  if (!last) return 'No messages yet'
  const text = last.body ?? (last.templateName ? `Template · ${last.templateName}` : `[${last.type}]`)
  return last.direction === 'OUT' ? `You: ${text}` : text
}

export default function WhatsAppInboxPage() {
  const navigate = useNavigate()
  const [composing, setComposing] = useState(false)
  const list = useAdminList<WaContactRow>((query) => adminApi.listWaContacts(query), {
    keys: ['q', 'filter'],
  })

  const columns: Column<WaContactRow>[] = [
    {
      header: 'Contact',
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{contactLabel(row)}</p>
          {row.name ? <p className="truncate text-xs text-muted">{formatWaId(row.waId)}</p> : null}
        </div>
      ),
    },
    {
      header: 'Last message',
      cell: (row) => (
        <p className="max-w-sm truncate text-sm text-muted" title={preview(row)}>
          {preview(row)}
        </p>
      ),
    },
    {
      header: 'Status',
      cell: (row) =>
        row.optedOut ? (
          <Chip tone="danger">Opted out</Chip>
        ) : row.lastMessage?.direction === 'IN' ? (
          <Chip tone="warning">Awaiting reply</Chip>
        ) : (
          <WaStatusChip status={row.lastMessage?.lastStatus ?? null} />
        ),
    },
    {
      header: 'Reply window',
      hideOnMobile: true,
      cell: (row) =>
        row.windowClosesAt ? (
          <WindowChip closesAt={row.windowClosesAt} />
        ) : (
          <span className="text-sm text-muted">Template only</span>
        ),
    },
    { header: 'Last activity', cell: (row) => <LastSeen at={row.lastMessageAt} /> },
  ]

  return (
    <WhatsAppShell
      actions={
        <Button variant="primary" size="md" onClick={() => setComposing(true)}>
          New message
        </Button>
      }
    >
      {(status) => (
        <>
          <Toolbar>
            <SearchInput
              value={list.filters['q'] ?? ''}
              onChange={(value) => list.setFilter('q', value)}
              placeholder="Name or number…"
            />
            <FilterSelect
              label="Show"
              value={list.filters['filter'] ?? ''}
              onChange={(value) => list.setFilter('filter', value)}
              options={FILTERS}
            />
          </Toolbar>
          <DataTable
            rows={list.rows}
            columns={columns}
            rowKey={(row) => row.waId}
            loading={list.loading}
            error={list.error}
            onRetry={list.refresh}
            onRowClick={(row) => navigate(`/whatsapp/chats/${row.waId}`)}
            empty={
              list.filters['q'] || list.filters['filter']
                ? { title: 'No conversations match', hint: 'Clear the search or filter to see everyone.' }
                : {
                    title: 'No conversations yet',
                    hint: 'Messages customers send to the business number appear here. Use New message to start one with a template.',
                  }
            }
          />
          <Pagination
            page={list.meta.page}
            totalPages={list.meta.totalPages}
            total={list.meta.total}
            onPage={list.setPage}
            busy={list.loading}
          />
          <NewMessageDialog
            open={composing}
            status={status}
            onClose={() => setComposing(false)}
            onSent={(waId) => navigate(`/whatsapp/chats/${waId}`)}
          />
        </>
      )}
    </WhatsAppShell>
  )
}

/**
 * Starting a conversation. Business-initiated messages must be an approved
 * template (Meta's rule), so there is no free-text option here — that only
 * appears inside a thread whose reply window is open.
 */
function NewMessageDialog({
  open,
  status,
  onClose,
  onSent,
}: {
  open: boolean
  status: WaIntegrationStatus
  onClose: () => void
  onSent: (waId: string) => void
}) {
  const templates = useWaTemplates()
  const [to, setTo] = useState('')
  const [key, setKey] = useState('')
  const [params, setParams] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const template = templates.data?.find((t) => templateKey(t) === key) ?? null
  const digits = to.replace(/\D/g, '')
  const numberOk = /^\d{7,15}$/.test(digits)
  const ready = numberOk && template && params.every((p) => p.trim())

  const send = async () => {
    if (!template) return
    setBusy(true)
    setError(null)
    try {
      await adminApi.sendWaTemplate({
        to,
        templateName: template.name,
        languageCode: template.language,
        bodyParams: params.map((p) => p.trim()),
      })
      showToast('Message sent')
      onClose()
      onSent(digits)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the message')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New message"
      subtitle="Conversations you start must use an approved template"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ready || busy} onClick={() => void send()}>
            {busy ? 'Sending…' : 'Send template'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextInput
          label="WhatsApp number"
          value={to}
          inputMode="tel"
          placeholder="+91 98765 43210"
          onChange={(event) => setTo(event.target.value)}
          hint={
            status.production
              ? 'With country code. Spaces and dashes are fine.'
              : 'Test mode: only allowlisted numbers will go through.'
          }
        />
        {templates.error ? (
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
      </div>
    </Dialog>
  )
}
