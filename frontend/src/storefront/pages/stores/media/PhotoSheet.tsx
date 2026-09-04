import type { ReactNode } from 'react'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  ImageIcon,
  PencilIcon,
  StarIcon,
  TrashIcon,
} from '../../../layout/icons'
import { media } from './strings'
import type { BoardPhoto } from './types'

/**
 * Everything a seller can do to one photo, as a list of rows that say what
 * they do.
 *
 * It replaces a hover-only strip of ‹ › ⇄ Alt 🗑 — symbols with no words, at
 * 20px, revealed by a gesture phones do not have. Here the photo is the
 * trigger, the rows are thumb-sized, and the destructive one is last, red and
 * behind a confirm.
 */
export function PhotoSheet({
  photo,
  index,
  total,
  canEdit,
  canDescribe,
  busy = false,
  onMakeCover,
  onEdit,
  onReplace,
  onDescribe,
  onMove,
  onRemove,
  onClose,
}: {
  photo: BoardPhoto
  /** 1-based position, for the title and the move rows. */
  index: number
  total: number
  /** False once the photo lives on the server and cannot be re-cropped. */
  canEdit: boolean
  canDescribe: boolean
  busy?: boolean
  onMakeCover: () => void
  onEdit: () => void
  onReplace: () => void
  onDescribe: () => void
  onMove: (delta: number) => void
  onRemove: () => void
  onClose: () => void
}) {
  const isCover = index === 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={media.sheet.photoLabel(index)}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-xl bg-surface shadow-floating sm:rounded-xl"
      >
        <div className="flex items-center gap-3 border-b border-line p-4">
          {photo.previewUrl && (
            <img
              src={photo.previewUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-md border border-line bg-surface-alt object-contain"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">
              {media.sheet.photoLabel(index)}
            </p>
            <p className="text-[11px] text-muted">{media.sheet.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={media.sheet.close}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-surface-alt hover:text-fg"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="divide-y divide-line">
          {isCover ? (
            <Row
              icon={<StarIcon className="h-4.5 w-4.5" filled />}
              label={media.sheet.isCover}
              note={media.sheet.isCoverNote}
              tone="quiet"
            />
          ) : (
            <Row
              icon={<StarIcon className="h-4.5 w-4.5" />}
              label={media.sheet.makeCover}
              note={media.sheet.makeCoverNote}
              disabled={busy}
              onClick={onMakeCover}
            />
          )}

          {canEdit ? (
            <Row
              icon={<PencilIcon className="h-4.5 w-4.5" />}
              label={media.sheet.edit}
              disabled={busy}
              onClick={onEdit}
            />
          ) : null}

          <Row
            icon={<ImageIcon className="h-4.5 w-4.5" />}
            label={media.sheet.replace}
            note={canEdit ? undefined : media.sheet.editUnavailable}
            disabled={busy}
            onClick={onReplace}
          />

          {canDescribe && (
            <Row
              icon={<PencilIcon className="h-4.5 w-4.5" />}
              label={media.describe.title}
              note={photo.altText ?? media.sheet.describeNote}
              disabled={busy}
              onClick={onDescribe}
            />
          )}

          {index > 1 && (
            <Row
              icon={<ChevronDownIcon className="h-4.5 w-4.5 rotate-90" />}
              label={media.sheet.moveEarlier}
              disabled={busy}
              onClick={() => onMove(-1)}
            />
          )}
          {index < total && (
            <Row
              icon={<ChevronRightIcon className="h-4.5 w-4.5" />}
              label={media.sheet.moveLater}
              disabled={busy}
              onClick={() => onMove(1)}
            />
          )}

          <Row
            icon={<TrashIcon className="h-4.5 w-4.5" />}
            label={media.sheet.remove}
            tone="danger"
            disabled={busy}
            onClick={onRemove}
          />
        </div>
      </div>
    </div>
  )
}

function Row({
  icon,
  label,
  note,
  tone = 'normal',
  disabled = false,
  onClick,
}: {
  icon: ReactNode
  label: string
  note?: string
  tone?: 'normal' | 'danger' | 'quiet'
  disabled?: boolean
  onClick?: () => void
}) {
  const text =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'quiet'
        ? 'text-muted'
        : 'text-fg'

  const content = (
    <>
      <span className={tone === 'danger' ? 'text-danger' : 'text-muted'}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-semibold">{label}</span>
        {note && (
          <span className="mt-0.5 block text-[11px] font-normal text-muted">
            {note}
          </span>
        )}
      </span>
    </>
  )

  if (!onClick) {
    return (
      <div className={`flex items-center gap-3 px-4 py-3.5 ${text}`}>
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 px-4 py-3.5 transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 ${text}`}
    >
      {content}
    </button>
  )
}
