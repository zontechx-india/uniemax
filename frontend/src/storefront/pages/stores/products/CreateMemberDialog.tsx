import { useEffect, useState } from 'react'
import { Button } from '../../../../shared/ui/Button'
import { Dialog } from '../../../../shared/ui/Dialog'
import { TextField } from '../../../../shared/ui/form'
import { OPTION_LIMITS } from '../../../features/stores/productOptions'

/**
 * "Create new product for this value" — the Blue one does not exist yet. Two
 * fields: which value it is, and what to call it (suggested from this
 * product's name plus the value until the seller edits it). The parent makes
 * a draft twin of this product, adds it to the family and opens it at
 * Photos, so the seller only adds what makes it Blue.
 */
export function CreateMemberDialog({
  open,
  optionName,
  baseName,
  busy = false,
  onClose,
  onCreate,
}: {
  open: boolean
  optionName: string
  /** This product's name — the suggestion starts from it. */
  baseName: string
  busy?: boolean
  onClose: () => void
  onCreate: (value: string, name: string) => void
}) {
  const [value, setValue] = useState('')
  const [name, setName] = useState(baseName)
  const [nameTouched, setNameTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setValue('')
    setName(baseName)
    setNameTouched(false)
  }, [open, baseName])

  const changeValue = (next: string) => {
    setValue(next)
    if (!nameTouched) setName(next.trim() ? `${baseName} ${next.trim()}` : baseName)
  }

  const canCreate = value.trim().length > 0 && name.trim().length > 0 && !busy

  return (
    <Dialog
      open={open}
      title={`New ${optionName} product`}
      subtitle="It starts as a copy of this product’s details — add its photos and price next."
      onClose={onClose}
      footer={
        <>
          <Button variant="ring" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="rise"
            size="sm"
            onClick={() => onCreate(value.trim(), name.trim())}
            disabled={!canCreate}
            loading={busy}
          >
            Create &amp; add photos
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label={`Which ${optionName} is it?`}
          value={value}
          onChange={(e) => changeValue(e.target.value)}
          placeholder="e.g. Blue"
          maxLength={OPTION_LIMITS.nameLength}
          autoFocus
          className="!h-11"
        />
        <TextField
          label="Product name"
          value={name}
          onChange={(e) => {
            setNameTouched(true)
            setName(e.target.value)
          }}
          maxLength={120}
          className="!h-11"
        />
        <p className="text-xs text-muted">
          Copied from this product: shelf, description, specifications,
          delivery rule and COD. Not copied: photos, price and choices — those
          are what make it a different product.
        </p>
      </div>
    </Dialog>
  )
}
