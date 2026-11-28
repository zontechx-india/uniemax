import { useEffect, useState } from 'react'
import { copyToClipboard } from '../../../shared/share'
import { policyApi, type PublicPolicy } from '../../../shared/policy/policyApi'
import { Alert } from '../../../shared/ui/Alert'
import { Button, Card, CardBody, CardHeader } from '../../ui/primitives'

/**
 * "For developers" — everything a developer needs to show a policy in an app:
 * the code, the public API addresses, a live sample of what the API returns
 * today, and the two-line frontend snippet (docs/policyhub/README.md §8a).
 *
 * The sample is read from the PUBLIC API, so it is exactly what an app gets.
 */

/** Where the API lives: `VITE_API_URL` when set, else this site (same origin). */
const API_ORIGIN = ((import.meta.env.VITE_API_URL as string | undefined) ?? window.location.origin).replace(/\/$/, '')

type Sample = { state: 'loading' } | { state: 'ready'; policy: PublicPolicy | null } | { state: 'error' }

export function PolicyDeveloperCard({ code }: { code: string }) {
  const [sample, setSample] = useState<Sample>({ state: 'loading' })
  const base = `${API_ORIGIN}/api/v1/policies/${encodeURIComponent(code)}`

  useEffect(() => {
    let live = true
    setSample({ state: 'loading' })
    policyApi
      .current(code)
      .then((policy) => live && setSample({ state: 'ready', policy }))
      .catch(() => live && setSample({ state: 'error' }))
    return () => {
      live = false
    }
  }, [code])

  const endpoints = [
    { label: 'Version in force', method: 'GET', url: base },
    { label: 'Version history', method: 'GET', url: `${base}/versions` },
    { label: 'One version', method: 'GET', url: `${base}/versions?version=1` },
  ]

  const snippet = `// frontend/src/shared/policy/
import { policyApi } from '../shared/policy/policyApi'
import { PolicyText } from '../shared/policy/PolicyText'

const policy = await policyApi.current('${code}') // null = not published yet
<PolicyText body={policy.body} />                  // body comes filled in`

  return (
    <Card padding="none">
      <CardHeader
        title="For developers"
        subtitle="How an app shows this policy. No login needed — the API returns published versions only."
      />
      <CardBody className="space-y-5">
        <Row label="Policy code" value={code} copyLabel="Copy code" />

        <div className="space-y-2">
          <p className="text-sm font-medium text-fg">API</p>
          <ul className="space-y-2">
            {endpoints.map((e) => (
              <li key={e.label} className="rounded-lg border border-line px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted">{e.label}</p>
                  <CopyButton text={e.url} label="Copy URL" />
                </div>
                <p className="font-mono text-xs text-fg wrap-anywhere">
                  <span className="text-muted">{e.method} </span>
                  {e.url}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-fg">What the API returns now</p>
          <SampleBlock sample={sample} />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-fg">Use it in our frontend</p>
            <CopyButton text={snippet} label="Copy code" />
          </div>
          <pre className="overflow-x-auto rounded-md border border-line bg-surface-alt p-3 font-mono text-xs leading-relaxed text-fg">
            {snippet}
          </pre>
        </div>

        <Alert tone="info" title="Connect once">
          The app always asks for the version in force, so publishing a new version needs no code change. If the app
          must remember what a user agreed to, save <code className="font-mono">version</code> with that record.
        </Alert>
      </CardBody>
    </Card>
  )
}

function SampleBlock({ sample }: { sample: Sample }) {
  if (sample.state === 'loading') return <p className="text-sm text-muted">Loading…</p>
  if (sample.state === 'error') return <Alert tone="danger">Could not reach the public API.</Alert>
  if (!sample.policy) {
    return (
      <Alert tone="warning">Nothing published yet — until a version is published, the API answers 404 (not found).</Alert>
    )
  }
  const { body, ...rest } = sample.policy
  const short = body.length > 160 ? `${body.slice(0, 160)}…` : body
  const json = JSON.stringify({ success: true, data: { ...rest, body: short } }, null, 2)
  return (
    <pre className="max-h-72 overflow-auto rounded-md border border-line bg-surface-alt p-3 font-mono text-xs leading-relaxed text-fg">
      {json}
    </pre>
  )
}

function Row({ label, value, copyLabel }: { label: string; value: string; copyLabel: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="font-mono text-sm text-fg">{value}</p>
      </div>
      <CopyButton text={value} label={copyLabel} />
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <Button
      variant="ghost"
      onClick={() =>
        void copyToClipboard(text)
          .then(() => setCopied(true))
          .catch(() => undefined)
      }
    >
      {copied ? 'Copied' : label}
    </Button>
  )
}
