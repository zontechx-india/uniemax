import { useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  HomepageSection,
  HomepageSectionKey,
  HomepageSectionSettings,
} from '../../../features/stores/storesApi'
import {
  defaultLayout,
  HERO_DEFAULT_CTA,
  SECTION_DEFAULT_COPY,
} from '../../../features/publicStore/sectionCopy'
import { ChevronDownIcon, ChevronRightIcon } from '../../../layout/icons'
import { ActiveSwitch } from '../ActiveSwitch'
import { BUILDER_SECTIONS } from './builderSections'

/**
 * One section's settings — the **Quick Customize** panel.
 *
 * What is on screen is what most sellers change: how the section looks, and
 * what it is called. Everything rarer (the small line beside the heading, the
 * hero's button label, putting it all back) sits under *More options*, closed.
 * The point of the split is not to hide capability, it is that a panel of four
 * controls gets used and a panel of twelve gets abandoned.
 *
 * Every control here comes from `BUILDER_SECTIONS`, so a section is never
 * offered a choice the storefront cannot render — a layout button exists only
 * because there is a composition behind it.
 *
 * **There is no Save.** Changes go straight to the shop (debounced upstream)
 * and the preview repaints, which is the entire reason the seller can see what
 * they are doing. The header carries the save state for the whole workspace.
 */
export function BuilderSectionEditor({
  section,
  storePath,
  busy,
  onToggle,
  onSettingsChange,
}: {
  section: HomepageSection
  /** Base route for this store's management screens, for the content links. */
  storePath: string
  busy: boolean
  onToggle: (key: HomepageSectionKey, enabled: boolean) => void
  onSettingsChange: (
    key: HomepageSectionKey,
    settings: HomepageSectionSettings,
  ) => void
}) {
  const meta = BUILDER_SECTIONS[section.key]
  const defaults = SECTION_DEFAULT_COPY[section.key]
  const settings = section.settings ?? {}
  const [more, setMore] = useState(false)

  const hasMore = meta.subtitle || meta.ctaLabel
  const customised = Object.keys(settings).length > 0

  const set = (patch: HomepageSectionSettings) =>
    onSettingsChange(section.key, { ...settings, ...patch })

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">{meta.about}</p>

      {/* On/off lives in the editor as well as in the list: a seller who
          opened a section to change it should not have to go back out to
          switch it off. */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-alt px-3 py-2.5">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-fg">
            Show this section
          </span>
          <span className="block text-xs text-muted">
            {section.enabled
              ? 'Shoppers can see it'
              : 'Hidden — nobody but you can see it'}
          </span>
        </span>
        <ActiveSwitch
          checked={section.enabled}
          disabled={busy}
          label={`${section.enabled ? 'Hide' : 'Show'} ${meta.label}`}
          onChange={(next) => onToggle(section.key, next)}
        />
      </div>

      {meta.layouts.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-fg">Layout</legend>
          <div className="space-y-2">
            {meta.layouts.map((layout, index) => {
              // Nothing stored = the section's own default, read from the same
              // list the storefront falls back to.
              const active =
                (settings.layout ?? defaultLayout(section.key)) === layout.id
              return (
                <button
                  key={layout.id}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    // The default is stored as "no value", so choosing it back
                    // clears the field instead of pinning today's default into
                    // the row for ever.
                    set({ layout: index === 0 ? null : layout.id })
                  }
                  aria-pressed={active}
                  className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                    active
                      ? 'border-brand bg-brand-soft'
                      : 'border-line bg-surface hover:border-fg/25'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      active ? 'border-brand' : 'border-line'
                    }`}
                  >
                    {active && (
                      <span className="h-2 w-2 rounded-full bg-brand" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-fg">
                      {layout.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {layout.hint}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      {meta.title && (
        <SettingField
          label={section.key === 'hero' ? 'Heading' : 'Title'}
          hint={
            section.key === 'hero'
              ? 'Leave blank to use your store name.'
              : 'Leave blank to use the default.'
          }
          placeholder={
            section.key === 'hero' ? 'Your store name' : defaults.title
          }
          value={settings.title ?? ''}
          maxLength={60}
          disabled={busy}
          onChange={(value) => set({ title: value || null })}
        />
      )}

      {meta.source && (
        <div className="rounded-lg border border-line px-3 py-2.5">
          <p className="text-xs text-muted">{meta.source.note}</p>
          <Link
            to={`${storePath}/${meta.source.to}`}
            className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
          >
            {meta.source.label}
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {hasMore && (
        <div className="border-t border-line pt-3">
          <button
            type="button"
            onClick={() => setMore((open) => !open)}
            aria-expanded={more}
            className="flex w-full items-center gap-1.5 text-sm font-semibold text-fg"
          >
            <ChevronDownIcon
              className={`h-4 w-4 text-muted transition-transform duration-200 ${
                more ? '' : '-rotate-90'
              }`}
            />
            More options
          </button>

          {more && (
            <div className="mt-3 space-y-4">
              {meta.subtitle && (
                <SettingField
                  label={section.key === 'hero' ? 'Intro line' : 'Small line'}
                  hint={
                    section.key === 'hero'
                      ? 'Leave blank to use the About text from your footer settings.'
                      : 'The short line beside the title. Leave blank for the default.'
                  }
                  placeholder={
                    section.key === 'hero'
                      ? 'Your About text'
                      : (defaults.subtitle ?? 'None')
                  }
                  value={settings.subtitle ?? ''}
                  maxLength={120}
                  disabled={busy}
                  onChange={(value) => set({ subtitle: value || null })}
                />
              )}

              {meta.ctaLabel && (
                <SettingField
                  label="Button label"
                  hint="The button that takes shoppers into your catalogue."
                  placeholder={HERO_DEFAULT_CTA}
                  value={settings.ctaLabel ?? ''}
                  maxLength={30}
                  disabled={busy}
                  onChange={(value) => set({ ctaLabel: value || null })}
                />
              )}

              <button
                type="button"
                disabled={busy || !customised}
                onClick={() => onSettingsChange(section.key, {})}
                className="text-sm font-semibold text-brand transition hover:underline disabled:text-muted disabled:no-underline"
              >
                {customised
                  ? 'Reset this section to its defaults'
                  : 'This section is on its defaults'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * A labelled text setting whose PLACEHOLDER is the live default — so an empty
 * field reads as "this is what it will say", not as a missing value.
 */
function SettingField({
  label,
  hint,
  placeholder,
  value,
  maxLength,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  placeholder: string
  value: string
  maxLength: number
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-fg">
        {label}
      </span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-md border border-line bg-transparent px-3 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent disabled:opacity-60"
      />
      <span className="mt-1.5 block text-xs text-muted">{hint}</span>
    </label>
  )
}
