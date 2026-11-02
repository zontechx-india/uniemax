# Bank verification — what is left

> **Who this is for:** the next person (or Claude session) who finishes or
> tests payout bank verification. Read this file first.
> **Delete this file** when every ☐ below is done. It is a to-do list, not a
> reference. The reference is `docs/API.md` → *Payout bank accounts*.

Markers: ☐ not done · ◐ partly done · ☑ done.

## 1. Where things stand (2 Nov 2026)

- ☑ Code is built and pushed to `main` (commit `71cf609`), which deploys to
  **dev**. Not on prod yet.
- ☑ The "Deploy dev" and "CI" GitHub Actions runs for `71cf609` both passed.
  The deploy runs `npm run db:deploy`, so the migration
  `20261102100000_bank_account_hub_check` is applied on the **dev** database.
- ☑ 190 unit tests pass. Both apps typecheck. The UI check is within budget.
- ☐ Not tested by hand yet. Start with section 3.
- ☐ **Not confirmed yet that a real request has reached PaymentHub** — see
  section 2b.
- PaymentHub dev (`https://pay.dev.zontechx.com`) still answers
  `503 VERIFIER_NOT_CONFIGURED`. This is expected. It means the hub's
  Cashfree setup is not ready. Real answers start when the PaymentHub team
  says so. **No code change is needed when that happens** — see section 2c.
- Note: the owner's local folder may be behind GitHub `main` and hold
  uncommitted work. Never stash or reset it. If this file shows up as an
  untracked copy when syncing, delete the copy first — the same file comes
  back from GitHub.

## 2. How it works (short)

1. The seller saves a bank account. Our server asks PaymentHub to check it
   with the bank. The answer comes back with the save, up to a minute later.
2. The seller sees one of these:

   | Hub answer | What the seller sees | What happens to the account |
   | --- | --- | --- |
   | `VALID` | Verified + the name the bank holds | `VERIFIED` |
   | `NEEDS_REVIEW` | Under review | stays `PENDING`; the webhook settles it later |
   | `INVALID` | Could not verify | `FAILED`; the seller edits and saves again |
   | `RETRY_LATER` | Bank didn't answer | stays `PENDING`; "Check again" button |
   | `502` / `503` / hub not set up | Unavailable | status does **not** change; **never** marked invalid |

3. **Every change after the first account needs a code (OTP).** The code goes
   to the seller's verified phone, else their email. After the change, the
   seller gets an email and an in-app alert. (Reason: changing bank details is
   the usual way thieves steal a seller's money.)
4. **A verified account is never changed in place.** New details wait in a
   separate table (`store_bank_account_changes`). Only when the bank says
   `VALID` are they copied onto the account. Until then, payouts keep going to
   the old verified details.
5. **History.** Every action is saved in `store_bank_account_events` with the
   last 4 digits only. Sellers see it on the Bank account page; admins see it
   on the store page with extra notes.
6. **Dropship suppliers** use the same form, check and code.

## 2b. Does a request really reach PaymentHub? ("Check again" flow)

**Yes — if the server has the PaymentHub env vars.** What happens when the
seller clicks **Check again** (the button shows when the pill says
Unavailable, Bank didn't answer or Not checked yet):

1. Browser → UnieMax: `POST /api/v1/stores/:id/bank-accounts/:accountId/check`.
2. UnieMax backend → PaymentHub: `POST https://pay.dev.zontechx.com/v1/verifications/bank-account`
   with the saved details, `payeeRef = store_<storeId>` and a new idempotency key.
3. PaymentHub answers `503 VERIFIER_NOT_CONFIGURED` (Cashfree not ready).
4. UnieMax saves the check as **UNAVAILABLE**. It does not retry a `503`
   inside the request. Admins get one alert (at most once per 30 min).
5. The seller sees **Unavailable** and the **Check again** button again.

Good to know:
- **No money is spent.** The bank was never asked, so a `503` is not a paid check.
- **The account is not harmed.** It stays `PENDING`, never `FAILED`.
- **Limit:** 10 saves/checks per store per 10 minutes, then `429`.
- **If `PAYMENTHUB_URL` / `PAYMENTHUB_API_KEY` are missing on the server,**
  step 2 never happens: UnieMax shows Unavailable at once. The screen looks
  the same, so **only the backend log tells the difference**.

☐ **Confirm it on dev** — after a save or "Check again", read the dev
backend log (pm2):

| Log lines | Meaning |
| --- | --- |
| `bank check: no answer` + `bank check: PaymentHub could not verify` with `code: "VERIFIER_NOT_CONFIGURED"` | ✅ The request **reached** PaymentHub; it answered `503`. |
| Same lines with `code: "NOT_CONFIGURED"` | ❌ Nothing was sent — the server is missing the env vars. Add them. |
| `bank check: PaymentHub answered` | ✅ Real answer from the hub (Verified / Under review / …). |

You can also look in the PaymentHub dev dashboard: the UnieMax app's
request should be listed there.

## 2c. When PaymentHub says it is ready — what to do

**No code change in UnieMax.** The code already handles every answer the
PaymentHub docs list; today the hub only sends `503`. Only settings:

| Item | Where | Needed for |
| --- | --- | --- |
| `PAYMENTHUB_URL` + `PAYMENTHUB_API_KEY` (`ph_test_…`) | dev server env file | Any check on dev (confirm with section 2b) |
| `PAYMENTHUB_WEBHOOK_SECRET` | dev server env file | The "Under review → settled" webhook |
| A release tag (`v*`) | GitHub | Getting this feature onto **prod** |
| `PAYMENTHUB_URL=https://pay.zontechx.com` + `ph_live_…` key | prod server env file | Checks on prod, after PaymentHub has live Cashfree keys |

Small risk: if PaymentHub's real answers differ from its docs (a missing
field, say), a small fix may be needed. Section 4's sandbox tests catch that.

## 3. Test now on dev (hub answers 503)

Do these on the dev site after the deploy finishes.

☐ **Add the first account** (a seller with no bank account).
  - Expect: no code asked. Saved. Pill shows **Unavailable**. Message
    "Verification is unavailable right now". Status is still `PENDING`, not
    `FAILED`.
  - Admins get one "Bank verification is unavailable" notification.
  - History shows "Bank check: Unavailable".

☐ **Bad IFSC.** Type `YESB1000262` (fifth letter is not `0`).
  - Expect: the form stops it before any call to the hub.

☐ **Add a second account.**
  - Expect: the "Confirm it's you" code box opens.
  - On dev, if the seller has a verified phone, the code is `123456`
    (SMS bypass). Otherwise a real code is emailed.
  - Wrong code → "Incorrect code", box stays open.
  - Right code → saved, and an email "Your UnieMax payout bank details changed".

☐ **Make the second account main** → code → it switches at once (the first
  one is not verified, so there is nothing to protect).

☐ **Admin page** (`/admin/stores/<id>`) → Payout accounts:
  - The history list shows all of the above, with notes.
  - "Verify with bank" shows the "unavailable" message.

☐ **Server env check.** The dev server needs `PAYMENTHUB_URL` and
  `PAYMENTHUB_API_KEY` (`ph_test_…`) in its env file. If they are missing,
  every check shows "Unavailable" and the log says `NOT_CONFIGURED`. The
  webhook also needs `PAYMENTHUB_WEBHOOK_SECRET`.

## 4. Test later — when PaymentHub says the sandbox is ready

☐ **Run the sandbox accounts** (from PaymentHub's ONBOARDING §4.6). Use a
**new store for each row**: each store gets only 5 new checks a day, and a
repeat returns the old answer (`reused: true`).

| Account | IFSC | Expect |
| --- | --- | --- |
| `026291800001191` | `YESB0000262` | Verified (or Under review if the name doesn't match the sandbox name) |
| `00011020001772` | `HDFC0000001` | same as above |
| `000100289877623` | `SBIN0008752` | Bank didn't answer → "Check again" works |
| `2640101002729` | `CNRR0002640` | Could not verify |
| `026291800001190` | `YESB0000262` | Could not verify |

☐ **Change a verified account.** Verify account A. Edit its number → code.
  - Expect: the row shows "New details … Payouts still go to ····1191".
  - With a valid new number → the new details replace the old ones.
  - With an invalid new number → the account stays verified on the old
    number. The seller can edit again or choose "Remove the new details".

☐ **Webhook `verification.updated`.** Get an "Under review" result (use a
  wrong name). Settle it in the PaymentHub dashboard.
  - Expect: the account (or pending change) updates, and the seller is told.
  - Then settle one where the seller edited the account in between.
    Expect: ignored (the log says `stale`).

## 5. Missing automated tests

☐ Today's tests are **unit tests**: the pure rules, plus the hub call with a
fake `fetch`. These have **no** automated test yet:
- the pending-change "apply" step
- `promoteWhenVerified` (main account switches after verify)
- the webhook "stale" cases
- OTP answers at the route level (`428` = code needed, `403` = wrong code)
- the rate limit
- "the full account number is never in logs" for a real request (today this
  was only checked by reading the code)

Add them to the `test:api` suite (`backend/test/*.test.mjs`) if it can run
against a throwaway database.

## 6. Not built — decided to do later

☐ **Encrypt bank details at rest.** The account number is stored as plain
text in `store_bank_accounts` and `store_bank_account_changes`. The owner
chose to plan this later. The repo has no encryption helper yet — ask before
adding one. PaymentHub's future payee creation will need the full number.

☐ **SMS alert when bank details change.** Today: in-app alert + email only.
We have no plain SMS sender (Message Central is only used for OTP).
Options: a WhatsApp template, or an SMS provider.

☐ **Hold payouts while a change is pending?** Today payouts keep going to the
old verified details. PaymentHub's guide allows either. Decide when real
payouts go live.

☐ **Admin approve/reject of a pending change.** Admins can verify or fail the
*current* details by hand, but not the *pending new* details. If PaymentHub
is down for a long time, a seller's change just waits. Add buttons if needed.

☐ **Payee creation** (`PUT /v1/payees/:payeeRef`) — planned in PaymentHub,
not built there. Do not call it until the PaymentHub team says so.

☐ **Code by email when there is no verified phone.** The code then goes to
the email, even an unverified one. Think about requiring a verified phone
for bank changes.

☐ **Production.** Not released. When releasing (a `v*` tag), prod answers
`503` until PaymentHub has live Cashfree keys — sellers will see
"Unavailable", which is safe.

## 7. Decisions to know

- **The check runs inside the save request** (up to ~52 seconds). nginx
  allows 60 seconds for `/api`. If someone lowers that, saves can time out at
  the proxy. The details are still saved; the seller can press "Check again".
- **Idempotency key** = `bank-verify:<storeId>:<accountId or changeId>.<updatedAt ms>`.
  An idempotency key is an id that tells PaymentHub "this is the same
  request, don't charge twice". Ours changes after every saved answer, so
  "Check again" after "Bank didn't answer" is a new (paid) check. After a
  timeout nothing is saved, so the next try reuses the same key (no double
  charge).
- **`UNAVAILABLE`** is our own status for "the check could not run". It is
  saved so the seller sees it, but it never changes a verified account and
  never makes one `FAILED`.
- **Rate limit:** 10 saves/checks per 10 minutes per store. PaymentHub's
  brief said "e.g. 3", but one save can take two requests (ask for code,
  then save). PaymentHub adds its own limit of 5 new checks per store a day.
- **A wrong code answers `403`, not `401`.** The web app treats any `401` as
  "session expired" and replays the request, which would waste a code attempt.
- **Holder name** must use English letters, digits, spaces and `. - / &` (the
  hub's rule). Older saved names with other characters are cleaned (an
  apostrophe becomes a space) before the check.
- **On `VALID`**, bank name and branch are replaced with the bank's official
  values for that IFSC.
- **Ask the PaymentHub team:** is `details.branch` always present on `VALID`?
  What is the exact `422` body for `VALIDATION_ERROR`? (We show its `message`,
  not per-field details.)

## 8. Where the code is

| Part | File |
| --- | --- |
| Hub call, retries, error mapping (no database) | `backend/src/modules/stores/bankCheck.hub.ts` |
| Pure rules (payeeRef, key, name rule, status mapping) | `backend/src/modules/stores/bankCheck.ts` |
| Saving answers, pending changes, webhook, admin check | `backend/src/modules/stores/bankCheck.service.ts` |
| Seller endpoints (OTP, history, check again, remove change) | `backend/src/modules/stores/storeBank.*` |
| History writer | `backend/src/modules/stores/storeBank.history.ts` |
| OTP for bank changes (`BANK_CHANGE`) | `backend/src/package/auth/customer/actionCode.ts` |
| Webhook | `backend/src/modules/payments/paymenthub.webhook.ts`, `paymenthub.service.ts` |
| Migration | `backend/prisma/migrations/20261102100000_bank_account_hub_check/` |
| Seller page + code box | `frontend/src/storefront/pages/stores/StoreBankPage.tsx`, `BankCodeDialog.tsx` |
| Dropship supplier prompt | `frontend/src/packages/dropship/pages/BankPrompt.tsx` |
| Admin view | `frontend/src/admin/pages/StoreDetailPage.tsx` |
| Tests | `backend/test/unit/bank-check.test.ts`, `bank-check-hub.test.ts` |
