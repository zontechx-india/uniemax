import { toApiError } from '../../../../shared/auth/http'
import { Button } from '../../../../shared/ui/Button'
import { adminAffiliateApi } from '../../api'
import type { Commission } from '../../api'

/**
 * The admin's override on one commission: approve early, or reject with a
 * reason. Shared by the affiliates overview and one affiliate's detail page.
 */
export function CommissionActions({
  row,
  reload,
  onError,
}: {
  row: Commission
  reload: () => void
  onError: (message: string | null) => void
}) {
  if (row.status !== 'PENDING' && row.status !== 'APPROVED') return null

  const update = async (patch: { status: 'APPROVED' | 'REJECTED'; note?: string }) => {
    onError(null)
    try {
      await adminAffiliateApi.updateCommission(row.id, patch)
      reload()
    } catch (err) {
      onError(toApiError(err).message)
    }
  }

  return (
    <div className="flex justify-end gap-2">
      {row.status === 'PENDING' && (
        <Button variant="secondary" size="sm" onClick={() => void update({ status: 'APPROVED' })}>
          Approve
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="text-danger!"
        onClick={() => {
          const note = window.prompt('Reason for rejecting this commission?')
          if (note === null) return
          void update({ status: 'REJECTED', note })
        }}
      >
        Reject
      </Button>
    </div>
  )
}
