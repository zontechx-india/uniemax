import { useState } from 'react'
import { toApiError } from '../../../shared/auth/http'
import { Button } from '../../../shared/ui/Button'
import { ErrorNote } from '../../../shared/ui/form'
import { DownloadIcon } from '../../layout/icons'
import { downloadFile, pdfBlob } from '../bills/billsApi'

/**
 * "Download receipt" for a delivered order — the PDF the server draws
 * (backend `orders/orderReceipt.ts`, the same layout as the seller bill).
 * `url` picks the copy: the customer's (masked, behind the order link) or the
 * seller's (full). Shown only once the order is delivered.
 */
export function ReceiptButton({ url, orderNumber, className = '' }: { url: string; orderNumber: string; className?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      downloadFile(await pdfBlob(url), `Receipt-${orderNumber}.pdf`)
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={className}>
      <Button variant="secondary" size="md" full loading={busy} onClick={() => void save()}>
        <DownloadIcon className="h-4 w-4" />
        Download receipt (PDF)
      </Button>
      {error && (
        <div className="mt-2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </div>
  )
}
