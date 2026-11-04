import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, useParams } from 'react-router-dom'
import { copyToClipboard } from '../../../shared/share'
import { Button, Card, CardHeader, Chip, Detail, PageHeader } from '../../ui/primitives'
import {
  TEMPLATE_GROUPS,
  WA_ACCOUNT,
  WA_ERRORS,
  WA_SEND_RULES,
  WA_TEMPLATE_DOCS,
  sampleRequest,
} from './whatsappTemplateDocs'
import type { TemplateDoc } from './whatsappTemplateDocs'

/**
 * Documents → WhatsApp templates: a reference for every template on the
 * UnieMax WhatsApp account — what it says, who gets it, and what goes in each
 * {{n}}. Static (see `whatsappTemplateDocs.ts`); the live list with approval
 * status is WhatsApp → Templates.
 *
 * Two panes from `lg`: the list on the left, the chosen template on the right.
 * Below `lg` it is one pane at a time — the list, or the template with a link
 * back — so a phone never has to scroll past eleven rows to read one.
 */

const BASE = '/docs/whatsapp-templates'

export default function WhatsAppTemplateDocsPage() {
  const { name } = useParams<{ name?: string }>()
  const selected = name ? WA_TEMPLATE_DOCS.find((doc) => doc.name === name) : WA_TEMPLATE_DOCS[0]
  if (!selected) return <Navigate to={BASE} replace />

  return (
    <>
      <PageHeader
        title="WhatsApp templates"
        subtitle={`Reference for the ${WA_TEMPLATE_DOCS.length} message templates on the UnieMax WhatsApp Business account — the message, who gets it, and the values it needs.`}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className={`space-y-5 ${name ? 'hidden lg:block' : ''}`}>
          <TemplateList activeName={selected.name} />
          <AccountCard />
        </aside>
        <div className={name ? '' : 'hidden lg:block'}>
          <Link
            to={BASE}
            className="mb-3 inline-block text-sm font-medium text-muted hover:text-fg lg:hidden"
          >
            ← All templates
          </Link>
          <TemplateDetail doc={selected} />
        </div>
      </div>
    </>
  )
}

function TemplateList({ activeName }: { activeName: string }) {
  return (
    <Card padding="none" as="nav" className="py-2">
      {TEMPLATE_GROUPS.map((group) => (
        <div key={group} className="px-2 py-1">
          <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {group}
          </p>
          <ul className="space-y-0.5">
            {WA_TEMPLATE_DOCS.filter((doc) => doc.group === group).map((doc) => (
              <li key={doc.name}>
                <NavLink
                  to={`${BASE}/${doc.name}`}
                  className={`block rounded-md px-2 py-2 transition-colors ${
                    doc.name === activeName
                      ? 'bg-brand-soft text-fg'
                      : 'text-muted hover:bg-surface-alt hover:text-fg'
                  }`}
                >
                  <span className="block truncate font-mono text-sm">{doc.name}</span>
                  <span className="block truncate text-xs">
                    {doc.recipient} · {doc.params.length} values{doc.button ? ' · button' : ''}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  )
}

function AccountCard() {
  return (
    <Card>
      <CardHeader title="Account" subtitle="Templates only work from this account." />
      <dl>
        {WA_ACCOUNT.map((row) => (
          <Detail key={row.label} label={row.label}>
            <span className="font-mono text-xs">{row.value}</span>
          </Detail>
        ))}
      </dl>
    </Card>
  )
}

function TemplateDetail({ doc }: { doc: TemplateDoc }) {
  return (
    <div className="space-y-5">
      <Card padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-all font-mono text-lg font-semibold text-fg">{doc.name}</h2>
            <p className="mt-1 text-sm text-muted">
              Sent to the <strong className="font-medium text-fg">{doc.recipient.toLowerCase()}</strong>{' '}
              when: {doc.when.charAt(0).toLowerCase() + doc.when.slice(1)}.
            </p>
          </div>
          <CopyButton text={doc.name} label="Copy name" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip tone={doc.category === 'Marketing' ? 'warning' : 'info'}>{doc.category}</Chip>
          <Chip>Language: {doc.language}</Chip>
          <Chip>{doc.params.length} body values</Chip>
          <Chip>{doc.button ? 'URL button' : 'No button'}</Chip>
          <Chip tone="success">Active</Chip>
        </div>
        {doc.note ? (
          <p className="mt-4 rounded-md border border-line bg-surface-alt px-3 py-2 text-sm text-fg">
            {doc.note}
          </p>
        ) : null}
        <dl className="mt-4">
          <Detail label="Template ID">
            <span className="font-mono text-xs">{doc.templateId}</span>
          </Detail>
          <Detail label="Header">{doc.header ?? 'None'}</Detail>
          <Detail label="Footer">{doc.footer ?? 'None'}</Detail>
          <Detail label="Button">
            {doc.button ? `${doc.button.label} → ${doc.button.urlPrefix}{{1}}` : 'None'}
          </Detail>
        </dl>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Structure" subtitle="As approved in WhatsApp Manager." />
          <MessageBox doc={doc} />
        </Card>
        <Card>
          <CardHeader title="Sample" subtitle="Filled with the example values." />
          <MessageBox doc={doc} filled />
        </Card>
      </div>

      <Card padding="none">
        <CardHeader title="Parameters" subtitle="Send in this order." className="mb-0 p-4 sm:p-5" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-y border-line bg-surface-alt text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold sm:px-5">Var</th>
                <th className="px-4 py-2 font-semibold">Field</th>
                <th className="px-4 py-2 font-semibold">Key</th>
                <th className="px-4 py-2 font-semibold sm:pr-5">Example</th>
              </tr>
            </thead>
            <tbody>
              {doc.params.map((param) => (
                <tr key={param.slot} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-accent sm:px-5">{`{{${param.slot}}}`}</td>
                  <td className="px-4 py-2 text-fg">{param.field}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{param.key}</td>
                  <td className="break-all px-4 py-2 text-fg sm:pr-5">{param.example}</td>
                </tr>
              ))}
              {doc.button ? (
                <tr className="bg-surface-alt">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-accent sm:px-5">Button {'{{1}}'}</td>
                  <td className="px-4 py-2 text-fg">{doc.button.field}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">URL suffix</td>
                  <td className="break-all px-4 py-2 text-fg sm:pr-5">{doc.button.example}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="API request"
          subtitle="POST https://graph.facebook.com/{API_VERSION}/1297227253483920/messages"
          action={<CopyButton text={sampleRequest(doc)} label="Copy JSON" />}
        />
        <pre className="overflow-x-auto rounded-md border border-line bg-surface-alt p-3 font-mono text-xs leading-relaxed text-fg">
          {sampleRequest(doc)}
        </pre>
      </Card>

      <Card>
        <CardHeader title="Sending rules" subtitle="Apply to every template." />
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-fg">
          {WA_SEND_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
        <h3 className="mt-5 text-sm font-semibold text-fg">Common errors</h3>
        <dl className="mt-1">
          {WA_ERRORS.map((error) => (
            <Detail key={error.code} label={error.code}>
              <span className="font-normal">{error.meaning}</span>
            </Detail>
          ))}
        </dl>
      </Card>
    </div>
  )
}

/**
 * The message as WhatsApp lays it out. `filled` swaps each {{n}} for its
 * example (highlighted, so the eye still finds what changes per send);
 * otherwise the {{n}} itself is the highlight.
 */
function MessageBox({ doc, filled = false }: { doc: TemplateDoc; filled?: boolean }) {
  const parts = doc.body.split(/(\{\{\d+\}\})/)
  return (
    <div className="rounded-md border border-line bg-surface-alt p-3 text-sm text-fg">
      {doc.header ? <p className="mb-1 font-semibold">{doc.header}</p> : null}
      <p className="whitespace-pre-wrap break-words">
        {parts.map((part, index) => {
          const slot = /^\{\{(\d+)\}\}$/.exec(part)
          if (!slot) return part
          const value = filled
            ? doc.params.find((param) => param.slot === Number(slot[1]))?.example ?? part
            : part
          return (
            <span key={index} className="rounded bg-brand-soft px-1 font-medium text-accent">
              {value}
            </span>
          )
        })}
      </p>
      {doc.footer ? <p className="mt-2 text-xs text-muted">{doc.footer}</p> : null}
      {doc.button ? (
        <div className="mt-3 border-t border-line pt-2">
          <p className="font-medium text-accent">{doc.button.label}</p>
          <p className="break-all font-mono text-xs text-muted">
            {doc.button.urlPrefix}
            {filled ? doc.button.example : '{{1}}'}
          </p>
        </div>
      ) : null}
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
    <Button variant="ghost" onClick={() => void copyToClipboard(text).then(() => setCopied(true))}>
      {copied ? 'Copied' : label}
    </Button>
  )
}
