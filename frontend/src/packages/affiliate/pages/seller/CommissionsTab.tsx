import { sellerAffiliateApi } from '../../api'
import { CommissionsTable } from '../CommissionsTable'
import { useSellerAffiliate } from './AffiliateLayout'

export function CommissionsTab() {
  const { storeId } = useSellerAffiliate()
  return <CommissionsTable load={(q) => sellerAffiliateApi.commissions(storeId, q)} showAffiliate />
}
