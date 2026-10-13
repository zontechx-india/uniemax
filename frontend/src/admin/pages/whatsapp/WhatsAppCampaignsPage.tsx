import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '../../../shared/ui/Alert'
import { Dialog } from '../../../shared/ui/Dialog'
import { showToast } from '../../../shared/ui/Toast'
import { adminApi } from '../../features/adminApi'
import type { WaCampaignRow, WaTemplate } from '../../features/adminApi'
import { useAdminList } from '../../features/useAdminQuery'
import {
  Button,
  ErrorState,
  Skeleton,
  TextArea,
  TextInput,
  buttonClass,
} from '../../ui/primitives'
import { DataTable, Pagination } from '../../ui/DataTable'
import type { Column } from '../../ui/DataTable'
import { formatCount } from '../../ui/format'
import {
  CampaignStateChip,
  LastSeen,
  TemplateFields,
  WhatsAppShell,
  templateKey,
  useWaTemplates,
} from './whatsappUi'

/**
 * Campaigns — one approved template sent to many numbers, paced by the
 * server (WA_SEND_RATE_PER_SEC). Opted-out and repeated numbers are skipped
 * server-side; the form checks shape (number, value count) before anything
 * is sent, so a typo fails here rather than as a failed send.
 */

export default function WhatsAppCampaignsPage() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const list = useAdminList<WaCampaignRow>((query) => adminApi.listWaCampaigns(query), { keys: [] })

  const columns: Column<WaCampaignRow>[] = [
    {
      header: 'Campaign',
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{row.name}</p>
          <p className="truncate text-xs text-muted">
            {row.templateName} · {row.languageCode}
          </p>
        </div>
      ),
    },
    { header: 'Recipients', className: 'text-right', cell: (row) => formatCount(row.total) },
    { header: 'Sent', className: 'text-right', cell: (row) => formatCount(row.sent) },
    {
      header: 'Skipped',
      className: 'text-right',
      hideOnMobile: true,
      cell: (row) => formatCount(row.skipped),
    },
    {
      header: 'Failed',
      className: 'text-right',
      cell: (row) => (
        <span className={row.failed > 0 ? 'text-danger' : ''}>{formatCount(row.failed)}</span>
      ),
    },
    { header: 'State', cell: (row) => <CampaignStateChip finishedAt={row.finishedAt} /> },
    { header: 'Created', cell: (row) => <LastSeen at={row.createdAt} /> },
  ]

  return (
    <WhatsAppShell
      actions={
        <Button variant="primary" size="md" onClick={() => setCreating(true)}>
          New campaign
        </Button>
      }
    >
      {() => (
        <>
          <DataTable
            rows={list.rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={list.loading}
            error={list.error}
            onRetry={list.refresh}
            onRowClick={(row) => navigate(`/whatsapp/campaigns/${row.id}`)}
            empty={{
              title: 'No campaigns yet',
              hint: 'A campaign sends one approved template to a list of numbers. Start one with New campaign.',
            }}
          />
          <Pagination
            page={list.meta.page}
            totalPages={list.meta.totalPages}
            total={list.meta.total}
            onPage={list.setPage}
            busy={list.loading}
          />
          <NewCampaignDialog
            open={creating}
            onClose={() => setCreating(false)}
            onCreated={(id) => navigate(`/whatsapp/campaigns/${id}`)}
          />
        </>
      )}
    </WhatsAppShell>
  )
}

// ---- Recipient list parsing --------------------------------------------------

interface ParsedRecipients {
  recipients: { to: string; bodyParams: string[] }[]
  errors: string[]
}

/** One CSV line → cells. Handles "quoted, values" and "" escapes; tabs also split. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',' || ch === '\t') {
      cells.push(cell)
      cell = ''
    } else cell += ch
  }
  cells.push(cell)
  return cells.map((c) => c.trim())
}

const MAX_RECIPIENTS = 10_000

/**
 * "number, value 1, value 2" per line. A first line whose number column has
 * no digits is a header row and is skipped, so an exported spreadsheet works
 * as-is.
 */
function parseRecipients(text: string, paramCount: number): ParsedRecipients {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const recipients: ParsedRecipients['recipients'] = []
  const errors: string[] = []

  lines.forEach((line, index) => {
    if (!line) return
    const [number = '', ...values] = splitCsvLine(line)
    const digits = number.replace(/\D/g, '')
    if (index === 0 && digits.length === 0) return // header row
    const where = `Line ${index + 1}`
    if (!/^\d{7,15}$/.test(digits)) {
      errors.push(`${where}: “${number}” is not a phone number`)
      return
    }
    // Positional: column 2 is {{1}}, column 3 is {{2}}… — a blank cell is an
    // error, never a shift of the later values into the wrong slot.
    const bodyParams = values.slice(0, paramCount)
    if (bodyParams.length < paramCount || bodyParams.some((v) => v === '')) {
      const found = bodyParams.filter((v) => v !== '').length
      errors.push(
        `${where}: needs ${paramCount} value${paramCount === 1 ? '' : 's'} after the number, found ${found}`,
      )
      return
    }
    recipients.push({ to: digits, bodyParams })
  })

  if (recipients.length > MAX_RECIPIENTS) {
    errors.unshift(`At most ${formatCount(MAX_RECIPIENTS)} recipients per campaign — split the list`)
  }
  return { recipients, errors }
}

function exampleLine(template: WaTemplate | null): string {
  const values = Array.from({ length: template?.paramCount ?? 0 }, (_, i) => `value ${i + 1}`)
  return ['919876543210', ...values].join(', ')
}

// ---- Dialog ------------------------------------------------------------------

function NewCampaignDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const templates = useWaTemplates()
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const template = templates.data?.find((t) => templateKey(t) === key) ?? null
  const parsed = useMemo(
    () => (template ? parseRecipients(text, template.paramCount) : { recipients: [], errors: [] }),
    [text, template],
  )
  const ready =
    name.trim() && template && parsed.recipients.length > 0 && parsed.errors.length === 0

  const loadFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 2_000_000) {
      setError('That file is over 2 MB — split the list into smaller campaigns')
      return
    }
    setError(null)
    setText(await file.text())
  }

  const start = async () => {
    if (!template) return
    setBusy(true)
    setError(null)
    try {
      const { campaignId } = await adminApi.createWaCampaign({
        name: name.trim(),
        templateName: template.name,
        languageCode: template.language,
        recipients: parsed.recipients,
      })
      showToast('Campaign started')
      onClose()
      onCreated(campaignId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the campaign')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="New campaign"
      subtitle="Sends start as soon as you confirm and can't be recalled"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ready || busy} onClick={() => void start()}>
            {busy
              ? 'Starting…'
              : parsed.errors.length > 0
                ? `Fix ${parsed.errors.length} line${parsed.errors.length === 1 ? '' : 's'} first`
                : parsed.recipients.length > 0
                ? `Send to ${formatCount(parsed.recipients.length)}`
                : 'Send campaign'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <TextInput
          label="Campaign name"
          value={name}
          maxLength={120}
          placeholder="Diwali offer — October"
          onChange={(event) => setName(event.target.value)}
          hint="Only you see this — it labels the campaign in the list."
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
            params={[]}
            onParamsChange={() => undefined}
            withParams={false}
            {...(parsed.recipients[0] ? { previewParams: parsed.recipients[0].bodyParams } : {})}
          />
        )}

        {template ? (
          <section className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-fg">Recipients</h3>
                <p className="text-xs text-muted">
                  One per line: the number
                  {template.paramCount > 0
                    ? `, then ${template.paramCount} value${template.paramCount === 1 ? '' : 's'} for {{1}}${template.paramCount > 1 ? `…{{${template.paramCount}}}` : ''}`
                    : ''}
                  , separated by commas.
                </p>
              </div>
              <label className={buttonClass({ className: 'cursor-pointer' })}>
                Upload CSV
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="sr-only"
                  onChange={(event) => {
                    void loadFile(event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
              </label>
            </div>
            <TextArea
              aria-label="Recipients"
              value={text}
              rows={8}
              placeholder={`${exampleLine(template)}\n${exampleLine(template).replace('919876543210', '919812345678')}`}
              onChange={(event) => setText(event.target.value)}
              className="font-mono"
            />
            {parsed.errors.length > 0 ? (
              <Alert tone="danger" title={`${parsed.errors.length} line${parsed.errors.length === 1 ? '' : 's'} to fix`}>
                <ul className="list-disc pl-4">
                  {parsed.errors.slice(0, 5).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                  {parsed.errors.length > 5 ? <li>…and {parsed.errors.length - 5} more</li> : null}
                </ul>
              </Alert>
            ) : parsed.recipients.length > 0 ? (
              <p className="text-sm text-success">
                {formatCount(parsed.recipients.length)} recipient
                {parsed.recipients.length === 1 ? '' : 's'} ready. Opted-out and repeated numbers
                are skipped automatically.
              </p>
            ) : null}
          </section>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </Dialog>
  )
}
