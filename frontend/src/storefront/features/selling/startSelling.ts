import { useNavigate } from 'react-router-dom'
import { trackSellerCtaClick } from '../../../shared/analytics/track'
import { useMarketSession } from '../../app/marketSession'
import { openAuthDialog } from '../auth/authDialogStore'

/**
 * Starting a store from a seller CTA — shared by `CreateStoreLink` and the
 * `/sell` page's store-name form.
 *
 * A name typed before sign-up rides to the Create Store wizard in ROUTER
 * STATE, not storage: it belongs to this one trip, the wizard is the only
 * reader, and the auth dialog signs in on the page it opened over (no
 * redirect), so the navigation that carries it happens right here. It is a
 * suggestion — step 1 shows it in an editable field, nothing is created until
 * the seller confirms there.
 */

/** Longest store name the wizard accepts (its field's `maxLength`). */
export const STORE_NAME_MAX = 60

/** What `/mystores/new` receives in `location.state`. */
export interface CreateStoreState {
  storeName?: string
}

/**
 * The address a store with this name would get — a mirror of the backend's
 * `utils/slug.ts#slugify`, for the /sell page's link preview. `''` when the
 * name has no Latin letters or digits to build one from.
 *
 * It is a PREVIEW, and labelled as one: when the slug is already taken the
 * server appends `-2`, `-3`… at creation, which only the server can know.
 */
export function previewStoreSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * The suggested store name from a location's state — `''` when there is none.
 * Location state is whatever the last navigation put there, so it is
 * validated rather than trusted.
 */
export function suggestedStoreName(state: unknown): string {
  if (typeof state !== 'object' || state === null) return ''
  const name = (state as CreateStoreState).storeName
  return typeof name === 'string' ? name.trim().slice(0, STORE_NAME_MAX) : ''
}

/**
 * Returns `start(placement, storeName?)`: signed-in visitors go straight to
 * the wizard; guests get the auth dialog on Register (seller copy) and
 * continue to the wizard once signed in. `placement` names the button for
 * analytics (`seller_cta_click`).
 */
export function useStartSelling() {
  const { state } = useMarketSession()
  const navigate = useNavigate()

  return (placement: string, storeName = '') => {
    const name = storeName.trim().slice(0, STORE_NAME_MAX)
    trackSellerCtaClick(placement, name !== '')
    const openWizard = () =>
      navigate('/mystores/new', {
        state: name ? ({ storeName: name } satisfies CreateStoreState) : undefined,
      })

    if (state.status === 'authed') return openWizard()
    // Guest (or still probing): sign in right here, then carry on — the
    // dialog sits outside the router and can't navigate itself.
    openAuthDialog({
      intent: 'sell',
      initialView: 'register',
      onSignedIn: openWizard,
    })
  }
}
