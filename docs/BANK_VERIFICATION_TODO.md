# Bank verification — what is left

> **Who this is for:** the next person (or Claude session) who finishes or
> tests payout bank verification. Read this file first.
> **Delete this file** when every ☐ below is done. It is a to-do list, not a
> reference. The reference is `docs/API.md` → *Payout bank accounts*.

Markers: ☐ not done · ◐ partly done · ☑ done.

## 1. Where things stand (2 Nov 2026)

- ☑ Code is built and pushed to `main`, which deploys to **dev**. Not on prod yet.
- ☑ The dev deploy runs `npm run db:deploy`, so the new migration
  `20261102100000_bank_account_hub_check` is applied on the **dev** database
  by the deploy itself. Check the GitHub Actions run to confirm it passed.
- ☑ 190 unit tests pass. Both apps typecheck. The UI check is within budget.
- ☐ Not tested by hand yet. Start with section 3.
- PaymentHub dev (`https://pay.dev.zontechx.com`) still answers
  `503 VERIFIER_NOT_CONFIGURED`. This is expected. It means the hub's
  Cashfree setup is not ready. Real answers start when the PaymentHub team
  says so. **No code change is needed when that happens.**

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
