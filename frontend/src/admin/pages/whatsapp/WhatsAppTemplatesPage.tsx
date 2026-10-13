import { useState } from 'react'
import { Dialog } from '../../../shared/ui/Dialog'
import { adminApi } from '../../features/adminApi'
import type { WaTemplate } from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import { Button, Chip, Detail } from '../../ui/primitives'
import type { ChipTone } from '../../ui/primitives'
import { DataTable } from '../../ui/DataTable'
import type { Column } from '../../ui/DataTable'
import { TemplatePreview, WhatsAppShell, templateKey } from './whatsappUi'

/**
 * Templates — read-only, straight from Meta (the backend caches the list for
 * a minute; "Refresh" skips the cache). Templates are created and approved in
 * WhatsApp Manager, not here: this tab answers "what can I send, and why
 * can't I send that one?".
 */

const STATUS_TONE: Record<string, ChipTone> = {
  APPROVED: 'success',
  PENDING: 'pending',
  IN_APPEAL: 'pending',
  REJECTED: 'danger',
  DISABLED: 'danger',
  PAUSED: 'warning',
}

const titleCase = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ')

export default function WhatsAppTemplatesPage() {
  const [refreshing, setRefreshing] = useState(false)
  const [open, setOpen] = useState<WaTemplate | null>(null)
  const [forceRefresh, setForceRefresh] = useState(0)
  const templates = useAdminQuery(
    () => adminApi.listWaTemplates(forceRefresh > 0).finally(() => setRefreshing(false)),
    [forceRefresh],
  )

  const columns: Column<WaTemplate>[] = [
    {
      header: 'Template',
      primary: true,
      cell: (t) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{t.name}</p>
          <p className="truncate text-xs text-muted">{t.language}</p>
        </div>
      ),
    },
    {
      header: 'Message',
      hideOnMobile: true,
      cell: (t) => (
        <p className="max-w-md truncate text-sm text-muted" title={t.body}>
          {t.body}
        </p>
      ),
    },
    {
      header: 'Category',
      cell: (t) => <span className="text-sm">{t.category ? titleCase(t.category) : '—'}</span>,
    },
    {
      header: 'Values',
      className: 'text-right',
      cell: (t) => <span className="text-sm">{t.paramCount}</span>,
    },
    {
      header: 'Status',
      cell: (t) => <Chip tone={STATUS_TONE[t.status] ?? 'neutral'}>{titleCase(t.status)}</Chip>,
    },
    {
      header: 'Send from here',
      cell: (t) =>
        t.sendable ? (
          <Chip tone="success">Yes</Chip>
        ) : (
          <span className="text-sm text-muted" title={t.reason ?? undefined}>
            No
          </span>
        ),
    },
  ]

  return (
    <WhatsAppShell
      actions={
        <Button
          disabled={refreshing || templates.loading}
          onClick={() => {
            setRefreshing(true)
            setForceRefresh((n) => n + 1)
          }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh from Meta'}
        </Button>
      }
    >
      {() => (
        <>
          <DataTable
            rows={templates.data ?? []}
            columns={columns}
            rowKey={templateKey}
            loading={templates.loading}
            error={templates.error}
            onRetry={templates.refresh}
            onRowClick={setOpen}
            empty={{
              title: 'No templates on this WhatsApp account',
              hint: 'Create one in WhatsApp Manager → Message templates. Approved templates appear here and in the pickers.',
            }}
          />
          <Dialog
            open={open !== null}
            onClose={() => setOpen(null)}
            title={open?.name ?? ''}
            subtitle={open ? `${open.language} · ${open.category ? titleCase(open.category) : 'No category'}` : null}
          >
            {open ? (
              <div className="space-y-4 pb-1">
                <TemplatePreview template={open} params={[]} />
                <dl>
                  <Detail label="Status">
                    <Chip tone={STATUS_TONE[open.status] ?? 'neutral'}>{titleCase(open.status)}</Chip>
                  </Detail>
                  <Detail label="Values needed">{open.paramCount}</Detail>
                  <Detail label="Send from the console">{open.sendable ? 'Yes' : 'No'}</Detail>
                </dl>
                {open.reason ? <p className="text-sm text-muted">{open.reason}</p> : null}
              </div>
            ) : null}
          </Dialog>
        </>
      )}
    </WhatsAppShell>
  )
}
