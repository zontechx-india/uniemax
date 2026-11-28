import { useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { adminApi } from '../../features/adminApi'
import type { PolicyDetail, PolicyDraftInput, PolicyEvent, PolicyVersion } from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import { useAdminSession } from '../../app/adminSession'
import { Dialog } from '../../../shared/ui/Dialog'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Alert } from '../../../shared/ui/Alert'
import { FIELD_LABEL, fieldClass, fieldNoteClass } from '../../../shared/ui/field'
import { PolicyText } from '../../../shared/policy/PolicyText'
import {
  formatPolicyTime,
  POLICY_PLACEHOLDERS,
  renderPolicyBody,
  timeZoneLabel,
  type PolicySettings,
} from '../../../shared/policy/policyWording'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  ErrorState,
  PageHeader,
  SelectInput,
  Skeleton,
  TextInput,
} from '../../ui/primitives'
import type { ChipTone } from '../../ui/primitives'
import { formatDateTime } from '../../ui/format'
import { audienceLabel, POLICY_TEMPLATES } from './policyTemplates'

/**
 * One policy (PolicyHub, docs/policyhub/README.md): the version in force,
 * the draft editor with a live preview, every version ever published, and
 * the audit trail.
 *
 * Rules the page follows (the API enforces each one too):
 *   - a published version never changes; a change is a new draft version;
 *   - any admin edits the draft; only a super admin publishes;
 *   - times in the wording are {{placeholders}} filled from the settings, so
 *     the text and the numbers can't disagree;
 *   - a draft is never deleted — "Discard changes" resets it.
 */

const STATE: Record<PolicyVersion['state'], { label: string; tone: ChipTone }> = {
  CURRENT: { label: 'In force', tone: 'success' },
  SCHEDULED: { label: 'Scheduled', tone: 'info' },
  PAST: { label: 'Replaced', tone: 'neutral' },
  DRAFT: { label: 'Draft', tone: 'warning' },
}

const ACTION_LABEL: Record<PolicyEvent['action'], string> = {
  CREATED: 'Draft started',
  EDITED: 'Draft edited',
  RESET: 'Changes discarded',
  PUBLISHED: 'Published',
}

const FIELD_NAMES: Record<string, string> = {
  body: 'wording',
  changeSummary: 'change summary',
  changeReason: 'reason',
  settings: 'settings',
}

const SETTING_FIELDS = [
  { key: 'cutoff', label: 'Cutoff time', hint: 'Delivered before this → paid the same day.' },
  { key: 'windowStart', label: 'Transfers start', hint: 'When we start sending money.' },
  { key: 'windowEnd', label: 'Transfers end', hint: 'When the day’s transfers finish.' },
] as const

const TIMEZONES = [{ value: 'Asia/Kolkata', label: 'India — IST (Asia/Kolkata)' }]

export default function PolicyPage() {
  const { code = '' } = useParams()
  const { data, error, refresh } = useAdminQuery(() => adminApi.getPolicy(code), [code])

  if (error) return <ErrorState message={error} onRetry={refresh} />
  if (!data) return <Skeleton rows={10} />

  const current = data.versions.find((v) => v.state === 'CURRENT') ?? null
  const scheduled = data.versions.filter((v) => v.state === 'SCHEDULED').sort((a, b) => a.version - b.version)
  const draft = data.versions.find((v) => v.status === 'DRAFT') ?? null
  const published = data.versions.filter((v) => v.status === 'PUBLISHED')

  return (
    <>
      <PageHeader
        back={{ to: '/policies', label: 'Policies' }}
        title={data.name}
        badge={current ? <Chip tone="success">Version {current.version}</Chip> : <Chip>Not published</Chip>}
        subtitle={`${data.code} · For ${audienceLabel(data.audience).toLowerCase()}`}
      />
      <div className="space-y-4">
        {scheduled.map((v) => (
          <Alert key={v.id} tone="info" title={`Version ${v.version} starts ${formatDateTime(v.effectiveFrom)}`}>
            Until then readers see {current ? `version ${current.version}` : 'nothing'}. A published version can't be changed or
            cancelled — to undo it, publish another version after it.
          </Alert>
        ))}

        {draft ? (
          <DraftEditor key={`${draft.id}:${draft.updatedAt}`} policy={data} draft={draft} onChanged={refresh} />
        ) : (
          <StartDraftCard policy={data} current={current} onChanged={refresh} />
        )}

        <CurrentCard current={current} />
        <HistoryCard versions={published} />
        <ActivityCard events={data.events} />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// In force now
// ---------------------------------------------------------------------------

function SettingsLine({ settings }: { settings: PolicySettings | null }) {
  if (!settings?.cutoff) return null
  const tz = settings.timezone ? timeZoneLabel(settings.timezone) : ''
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip>Cutoff {formatPolicyTime(settings.cutoff)} {tz}</Chip>
      {settings.windowStart && settings.windowEnd ? (
        <Chip>
          Transfers {formatPolicyTime(settings.windowStart)} – {formatPolicyTime(settings.windowEnd)} {tz}
        </Chip>
      ) : null}
    </div>
  )
}

function CurrentCard({ current }: { current: PolicyVersion | null }) {
  return (
    <Card padding="none">
      <CardHeader
        title="What readers see now"
        subtitle={
          current
            ? `Version ${current.version} · in force since ${formatDateTime(current.effectiveFrom)}`
            : 'Nothing yet — publish a version first.'
        }
      />
      {current ? (
        <CardBody className="space-y-3">
          <SettingsLine settings={current.settings} />
          <PolicyText body={current.renderedBody} className="text-sm" />
        </CardBody>
      ) : null}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

function StartDraftCard({
  policy,
  current,
  onChanged,
}: {
  policy: PolicyDetail
  current: PolicyVersion | null
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const next = (policy.versions[0]?.version ?? 0) + 1

  async function start() {
    setBusy(true)
    setStartError(null)
    try {
      await adminApi.startPolicyDraft(policy.code)
      onChanged()
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not start a draft')
      setBusy(false)
    }
  }

  return (
    <Card padding="none">
      <CardHeader
        title="Make a change"
        subtitle={`Start version ${next}${current ? ` as a copy of version ${current.version}` : ''}. Readers keep seeing the current version until the new one is published.`}
        action={
          <Button variant="primary" loading={busy} onClick={() => void start()}>
            Start version {next}
          </Button>
        }
      />
      {startError ? (
        <CardBody>
          <Alert tone="danger">{startError}</Alert>
        </CardBody>
      ) : null}
    </Card>
  )
}

interface Form {
  body: string
  changeSummary: string
  changeReason: string
  settings: PolicySettings | null
}

function formOf(draft: PolicyVersion): Form {
  return {
    body: draft.body,
    changeSummary: draft.changeSummary ?? '',
    changeReason: draft.changeReason ?? '',
    settings: draft.settings,
  }
}

/** Only the fields that changed, in the API's shape (empty text → null). */
function changes(saved: Form, form: Form): PolicyDraftInput {
  const out: PolicyDraftInput = {}
  if (form.body !== saved.body) out.body = form.body
  if (form.changeSummary.trim() !== saved.changeSummary.trim()) out.changeSummary = form.changeSummary.trim() || null
  if (form.changeReason.trim() !== saved.changeReason.trim()) out.changeReason = form.changeReason.trim() || null
  if (JSON.stringify(form.settings) !== JSON.stringify(saved.settings)) out.settings = form.settings
  return out
}

function DraftEditor({
  policy,
  draft,
  onChanged,
}: {
  policy: PolicyDetail
  draft: PolicyVersion
  onChanged: () => void
}) {
  const { isSuperAdmin } = useAdminSession()
  const saved = useMemo(() => formOf(draft), [draft])
  const [form, setForm] = useState<Form>(saved)
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const template = POLICY_TEMPLATES[policy.code]
  const placeholders = POLICY_PLACEHOLDERS[policy.code] ?? []
  const pending = changes(saved, form)
  const dirty = Object.keys(pending).length > 0
  const needsReason = draft.version > 1
  const settings = form.settings
  const windowBad = !!settings?.windowStart && !!settings.windowEnd && settings.windowStart >= settings.windowEnd
  const preview = renderPolicyBody(form.body, settings)
  const canPublish = !dirty && draft.problems.length === 0

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
  const setSetting = (key: string, value: string) =>
    setForm((f) => ({ ...f, settings: { ...(f.settings ?? template?.settings ?? {}), [key]: value } }))

  /** Puts {{name}} where the cursor is in the wording. */
  function insert(name: string) {
    const el = bodyRef.current
    const token = `{{${name}}}`
    const start = el?.selectionStart ?? form.body.length
    const end = el?.selectionEnd ?? form.body.length
    set('body', form.body.slice(0, start) + token + form.body.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  async function save() {
    setBusy('save')
    setSaveError(null)
    try {
      await adminApi.updatePolicyDraft(policy.code, pending)
      onChanged()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the draft')
      setBusy(null)
    }
  }

  async function reset() {
    setBusy('reset')
    setSaveError(null)
    try {
      await adminApi.resetPolicyDraft(policy.code)
      setConfirmReset(false)
      onChanged()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not discard the changes')
      setBusy(null)
      setConfirmReset(false)
    }
  }

  return (
    <Card padding="none">
      <CardHeader
        title={
          <>
            Draft · version {draft.version} <Chip tone="warning">Not published</Chip>
          </>
        }
        subtitle={`Last saved ${formatDateTime(draft.updatedAt)}. Only you and other admins see it.`}
      />
      <CardBody className="space-y-5">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ---- Form ---- */}
          <div className="min-w-0 space-y-4">
            {policy.hasSettings ? (
              <fieldset className="space-y-3">
                <legend className={FIELD_LABEL}>Payout times</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {SETTING_FIELDS.map((field) => (
                    <TextInput
                      key={field.key}
                      type="time"
                      label={field.label}
                      value={settings?.[field.key] ?? ''}
                      onChange={(e) => setSetting(field.key, e.target.value)}
                      hint={field.hint}
                    />
                  ))}
                </div>
                {windowBad ? <p className={fieldNoteClass(true)}>Transfers must start before they end.</p> : null}
                <SelectInput
                  label="Timezone"
                  value={settings?.timezone ?? 'Asia/Kolkata'}
                  onChange={(e) => setSetting('timezone', e.target.value)}
                  options={TIMEZONES}
                />
              </fieldset>
            ) : null}

            <div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <label htmlFor="policy-body" className={FIELD_LABEL}>
                  Wording
                </label>
                {template && !form.body.trim() ? (
                  <Button
                    variant="ghost"
                    onClick={() => setForm((f) => ({ ...f, body: template.body, settings: f.settings ?? template.settings }))}
                  >
                    Use the approved wording
                  </Button>
                ) : null}
              </div>
              <textarea
                id="policy-body"
                ref={bodyRef}
                rows={16}
                value={form.body}
                onChange={(e) => set('body', e.target.value)}
                className={fieldClass({ dense: true, multiline: true, className: 'resize-y font-mono text-xs leading-relaxed' })}
              />
              <p className={fieldNoteClass()}>
                **bold**, a line starting with "- " is a bullet, a line that is only **bold** is a heading.
              </p>
              {placeholders.length > 0 ? (
                <div className="mt-2 rounded-lg border border-line bg-surface-alt px-3 py-2.5">
                  <p className="text-xs text-muted">
                    Never type the times — insert them, so the wording always matches the payout times above:
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {placeholders.map((p) => (
                      <Button key={p.name} onClick={() => insert(p.name)} title={`Inserts {{${p.name}}}`}>
                        + {p.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <TextInput
              label={needsReason ? 'What changed (shown to readers)' : 'What changed (optional for version 1)'}
              value={form.changeSummary}
              onChange={(e) => set('changeSummary', e.target.value)}
              maxLength={500}
              hint="One short line, e.g. “Cutoff moved to 5 PM”."
            />
            <TextInput
              label={needsReason ? 'Why (admins only)' : 'Why (admins only, optional for version 1)'}
              value={form.changeReason}
              onChange={(e) => set('changeReason', e.target.value)}
              maxLength={1000}
            />
          </div>

          {/* ---- Preview ---- */}
          <div className="min-w-0">
            <p className={FIELD_LABEL}>Preview — what readers will see</p>
            <div className="space-y-3 rounded-lg border border-line bg-surface px-4 py-3">
              <SettingsLine settings={settings} />
              <PolicyText body={preview} className="text-sm" />
            </div>
          </div>
        </div>

        {/* ---- Status + actions ---- */}
        {saveError ? <Alert tone="danger">{saveError}</Alert> : null}
        {dirty ? (
          <Alert tone="info">You have unsaved changes. Save them to check the draft for publishing.</Alert>
        ) : draft.problems.length > 0 ? (
          <Alert tone="warning" title="Before this can be published">
            <ul className="list-disc pl-5">
              {draft.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Alert>
        ) : (
          <Alert tone="success">Ready to publish.{isSuperAdmin ? '' : ' Ask a super admin to publish it.'}</Alert>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button
            variant={dirty ? 'primary' : 'secondary'}
            size="md"
            disabled={!dirty || windowBad || busy !== null}
            loading={busy === 'save'}
            onClick={() => void save()}
          >
            Save draft
          </Button>
          {isSuperAdmin ? (
            <Button
              variant={dirty ? 'secondary' : 'primary'}
              size="md"
              disabled={!canPublish || busy !== null}
              title={canPublish ? undefined : dirty ? 'Save the draft first' : 'Fix the points above first'}
              onClick={() => setPublishing(true)}
            >
              Publish version {draft.version}…
            </Button>
          ) : (
            <span className="text-sm text-muted">Only a super admin can publish.</span>
          )}
          <Button variant="ghost" className="sm:ml-auto" disabled={busy !== null} onClick={() => setConfirmReset(true)}>
            Discard changes
          </Button>
        </div>
      </CardBody>

      <ConfirmDialog
        open={confirmReset}
        title="Discard the draft's changes?"
        description={
          policy.current
            ? `The draft goes back to a copy of version ${policy.current.version}. Unsaved edits are lost too. The draft itself stays.`
            : 'The draft goes back to empty. Unsaved edits are lost too.'
        }
        confirmLabel="Discard changes"
        busy={busy === 'reset'}
        onConfirm={() => void reset()}
        onCancel={() => setConfirmReset(false)}
      />
      {publishing ? (
        <PublishDialog
          policy={policy}
          draft={draft}
          onClose={() => setPublishing(false)}
          onPublished={() => {
            setPublishing(false)
            onChanged()
          }}
        />
      ) : null}
    </Card>
  )
}

function PublishDialog({
  policy,
  draft,
  onClose,
  onPublished,
}: {
  policy: PolicyDetail
  draft: PolicyVersion
  onClose: () => void
  onPublished: () => void
}) {
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [startsAt, setStartsAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const whenOk = when === 'now' || (startsAt !== '' && new Date(startsAt) > new Date())

  async function publish() {
    setBusy(true)
    setPublishError(null)
    try {
      await adminApi.publishPolicyDraft(policy.code, when === 'now' ? {} : { effectiveFrom: new Date(startsAt).toISOString() })
      onPublished()
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Could not publish')
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title={`Publish version ${draft.version}`}
      subtitle={`${policy.name} (${policy.code})`}
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <>
          {publishError ? <p className="mr-auto text-sm text-danger">{publishError}</p> : null}
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" disabled={!whenOk} loading={busy} onClick={() => void publish()}>
            Publish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="warning">
          Once published, version {draft.version} can never be edited or deleted. A later change needs a new version.
        </Alert>
        <SelectInput
          label="Starts"
          value={when}
          onChange={(e) => setWhen(e.target.value as 'now' | 'later')}
          options={[
            { value: 'now', label: 'Now' },
            { value: 'later', label: 'On a date I choose' },
          ]}
        />
        {when === 'later' ? (
          <TextInput
            label="Start date and time"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            hint={whenOk ? 'Your computer’s time (India time on office machines).' : 'Pick a time in the future.'}
            aria-invalid={!whenOk}
          />
        ) : null}
        <p className="text-sm text-muted">
          Payouts for orders delivered from then on are made under version {draft.version}; payouts for orders delivered
          earlier keep the version they were delivered under.
        </p>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// History + activity
// ---------------------------------------------------------------------------

function HistoryCard({ versions }: { versions: PolicyVersion[] }) {
  return (
    <Card padding="none">
      <CardHeader title="Versions" count={versions.length} subtitle="Every published version, kept forever." />
      {versions.length === 0 ? (
        <CardBody>
          <p className="text-sm text-muted">Nothing published yet.</p>
        </CardBody>
      ) : (
        <ul className="divide-y divide-line">
          {versions.map((v) => (
            <li key={v.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-fg">Version {v.version}</p>
                <Chip tone={STATE[v.state].tone}>{STATE[v.state].label}</Chip>
              </div>
              <p className="mt-0.5 text-xs text-muted wrap-anywhere">
                From {formatDateTime(v.effectiveFrom)}
                {v.effectiveTo ? ` until ${formatDateTime(v.effectiveTo)}` : ''}
                {v.publishedByEmail ? ` · published by ${v.publishedByEmail}` : ''}
              </p>
              {v.changeSummary ? <p className="mt-1 text-sm text-fg">{v.changeSummary}</p> : null}
              {v.changeReason ? <p className="text-xs text-muted">Why: {v.changeReason}</p> : null}
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-accent hover:underline">Show wording</summary>
                <div className="mt-2 space-y-3 rounded-lg border border-line px-4 py-3">
                  <SettingsLine settings={v.settings} />
                  <PolicyText body={v.renderedBody} className="text-sm" />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ActivityCard({ events }: { events: PolicyEvent[] }) {
  return (
    <Card padding="none">
      <CardHeader title="Activity" subtitle="Who did what — kept forever." />
      {events.length === 0 ? (
        <CardBody>
          <p className="text-sm text-muted">No activity yet.</p>
        </CardBody>
      ) : (
        <ul className="divide-y divide-line">
          {events.map((e) => {
            const fields = e.action === 'EDITED' && e.after ? Object.keys(e.after).map((k) => FIELD_NAMES[k] ?? k) : []
            return (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5">
                <p className="min-w-0 text-sm text-fg">
                  <span className="font-medium">{ACTION_LABEL[e.action]}</span>
                  {e.version ? <span className="text-muted"> · version {e.version}</span> : null}
                  {fields.length ? <span className="text-muted"> · {fields.join(', ')}</span> : null}
                  {e.note ? <span className="block text-xs text-muted">{e.note}</span> : null}
                </p>
                <p className="text-xs text-muted wrap-anywhere">
                  {e.actorEmail} · {formatDateTime(e.createdAt)}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
