import { partnerApi } from '../../api'
import { CommissionsTable } from '../CommissionsTable'

export function CommissionsPage() {
  return <CommissionsTable load={(q) => partnerApi.commissions(q)} showStore />
}
