import type { ReactNode } from 'react'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ImageIcon,
  PencilIcon,
  StarIcon,
  TrashIcon,
} from '../../../layout/icons'
import { Dialog } from '../../../../shared/ui/Dialog'
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
    <Dialog
      open
      title={media.sheet.photoLabel(index)}
      subtitle={media.sheet.title}
      onClose={onClose}
      flush
    >
      {photo.previewUrl && (
        <div className="flex justify-center border-b border-line bg-fg/5 py-3">
          <img
            src={photo.previewUrl}
            alt=""
            className="h-24 w-24 rounded-xl border border-line bg-surface-alt object-contain"
          />
        </div>
      )}
      <div className="divide-y divide-line pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
    </Dialog>
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
        <span className="block text-[15px] font-semibold">{label}</span>
        {note && (
          <span className="mt-0.5 block text-hint font-normal text-muted">
            {note}
          </span>
        )}
      </span>
    </>
  )

  if (!onClick) {
    return (
      <div className={`flex min-h-[56px] items-center gap-3 px-5 py-3 ${text}`}>
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[56px] w-full items-center gap-3 px-5 py-3 transition hover:bg-fg/5 disabled:cursor-not-allowed disabled:opacity-50 ${text}`}
    >
      {content}
    </button>
  )
}
