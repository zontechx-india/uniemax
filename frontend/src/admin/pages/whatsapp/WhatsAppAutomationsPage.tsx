import { useEffect, useState } from 'react'
import { Alert } from '../../../shared/ui/Alert'
import { Dialog } from '../../../shared/ui/Dialog'
import { showToast } from '../../../shared/ui/Toast'
import { adminApi } from '../../features/adminApi'
import type { WaAutomation, WaAutomationRun, WaMapping } from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import { Button, Chip, ErrorState, Skeleton, TextInput } from '../../ui/primitives'
import { formatCount, formatDateTime, formatRelative } from '../../ui/format'
import {
  CategoryChip,
  MappingEditor,
  TemplatePicker,
  TemplatePreview,
  cleanMapping,
  defaultMapping,
  exampleFill,
  formatWaId,
  mappingProblem,
  templateKey,
  useWaFields,
  useWaTemplates,
  WhatsAppShell,
} from './whatsappUi'

/**
 * Automations — template messages sent on events, without anyone pressing
 * send. Each runs every few minutes between 9:00 and 21:00 (India time), fires
 * once per event, and only for events after it was switched on.
 */

export default function WhatsAppAutomationsPage() {
  const automations = useAdminQuery(() => adminApi.listWaAutomations(), [])
  const [editing, setEditing] = useState<WaAutomation | null>(null)
  const [log, setLog] = useState<WaAutomation | null>(null)

  return (
    <WhatsAppShell>{() => (<>
      <div className="space-y-4 p-4 sm:p-5">
        <p className="text-sm text-muted">
          Each automation sends one approved template when something happens to a seller. They
          run between 9:00 and 21:00 India time, message each event once, and never send for
          things that happened before you switched them on.
        </p>
        {automations.error ? (
          <ErrorState message={automations.error} onRetry={automations.refresh} />
        ) : !automations.data ? (
          <Skeleton rows={6} />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {automations.data.map((a) => (
              <li key={a.key} className="flex flex-col rounded-lg border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-fg">{a.title}</h3>
                  {a.enabled ? <Chip tone="success">On</Chip> : <Chip tone="neutral">Off</Chip>}
                </div>
                <p className="mt-1 text-sm text-muted">{a.description}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted">Template</dt>
                  <dd className="truncate text-fg">{a.templateName ?? 'Not chosen'}</dd>
                  <dt className="text-muted">Last 7 days</dt>
                  <dd className="text-fg">
                    {formatCount(a.last7Days.sent)} sent
                    {a.last7Days.skipped > 0 ? ` · ${formatCount(a.last7Days.skipped)} skipped` : ''}
                    {a.last7Days.failed > 0 ? (
                      <span className="text-danger"> · {formatCount(a.last7Days.failed)} failed</span>
                    ) : null}
                  </dd>
                  <dt className="text-muted">Last fired</dt>
                  <dd className="text-fg">{a.lastRunAt ? formatRelative(a.lastRunAt) : 'Never'}</dd>
                </dl>
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-3">
                  <Button variant="ghost" onClick={() => setLog(a)}>
                    Activity
                  </Button>
                  <Button variant={a.enabled ? 'secondary' : 'primary'} onClick={() => setEditing(a)}>
                    {a.enabled ? 'Edit' : 'Set up'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing ? (
        <AutomationDialog
          key={editing.key}
          automation={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            automations.refresh()
          }}
        />
      ) : null}
      {log ? <RunsDialog automation={log} onClose={() => setLog(null)} /> : null}
    </>)}</WhatsAppShell>
  )
}


function AutomationDialog({
  automation: a,
  onClose,
  onSaved,
}: {
  automation: WaAutomation
  onClose: () => void
  onSaved: () => void
}) {
  const templates = useWaTemplates()
  const catalogue = useWaFields()
  const [enabled, setEnabled] = useState(a.enabled || !a.enabledAt)
  const [key, setKey] = useState('')
  const [mapping, setMapping] = useState<WaMapping | null>(null)
  const [config, setConfig] = useState<Record<string, unknown>>(a.config)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Seed the template once the list is in: the saved one, or the default name.
  useEffect(() => {
    if (!templates.data) return
    const match = templates.data.find(
      (t) => t.sendable && t.name === a.templateName && (!a.languageCode || t.language === a.languageCode),
    )
    if (!match) return
    setKey(templateKey(match))
    const fits =
      a.mapping.body.length === match.paramCount && a.mapping.buttons.length === match.urlButtons.length
    setMapping(fits ? a.mapping : defaultMapping(match))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once, when the list arrives
  }, [templates.data])

  const template = templates.data?.find((t) => templateKey(t) === key) ?? null
  const fields = catalogue.data
    ? a.fieldKind === 'sellerOrders'
      ? [...catalogue.data.sellers, ...catalogue.data.orders]
      : catalogue.data.sellers
    : []
  const problem = enabled
    ? !template || !mapping
      ? 'Choose a template'
      : mappingProblem(template, mapping)
    : null

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await adminApi.updateWaAutomation(a.key, {
        enabled,
        templateName: template?.name ?? null,
        languageCode: template?.language ?? null,
        mapping: mapping ? cleanMapping(mapping) : { body: [], buttons: [], header: null },
        config,
      })
      showToast(enabled ? `${a.title} is on` : `${a.title} is off`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title={a.title}
      subtitle={a.description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || Boolean(problem)} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <label className="flex cursor-pointer items-start gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
          />
          <span>
            Switched on
            <span className="block text-xs text-muted">
              {a.enabled && a.enabledAt
                ? `On since ${formatDateTime(a.enabledAt)}.`
                : 'From the moment you save — nothing is sent for earlier events.'}
            </span>
          </span>
        </label>

        {a.configFields.map((field) =>
          field.kind === 'dayList' ? (
            <TextInput
              key={field.key}
              label={field.label}
              hint={field.hint}
              value={Array.isArray(config[field.key]) ? (config[field.key] as number[]).join(', ') : ''}
              onChange={(event) =>
                setConfig({
                  ...config,
                  [field.key]: event.target.value
                    .split(/[,\s]+/)
                    .map(Number)
                    .filter((n) => Number.isInteger(n) && n > 0),
                })
              }
            />
          ) : (
            <TextInput
              key={field.key}
              label={field.label}
              hint={field.hint}
              type="number"
              value={String(config[field.key] ?? '')}
              onChange={(event) => setConfig({ ...config, [field.key]: Number(event.target.value) })}
            />
          ),
        )}

        {templates.error ? (
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
                const t = templates.data?.find((x) => templateKey(x) === next)
                setMapping(t ? defaultMapping(t) : null)
              }}
            />
            {!a.templateName && !template ? (
              <Alert tone="info" title="Needs a template of its own">
                Create one in WhatsApp Manager for this moment (keep it factual for a utility
                template), wait for approval, then choose it here.
              </Alert>
            ) : null}
            {template?.category === 'MARKETING' ? (
              <p className="text-xs text-muted">
                Marketing template — it only goes to sellers with marketing consent on record.
              </p>
            ) : null}
            {template && mapping ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <MappingEditor
                  template={template}
                  mapping={mapping}
                  onChange={setMapping}
                  fields={fields}
                  allowTracking={false}
                />
                <div className="space-y-2">
                  <CategoryChip category={template.category} />
                  <TemplatePreview
                    template={template}
                    params={mapping.body.map((s) => exampleFill(s.value, fields))}
                    headerLink={mapping.header?.link ?? ''}
                  />
                </div>
              </div>
            ) : null}
          </>
        )}
        {problem && enabled ? <p className="text-sm text-muted">{problem}.</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </Dialog>
  )
}

const RUN_TONE: Record<WaAutomationRun['status'], 'success' | 'neutral' | 'danger' | 'pending'> = {
  SENT: 'success',
  SKIPPED: 'neutral',
  FAILED: 'danger',
  PENDING: 'pending',
}

function RunsDialog({ automation, onClose }: { automation: WaAutomation; onClose: () => void }) {
  const [page, setPage] = useState(1)
  const runs = useAdminQuery(
    () => adminApi.listWaAutomationRuns(automation.key, { page, pageSize: 20 }),
    [automation.key, page],
  )
  return (
    <Dialog open size="lg" onClose={onClose} title={`${automation.title} — activity`} subtitle="Every event it handled, newest first">
      {runs.error ? (
        <ErrorState message={runs.error} onRetry={runs.refresh} />
      ) : !runs.data ? (
        <Skeleton rows={5} />
      ) : runs.data.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nothing yet.</p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {runs.data.items.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">
                    {r.storeName ?? 'Store'}
                    {r.waId ? <span className="font-normal text-muted"> · {formatWaId(r.waId)}</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateTime(r.createdAt)}
                    {r.note ? ` · ${r.note}` : ''}
                  </p>
                </div>
                <Chip tone={RUN_TONE[r.status]}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Chip>
              </li>
            ))}
          </ul>
          {runs.data.meta.totalPages > 1 ? (
            <div className="mt-3 flex items-center justify-between">
              <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Newer
              </Button>
              <span className="text-xs text-muted">
                Page {page} of {runs.data.meta.totalPages}
              </span>
              <Button disabled={page >= runs.data.meta.totalPages} onClick={() => setPage(page + 1)}>
                Older
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Dialog>
  )
}
