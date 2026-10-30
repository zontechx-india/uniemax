import { ChipInput } from '../../../shared/ui/ChipInput'
import { Select, TextField } from '../../../shared/ui/form'
import { FIELD_LABEL } from '../../../shared/ui/field'
import { Button } from '../../../shared/ui/Button'
import {
  MAX_CUSTOM_FIELD_CHOICES,
  MAX_CUSTOM_FIELDS,
} from '../../features/stores/storesApi'
import type {
  CheckoutCustomField,
  CustomFieldSection,
  CustomFieldType,
} from '../../features/stores/storesApi'
import { ArrowUpIcon, ClipboardIcon, PlusIcon, TrashIcon } from '../../layout/icons'
import { BigSwitch } from './ui/BigSwitch'
import { GlassCard } from './ui/GlassCard'

/**
 * "Your own questions" on the Checkout page — extra things the seller's
 * checkout asks, beyond the fixed fields: Post Office, Tehsil and District
 * for village deliveries, a GST number, a preferred delivery time…
 *
 * Built for sellers with no training: one tap adds a ready-made question
 * (already titled and explained, rename it if your area says "Taluka"),
 * every question shows a live preview of what the customer will see, and a
 * problem is named on the question that has it. Saved with the page's
 * SaveBar like the switches above.
 */

const PRESETS: Omit<CheckoutCustomField, 'id'>[] = [
  {
    label: 'Post Office',
    description: 'Your nearest post office — needed for village deliveries.',
    type: 'TEXT',
    section: 'DELIVERY',
    required: true,
    choices: [],
  },
  {
    label: 'Tehsil',
    description: 'Also called Taluka, Mandal or Block.',
    type: 'TEXT',
    section: 'DELIVERY',
    required: false,
    choices: [],
  },
  {
    label: 'District',
    description: null,
    type: 'TEXT',
    section: 'DELIVERY',
    required: true,
    choices: [],
  },
  {
    label: 'Landmark',
    description: 'Near a temple, school or shop — helps the delivery person.',
    type: 'TEXT',
    section: 'DELIVERY',
    required: false,
    choices: [],
  },
]

const TYPE_LABELS: Record<CustomFieldType, string> = {
  TEXT: 'Text — words and numbers',
  NUMBER: 'Number only',
  CHOICE: 'Pick from a list',
}

/** Short random id — answers are keyed by it, so renames keep them. */
function newId(): string {
  return `q${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

/** What blocks saving a question, by question id. Empty = all fine. */
export function customQuestionProblems(
  fields: CheckoutCustomField[],
): Record<string, string> {
  const problems: Record<string, string> = {}
  for (const field of fields) {
    if (!field.label.trim()) problems[field.id] = 'Give this question a title.'
    else if (field.type === 'CHOICE' && field.choices.length < 2) {
      problems[field.id] = 'Add at least 2 options for the customer to pick from.'
    }
  }
  return problems
}

export function CustomQuestionsCard({
  fields,
  onChange,
  disabled,
  showProblems,
  pickupOnly,
}: {
  fields: CheckoutCustomField[]
  onChange: (next: CheckoutCustomField[]) => void
  disabled: boolean
  /** True after a save attempt — problems show only once it matters. */
  showProblems: boolean
  /** The store never delivers — "only when I deliver" questions never show. */
  pickupOnly: boolean
}) {
  const problems = showProblems ? customQuestionProblems(fields) : {}
  const full = fields.length >= MAX_CUSTOM_FIELDS
  const taken = new Set(fields.map((f) => f.label.trim().toLowerCase()))
  const presets = PRESETS.filter((p) => !taken.has(p.label.toLowerCase()))

  const update = (id: string, patch: Partial<CheckoutCustomField>) =>
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  const remove = (id: string) => onChange(fields.filter((f) => f.id !== id))
  const moveUp = (index: number) => {
    if (index === 0) return
    const next = [...fields]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    onChange(next)
  }
  const add = (preset?: Omit<CheckoutCustomField, 'id'>) =>
    onChange([
      ...fields,
      {
        id: newId(),
        ...(preset ?? {
          label: '',
          description: null,
          type: 'TEXT',
          section: 'DELIVERY',
          required: false,
          choices: [],
        }),
        // A pickup-only shop never asks delivery questions — ask on every order.
        ...(pickupOnly ? { section: 'CONTACT' as const } : {}),
      },
    ])

  return (
    <GlassCard
      icon={ClipboardIcon}
      title="Your own questions"
      description="Need more details to deliver? Add your own questions. For villages, add Post Office, Tehsil and District so the parcel reaches the right place."
    >
      <div className="space-y-4">
        {fields.map((field, index) => (
          <QuestionEditor
            key={field.id}
            field={field}
            number={index + 1}
            problem={problems[field.id] ?? null}
            disabled={disabled}
            pickupOnly={pickupOnly}
            onChange={(patch) => update(field.id, patch)}
            onRemove={() => remove(field.id)}
            onMoveUp={index > 0 ? () => moveUp(index) : null}
          />
        ))}

        {full ? (
          <p className="text-sm text-muted">
            You have {MAX_CUSTOM_FIELDS} questions — the most a checkout can ask.
            Remove one to add another.
          </p>
        ) : (
          <div className="space-y-2.5">
            {presets.length > 0 && (
              <>
                <p className="text-sm font-semibold text-fg">
                  {fields.length === 0 ? 'Add with one tap' : 'Add more'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {presets.map((preset) => (
                    <Button
                      type="button"
                      key={preset.label}
                      variant="secondary"
                      size="sm"
                      disabled={disabled}
                      onClick={() => add(preset)}
                    >
                      <PlusIcon className="h-4 w-4" />
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </>
            )}
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => add()}>
              <PlusIcon className="h-4 w-4" />
              Write my own question
            </Button>
          </div>
        )}
      </div>
    </GlassCard>
  )
}

function QuestionEditor({
  field,
  number,
  problem,
  disabled,
  pickupOnly,
  onChange,
  onRemove,
  onMoveUp,
}: {
  field: CheckoutCustomField
  number: number
  problem: string | null
  disabled: boolean
  pickupOnly: boolean
  onChange: (patch: Partial<CheckoutCustomField>) => void
  onRemove: () => void
  onMoveUp: (() => void) | null
}) {
  const titleProblem = problem && !field.label.trim() ? problem : undefined
  const choicesProblem = problem && field.label.trim() ? problem : null

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-3 flex items-center gap-2">
        <p className="min-w-0 flex-1 whitespace-nowrap text-sm font-semibold text-muted">
          Question {number}
        </p>
        {onMoveUp && (
          <Button
            type="button"
            variant="ghost"
            onClick={onMoveUp}
            disabled={disabled}
            aria-label={`Move question ${number} up`}
            className="px-3"
          >
            <ArrowUpIcon className="h-4 w-4" />
            Up
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove question ${number}`}
          className="px-3"
        >
          <TrashIcon className="h-4 w-4" />
          Remove
        </Button>
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Title"
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="e.g. Post Office"
            maxLength={40}
            disabled={disabled}
            error={titleProblem}
          />
          <TextField
            label="Help text (optional)"
            value={field.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value || null })}
            placeholder="e.g. A hint shown under the title"
            maxLength={120}
            disabled={disabled}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={FIELD_LABEL}>Answer type</span>
            <Select
              value={field.type}
              disabled={disabled}
              className="h-12"
              onChange={(e) => onChange({ type: e.target.value as CustomFieldType })}
            >
              {(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </label>
          {!pickupOnly && (
            <label className="block">
              <span className={FIELD_LABEL}>When to ask</span>
              <Select
                value={field.section}
                disabled={disabled}
                className="h-12"
                onChange={(e) =>
                  onChange({ section: e.target.value as CustomFieldSection })
                }
              >
                <option value="DELIVERY">Only when I deliver</option>
                <option value="CONTACT">On every order (pickup too)</option>
              </Select>
            </label>
          )}
        </div>

        {field.type === 'CHOICE' && (
          <div>
            <ChipInput
              label="Options the customer picks from"
              items={field.choices.map((choice) => ({ key: choice, value: choice }))}
              onAdd={(value) => onChange({ choices: [...field.choices, value] })}
              onRemove={(key) => onChange({ choices: field.choices.filter((c) => c !== key) })}
              onRename={(key, value) =>
                onChange({ choices: field.choices.map((c) => (c === key ? value : c)) })
              }
              placeholder="Type an option and press Enter"
              maxItems={MAX_CUSTOM_FIELD_CHOICES}
              disabled={disabled}
            />
          </div>
        )}
        {choicesProblem && (
          <p role="alert" className="text-sm text-danger">
            {choicesProblem}
          </p>
        )}

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-fg">Customer must answer</p>
            <p className="text-hint text-muted">
              Switch off to let the customer skip it.
            </p>
          </div>
          <BigSwitch
            checked={field.required}
            disabled={disabled}
            label={`Customer must answer ${field.label || `question ${number}`}`}
            onText="Must"
            offText="Optional"
            onChange={(required) => onChange({ required })}
          />
        </div>

        <QuestionPreview field={field} />
      </div>
    </div>
  )
}

/** A read-only copy of what the customer sees at checkout. */
function QuestionPreview({ field }: { field: CheckoutCustomField }) {
  const label = field.label.trim() || 'Your question'
  return (
    <div className="rounded-lg bg-surface-alt p-3" aria-hidden="true">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Customer sees
      </p>
      <p className="text-sm font-medium text-fg">
        {label}
        {!field.required && <span className="font-normal text-muted"> (optional)</span>}
      </p>
      {field.description?.trim() && (
        <p className="mt-0.5 text-xs text-muted">{field.description}</p>
      )}
      <div className="mt-2 flex h-11 items-center rounded-md border border-line bg-input px-3 text-sm text-muted">
        {field.type === 'CHOICE'
          ? field.choices.length > 0
            ? `Choose: ${field.choices.join(' / ')}`
            : 'Choose…'
          : field.type === 'NUMBER'
            ? 'Numbers only'
            : `Type ${label.toLowerCase()}`}
      </div>
    </div>
  )
}
