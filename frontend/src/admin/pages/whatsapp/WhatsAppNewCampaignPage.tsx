import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert } from '../../../shared/ui/Alert'
import { showToast } from '../../../shared/ui/Toast'
import { adminApi } from '../../features/adminApi'
import type {
  WaAudience,
  WaCampaignDraft,
  WaCampaignPreview,
  WaMapping,
  WaRetargetFilter,
} from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  PageHeader,
  SelectInput,
  Skeleton,
  TextInput,
} from '../../ui/primitives'
import { formatCount } from '../../ui/format'
import { BackIcon } from '../../layout/icons'
import {
  AudienceEditor,
  AudienceSummary,
  DEFAULT_AUDIENCE,
  audienceComplete,
  fieldsFor,
  useAudiencePreview,
} from './audienceUi'
import {
  CategoryChip,
  MappingEditor,
  TemplatePicker,
  TemplatePreview,
  cleanMapping,
  defaultMapping,
  exampleFill,
  mappingProblem,
  plural,
  templateKey,
  useWaFields,
  useWaTemplates,
  useWhatsAppStatus,
} from './whatsappUi'

/**
 * New campaign — audience → message → rules → when → check → send.
 *
 * Nothing is sent until the last button; "Check" asks the server exactly
 * what would happen (who is skipped and why, three real filled-in messages),
 * and "Send me a test" delivers the first person's message to the admin's own
 * phone. `?retarget=<campaign>&filter=<…>` starts from an earlier campaign's
 * recipients; `?segment=<id>` from a saved segment.
 */

const CAPS = [
  { value: '0', label: 'No limit' },
  { value: '24', label: '24 hours' },
  { value: '48', label: '48 hours' },
  { value: '72', label: '3 days' },
  { value: '168', label: '7 days' },
]

/** "2026-10-14T18:30" (local) for a datetime-local input. */
function localInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function WhatsAppNewCampaignPage() {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const status = useWhatsAppStatus()
  const templates = useWaTemplates()
  const catalogue = useWaFields()

  const retarget = search.get('retarget')
  const retargetFilter = search.get('filter') as WaRetargetFilter | null
  const source = useAdminQuery(
    () => (retarget ? adminApi.getWaCampaign(retarget) : Promise.resolve(null)),
    [retarget],
  )

  const [name, setName] = useState('')
  const segmentId = search.get('segment')
  const [audience, setAudience] = useState<WaAudience>(
    retarget && retargetFilter
      ? { kind: 'campaign', campaignId: retarget, filter: retargetFilter }
      : segmentId
        ? { kind: 'segment', segmentId }
        : DEFAULT_AUDIENCE,
  )
  const [key, setKey] = useState('')
  const [mapping, setMapping] = useState<WaMapping | null>(null)
  const [requireOptIn, setRequireOptIn] = useState(false)
  const [cap, setCap] = useState('0')
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [scheduledAt, setScheduledAt] = useState(() => localInputValue(new Date(Date.now() + 60 * 60_000)))
  const [check, setCheck] = useState<WaCampaignPreview | null>(null)
  const [checking, setChecking] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [testing, setTesting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preview = useAudiencePreview(audience)
  const template = templates.data?.find((t) => templateKey(t) === key) ?? null
  const fields = fieldsFor(catalogue.data, preview.data, audience)

  // A retarget starts from the original campaign's template and values.
  useEffect(() => {
    const original = source.data
    if (!original || !templates.data) return
    setName((n) => n || `${original.name} — follow-up`)
    const match = templates.data.find(
      (t) => t.name === original.templateName && t.language === original.languageCode && t.sendable,
    )
    if (match && !key) {
      setKey(templateKey(match))
      setMapping(original.mapping ?? defaultMapping(match))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once both have loaded
  }, [source.data, templates.data])

  // Marketing → consent and a cap on by default; utility → off.
  useEffect(() => {
    if (!template) return
    const marketing = template.category === 'MARKETING'
    setRequireOptIn(marketing)
    setCap(marketing ? '48' : '0')
  }, [template?.name, template?.language, template?.category])

  // Any change invalidates the last check.
  const draftKey = JSON.stringify([name, audience, key, mapping, requireOptIn, cap, when, scheduledAt])
  useEffect(() => setCheck(null), [draftKey])

  const problem = useMemo(() => {
    if (!name.trim()) return 'Name the campaign'
    if (!audienceComplete(audience)) return 'Finish choosing the audience'
    if (!template || !mapping) return 'Choose a template'
    const m = mappingProblem(template, mapping)
    if (m) return m
    if (when === 'later' && !(new Date(scheduledAt).getTime() > Date.now())) {
      return 'Pick a time in the future'
    }
    return null
  }, [name, audience, template, mapping, when, scheduledAt])

  const draft = (): WaCampaignDraft => ({
    name: name.trim(),
    templateName: template!.name,
    languageCode: template!.language,
    audience,
    mapping: cleanMapping(mapping!),
    requireOptIn,
    frequencyCapHours: Number(cap),
    scheduledAt: when === 'later' ? new Date(scheduledAt).toISOString() : null,
  })

  const runCheck = async () => {
    setChecking(true)
    setError(null)
    try {
      setCheck(await adminApi.previewWaCampaign(draft()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check the campaign')
    } finally {
      setChecking(false)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    setError(null)
    try {
      const result = await adminApi.testWaCampaign({ ...draft(), to: testTo })
      showToast(`Test sent, using ${result.usedValuesOf}'s values`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the test')
    } finally {
      setTesting(false)
    }
  }

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await adminApi.createWaCampaign(draft())
      showToast(when === 'later' ? 'Campaign scheduled' : 'Campaign started')
      navigate(`/whatsapp/campaigns/${result.campaignId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the campaign')
    } finally {
      setBusy(false)
    }
  }

  if (status.data && !status.data.enabled) {
    return <Alert tone="warning" title="WhatsApp is not switched on for this server">Campaigns need the WhatsApp integration.</Alert>
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to="/whatsapp/campaigns"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
      >
        <BackIcon />
        Campaigns
      </Link>
      <PageHeader
        title="New campaign"
        subtitle="One approved template, filled in for each person, sent by the server at a safe pace"
      />

      <div className="space-y-4">
        <Card>
          <TextInput
            label="Campaign name"
            value={name}
            maxLength={120}
            placeholder="Finish your store — October"
            onChange={(event) => setName(event.target.value)}
            hint="Only admins see this."
          />
        </Card>

        <Card>
          <CardHeader title="1. Who" subtitle="The audience is looked up again when the campaign is created" />
          <div className="grid gap-5 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <AudienceEditor audience={audience} onChange={setAudience} />
            </div>
            <div className="lg:col-span-2">
              <AudienceSummary preview={preview.data} loading={preview.loading} error={preview.error} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="2. Message" subtitle="Fill each slot from the person's details — tap a field to insert it" />
          {templates.error ? (
            <ErrorState message={templates.error} onRetry={templates.refresh} />
          ) : !templates.data ? (
            <Skeleton rows={3} />
          ) : (
            <div className="space-y-4">
              <TemplatePicker
                templates={templates.data}
                value={key}
                onChange={(next) => {
                  setKey(next)
                  const t = templates.data?.find((x) => templateKey(x) === next)
                  setMapping(t ? defaultMapping(t) : null)
                }}
              />
              {template && mapping ? (
                <div className="grid gap-5 lg:grid-cols-2">
                  <MappingEditor
                    template={template}
                    mapping={mapping}
                    onChange={setMapping}
                    fields={fields}
                    allowTracking
                  />
                  <div className="space-y-2 lg:sticky lg:top-4 lg:self-start">
                    <div className="flex items-center gap-2">
                      <CategoryChip category={template.category} />
                      <span className="text-xs text-muted">with example values</span>
                    </div>
                    <TemplatePreview
                      template={template}
                      params={mapping.body.map((s) => exampleFill(s.value, fields))}
                      headerLink={mapping.header?.link ?? ''}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="3. Rules" />
          <div className="space-y-4">
            <label className="flex cursor-pointer items-start gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={requireOptIn}
                onChange={(event) => setRequireOptIn(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
              />
              <span>
                Only people who agreed to marketing messages
                <span className="block text-xs text-muted">
                  Meta requires consent for marketing templates. Messaging people who didn&apos;t
                  ask lowers your number&apos;s quality rating.
                </span>
              </span>
            </label>
            {template?.category === 'MARKETING' && !requireOptIn ? (
              <Alert tone="warning" title="Sending marketing without recorded consent">
                Only do this if these people agreed some other way (for example when they signed
                up). If many block or report the message, Meta can limit the number.
              </Alert>
            ) : null}
            <div className="max-w-xs">
              <SelectInput
                label="Skip anyone messaged by a campaign in the last"
                value={cap}
                onChange={(event) => setCap(event.target.value)}
                options={CAPS}
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="4. When" />
          <div className="flex flex-wrap items-end gap-3">
            <SelectInput
              label="Send"
              value={when}
              onChange={(event) => setWhen(event.target.value as 'now' | 'later')}
              options={[
                { value: 'now', label: 'Right away' },
                { value: 'later', label: 'At a set time' },
              ]}
            />
            {when === 'later' ? (
              <TextInput
                label="Date and time"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted">
            Sending can be paused or cancelled from the campaign&apos;s page at any time.
          </p>
        </Card>

        <Card>
          <CardHeader
            title="5. Check and send"
            subtitle="See exactly who gets it and who is skipped, before anything goes out"
          />
          <div className="space-y-4">
            <Button disabled={Boolean(problem) || checking} onClick={() => void runCheck()}>
              {checking ? 'Checking…' : check ? 'Check again' : 'Check campaign'}
            </Button>
            {problem ? <p className="text-sm text-muted">{problem}.</p> : null}
            {check ? <CheckResult check={check} /> : null}

            {check && check.eligible > 0 ? (
              <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
                <div className="min-w-0 flex-1 sm:max-w-xs">
                  <TextInput
                    label="Send a test to"
                    value={testTo}
                    inputMode="tel"
                    placeholder="Your WhatsApp number"
                    onChange={(event) => setTestTo(event.target.value)}
                  />
                </div>
                <Button
                  disabled={testing || testTo.replace(/\D/g, '').length < 7}
                  onClick={() => void sendTest()}
                  className="mb-px"
                >
                  {testing ? 'Sending…' : 'Send me a test'}
                </Button>
              </div>
            ) : null}

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <Button size="md" onClick={() => navigate('/whatsapp/campaigns')}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={!check || check.eligible === 0 || busy || Boolean(problem)}
                onClick={() => void create()}
              >
                {busy
                  ? 'Creating…'
                  : !check
                    ? 'Check first'
                    : when === 'later'
                      ? `Schedule for ${formatCount(check.eligible)}`
                      : `Send to ${formatCount(check.eligible)}`}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function CheckResult({ check }: { check: WaCampaignPreview }) {
  const skipped = Object.entries(check.skipped).sort((a, b) => b[1] - a[1])
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p>
          <span className="font-figure text-2xl font-bold text-fg">{formatCount(check.eligible)}</span>{' '}
          <span className="text-sm text-muted">will get the message</span>
        </p>
        <p className="text-sm text-muted">
          of {plural(check.total, 'person', 'people')} in the audience
        </p>
      </div>
      {skipped.length > 0 ? (
        <div>
          <p className="mb-1 text-sm font-medium text-fg">Skipped</p>
          <ul className="space-y-1 text-sm">
            {skipped.map(([reason, n]) => (
              <li key={reason} className="flex justify-between gap-3 text-muted">
                <span>{reason}</span>
                <span className="font-figure text-fg">{formatCount(n)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {check.sample.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-medium text-fg">What they will read</p>
          <ul className="grid gap-3 md:grid-cols-2">
            {check.sample.slice(0, 4).map((s) => (
              <li key={s.waId} className="rounded-lg border border-line bg-surface-alt p-3">
                <p className="mb-1 text-xs text-muted">{s.name ?? `+${s.waId}`}</p>
                <p className="whitespace-pre-wrap break-words text-sm text-fg">{s.body}</p>
                {s.buttons.map((b) => (
                  <p key={b.text} className="mt-1 truncate text-xs text-accent" title={b.url}>
                    {b.text} → {b.url}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
