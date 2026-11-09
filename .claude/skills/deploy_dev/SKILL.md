---
name: deploy_dev
description: Deploy UnieMax to the dev EC2 server (pull latest main on the server, rebuild backend/frontend, restart pm2, verify). Use when the user says "deploy", "/deploy_dev", or asks to push the latest changes live.
---

# Deploy UnieMax to EC2

Follow the runbook in [docs/DEPLOYMENT.md](../../../docs/DEPLOYMENT.md) — it is
the single source of truth (server details, SSH command shape, host key,
workspace warning, verification).

Key facts:

- **Dev site:** `https://dev.uniemax.zontechx.com/` (+ `/api/v1/...`); admin app
  at `https://admin.dev.uniemax.zontechx.com/` (vhost `uniemax-admin-dev`, same root);
  nginx vhost `uniemax-domain`, root `/var/www/uniemax`; also on
  `http://13.206.249.204:8080/` and port 80 by IP (vhost `uniemax`).
- **This deploys the backend, which prod shares.** One pm2 process
  (`uniemax-backend`, `:4000`) serves the dev site, `uniemax.com`, and `:8081`.
  Backend or schema changes therefore hit production immediately — say so when
  reporting.
- **Two Supabase projects exist** (dev `sysjwxfwkydhtclukuxh`, prod
  `zjbeveonmeqnmsjbjomw`), but only whichever pair is active in the server's
  `backend/.env` is live. Never edit that file as part of a routine deploy.
- Env files are not in git and persist across deploys — only re-upload (pscp)
  when a new var was added, and back up to `~/uniemax/backup/` first. The
  server holds `.env` (shared) + `.env.production` (overlay); pm2 supplies
  `APP_ENV=production` via `ecosystem.config.cjs`. **Never put
  `.env.development` on the server** — it would become the fallback if
  `APP_ENV` were ever lost, silently pointing production at the dev database.

Summary of the flow:

1. **Pre-flight (local):** confirm local `main` is pushed — `git fetch` then
   `git status -sb` must show no "ahead" commits. If unpushed commits exist,
   stop and tell the user to push first (or offer to push).
2. **SSH access:** use `plink -batch` with the pinned host key exactly as shown
   in DEPLOYMENT.md → "Server". Windows OpenSSH does NOT work with this server.
3. **On the server:** check incoming commits (`git log HEAD..origin/main`),
   pull, and run the build steps from the runbook.
   - `npm ci` only from the repo ROOT (`~/uniemax`) — never inside
     `backend/` or `frontend/` (npm workspace; breaks the other app).
   - Skip backend or frontend steps entirely when no files in that area
     changed (inspect the incoming diff with `git diff --stat HEAD..origin/main`).
   - Only run `npm ci` at all when `package-lock.json` changed.
   - **If `prisma/migrations/` gained a folder in the incoming diff, run
     `APP_ENV=production npm run db:deploy` before `npm run build`** — it
     applies pending migrations and is a no-op when there are none. Skipping
     it means the new code runs against an old schema and every affected
     query 500s. The `APP_ENV=production` prefix is required: without it the
     Prisma CLI resolves to development mode and targets the wrong database
     (or none at all, once the server's `.env` is split).
   - After restarting, confirm the boot banner in `pm2 logs` reads
     `mode=production` and `db=aws-0-…` — that is the cheapest possible check
     that the right database is live.
4. **Verify (never skip):** pm2 online with stable restart count, port 4000
   listening, local curl 200, then from the local machine check the public
   URLs (storefront `/`, `/api/v1/public/stores`, and
   `https://admin.dev.uniemax.zontechx.com/orders` returns the admin bundle).
5. **Report:** deployed commit hash + what was rebuilt (backend/frontend/both)
   + verification results.

If anything fails, do not leave the server half-deployed: diagnose via
`pm2 logs uniemax-backend --nostream`, fix, and re-verify before finishing.
If DEPLOYMENT.md and reality disagree (paths, ports, process names), trust the
server, then update DEPLOYMENT.md to match.
