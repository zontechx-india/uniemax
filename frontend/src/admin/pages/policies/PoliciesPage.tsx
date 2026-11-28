import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminApi } from '../../features/adminApi'
import type { PolicySummary } from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import { useAdminSession } from '../../app/adminSession'
import { Dialog } from '../../../shared/ui/Dialog'
import { Button, Card, Chip, EmptyState, ErrorState, PageHeader, SelectInput, Skeleton, TextInput } from '../../ui/primitives'
import { Icon } from '../../layout/icons'
import { formatDateTime } from '../../ui/format'
import { AUDIENCES, audienceLabel, POLICY_TEMPLATES } from './policyTemplates'

/**
 * Policies — the rules UnieMax publishes for sellers and customers
 * (PolicyHub, docs/policyhub/README.md). One row per policy with where it
 * stands: the version in force, a scheduled one, an open draft. Opening a
 * row edits it. Only a super admin creates a policy (the API enforces it).
 */

export default function PoliciesPage() {
  const { isSuperAdmin } = useAdminSession()
  const { data, loading, error, refresh } = useAdminQuery(() => adminApi.listPolicies(), [])
  const [creating, setCreating] = useState<string | null>(null)

  const missingPayout = data && !data.some((p) => p.code === 'PYO-001')

  return (
    <>
      <PageHeader
        title="Policies"
        subtitle="Rules we publish for sellers and customers. A change is a new version — a published version never changes."
        actions={
          isSuperAdmin && data && data.length > 0 ? (
            <Button onClick={() => setCreating('')}>New policy</Button>
          ) : null
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : !data || loading ? (
        <Skeleton rows={4} />
      ) : data.length === 0 ? (
        <Card>
          <EmptyState
            title="No policies yet"
            description={
              isSuperAdmin
                ? 'Start with the seller payout policy — when sellers get paid. You write it, check the preview, then publish.'
                : 'A super admin creates policies. Once one exists you can edit its drafts here.'
            }
            action={
              isSuperAdmin ? (
                <Button variant="primary" size="md" onClick={() => setCreating('PYO-001')}>
                  Create the seller payout policy
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          <Card padding="none" as="ul" className="divide-y divide-line">
            {data.map((policy) => (
              <PolicyRow key={policy.code} policy={policy} />
            ))}
          </Card>
          {isSuperAdmin && missingPayout ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              The seller payout policy (PYO-001) doesn't exist yet.
              <Button variant="ghost" onClick={() => setCreating('PYO-001')}>
                Create it
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {creating !== null ? (
        <CreateDialog initialCode={creating} onClose={() => setCreating(null)} />
      ) : null}
    </>
  )
}

function PolicyRow({ policy }: { policy: PolicySummary }) {
  return (
    <li>
      <Link
        to={`/policies/${policy.code}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-alt focus-visible:bg-surface-alt"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-fg">{policy.name}</p>
          <p className="text-xs text-muted">
            {policy.code} · For {audienceLabel(policy.audience).toLowerCase()}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {policy.current ? (
              <Chip tone="success">Version {policy.current.version} in force</Chip>
            ) : (
              <Chip>Not published</Chip>
            )}
            {policy.scheduled ? (
              <Chip tone="info">
                Version {policy.scheduled.version} starts {formatDateTime(policy.scheduled.effectiveFrom)}
              </Chip>
            ) : null}
            {policy.draft ? <Chip tone="warning">Draft version {policy.draft.version}</Chip> : null}
          </div>
        </div>
        <Icon name="chevron" size={16} />
      </Link>
    </li>
  )
}

function CreateDialog({ initialCode, onClose }: { initialCode: string; onClose: () => void }) {
  const navigate = useNavigate()
  const template = POLICY_TEMPLATES[initialCode]
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState(template?.name ?? '')
  const [audience, setAudience] = useState(template?.audience ?? 'seller')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const cleanCode = code.trim().toUpperCase()
  const codeOk = /^[A-Z][A-Z0-9-]{1,19}$/.test(cleanCode)
  const nameOk = name.trim().length >= 2
  const canSave = codeOk && nameOk && !busy

  function changeCode(value: string) {
    setCode(value)
    const known = POLICY_TEMPLATES[value.trim().toUpperCase()]
    if (known && !name.trim()) {
      setName(known.name)
      setAudience(known.audience)
    }
  }

  async function save() {
    setBusy(true)
    setSaveError(null)
    try {
      const created = await adminApi.createPolicy({ code: cleanCode, name: name.trim(), audience })
      navigate(`/policies/${created.code}`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not create the policy')
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title="New policy"
      subtitle="It starts as an empty draft. Nothing is shown to anyone until a super admin publishes it."
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <>
          {saveError ? <p className="mr-auto text-sm text-danger">{saveError}</p> : null}
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" disabled={!canSave} loading={busy} onClick={() => void save()}>
            Create policy
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextInput
          label="Code"
          value={code}
          onChange={(e) => changeCode(e.target.value)}
          hint={codeOk || !code ? 'Never changes. Capitals, digits and dashes, e.g. PYO-001.' : 'Use capitals, digits and dashes (2–20), e.g. PYO-001.'}
          aria-invalid={!!code && !codeOk}
          autoCapitalize="characters"
        />
        <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} hint="Shown to readers as the title." />
        <SelectInput label="Who it is for" value={audience} onChange={(e) => setAudience(e.target.value)} options={AUDIENCES} />
      </div>
    </Dialog>
  )
}
