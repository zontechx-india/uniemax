# UnieMax — EC2 Deployment

Live deployment of the UnieMax platform (GitHub repo is still named `legionx`;
on the server everything is named `uniemax`).

## Server

| Item        | Value                                   |
| ----------- | --------------------------------------- |
| Public IP   | `13.206.249.204`                        |
| Private IP  | `172.31.32.76`                          |
| OS          | Ubuntu 24.04 (OpenSSH 9.6)              |
| SSH user    | `ubuntu`                                |
| SSH key     | `D:\AWS Key\servidex_main.ppk` (PuTTY format — use plink/pscp, or convert for OpenSSH) |
| Host key    | `SHA256:HgxgT0NGDiSy1s8opS1b41JcA67ndeHN87b9Sk8DlME` |
| Node / pm2  | Node v22.22.2, npm 10.9.7, pm2 (global) |
| Resources   | 19G disk, 3.7G RAM + **2G swap** (`/swapfile`, added 2026-08-08 — four Node apps on this box and builds can spike) |

The box is shared with an unrelated project: pm2 `ziktag-backend` (:3000),
nginx site `ziktag`, and ~982M under `/var/www/{ziktag-backend,ziktag-admin}`.
**Do not touch it.** Routine reclaim that is safe (~1.4G):
`npm cache clean --force`, `sudo journalctl --vacuum-time=7d`,
`sudo apt-get clean`.

`track-user-backend` (:3004) was removed on 2026-08-08 at the owner's request —
pm2 app deleted, `/var/www/track-user-backend` erased. Source remains at
`github.com/anwin-paulji/track-user-backend` (`c7d30aa`); its `.env` and final
pm2 logs are kept in `~/backup/track-user-removed-20260808/`. Port 3004 is now
unused and its security-group rule can be closed. The Android client source
still sits at `/var/www/track-user`.

SSH example (PowerShell):

```powershell
plink -batch -ssh -hostkey "SHA256:HgxgT0NGDiSy1s8opS1b41JcA67ndeHN87b9Sk8DlME" `
  -i "D:\AWS Key\servidex_main.ppk" ubuntu@13.206.249.204 "<command>"
```

> Note: the built-in Windows OpenSSH client cannot connect — the server requires
> the `sntrup761x25519-sha512` key exchange, which it doesn't support. Use PuTTY
> tools (plink / pscp).

## Layout on the server

| Path                                  | Purpose                                  |
| ------------------------------------- | ---------------------------------------- |
| `/home/ubuntu/uniemax`                | **PROD** clone — checked out to a `v*` tag (detached HEAD) |
| `/home/ubuntu/uniemax-dev`            | **DEV** clone — tracks `main` |
| `/home/ubuntu/uniemax/backend`        | Fastify API — built to `dist/`, run by pm2 |
| `/home/ubuntu/uniemax/frontend`       | Vite app — built to `dist/`, copied to nginx root |
| `/var/www/uniemax`                    | nginx web root (frontend build output)   |
| `/etc/nginx/sites-available/uniemax`  | nginx site — IP access, ports 80 + 8080 (symlinked into `sites-enabled`) |
| `/etc/nginx/sites-available/uniemax-domain` | nginx vhost for `dev.uniemax.zontechx.com` + HTTPS (certbot-managed) |
| `/var/www/uniemax-prod`               | nginx web root for the **prod** frontend (updated only by `/deploy_prod`) |
| `/etc/nginx/sites-available/uniemax-prod` | nginx site — prod frontend by IP on port 8081 (root `/var/www/uniemax-prod`) |
| `/etc/nginx/sites-available/uniemax-com` | nginx vhost for `uniemax.com` + `www.uniemax.com` — prod domain, HTTPS (certbot), root `/var/www/uniemax-prod`, `/api` → `:4000` |
| `/home/ubuntu/uniemax/backup/`        | Backup of the previous deployment's backend `.env` (git-ignored via `.git/info/exclude`) |

The EC2's own SSH key is registered with GitHub (user `anwin-paulji`), so
`git pull` works directly on the server.

## Ports (chosen to not clash with other projects on this box)

| Port | Service                            | Reachable from internet? |
| ---- | ---------------------------------- | ------------------------ |
| 8080 | **nginx → UnieMax frontend + `/api` proxy (dedicated port, for domain mapping)** | needs TCP 8080 inbound in the security group |
| 8081 | **nginx → UnieMax PROD frontend + `/api` proxy (dedicated port)** | needs TCP 8081 inbound in the security group |
| 80   | nginx → same UnieMax site (`default_server`, kept temporarily) | ✅ (security group open) |
| 443  | nginx (other project SSL)          | ✅                       |
| 4000 | UnieMax **PROD** backend (pm2 `uniemax-backend`) | ❌ internal only — proxied via nginx `/api` |
| 4001 | UnieMax **DEV** backend (pm2 `uniemax-backend-dev`) | ❌ internal only — proxied via nginx `/api` |
| 3000 | ziktag-backend (other project)     | ❌ (SG blocks)           |
| 3004 | track-user-backend (other project) | ✅                       |

## Two environments (since 2026-08-07)

Dev and prod are genuinely separate: separate clone, backend process, port and
database. Only the frontend *root* is shared in the sense that each has its own.

| | **dev** | **prod** |
| --- | --- | --- |
| Clone | `~/uniemax-dev` (tracks `main`) | `~/uniemax` (tracks `v*` tags) |
| pm2 app | `uniemax-backend-dev` | `uniemax-backend` |
| Port | `:4001` | `:4000` |
| `APP_ENV` | `development` | `production` |
| Supabase | `sysjwxfwkydhtclukuxh` (`aws-1-`) | `zjbeveonmeqnmsjbjomw` (`aws-0-`) |
| Frontend root | `/var/www/uniemax` | `/var/www/uniemax-prod` |
| nginx vhosts | `uniemax-domain`, `uniemax` | `uniemax-com`, `uniemax-prod` |
| URL | `dev.uniemax.zontechx.com` | `uniemax.com`, `www` |
| Deployed by | push to `main` → `deploy-dev.yml` | tag `v*` + approval → `deploy-prod.yml` |

`PORT=4001` comes from `backend/ecosystem.dev.config.cjs`, not from
`.env.development` — a real env var beats dotenv, so local development still
uses 4000 and the Vite proxy is unaffected. Pre-change nginx backups:
`/etc/nginx/sites-available/{uniemax,uniemax-domain}.pre-4001`.

The quickest check that the split is intact — the two must differ:

```bash
curl -s http://127.0.0.1:4001/api/v1/public/stats   # dev  → real catalog
curl -s http://127.0.0.1:4000/api/v1/public/stats   # prod → its own data
```

The prod backend port is **explicitly** set via `PORT=4000` in `backend/.env` — it is
not a framework default. The frontend is a static production build served by
nginx; the `uniemax` site listens on its **dedicated port 8080** and (for now)
also on 80 as `default_server`. Once the domain is mapped / other projects need
port 80 by IP, remove the two `listen ... 80` lines from
`/etc/nginx/sites-available/uniemax` and reload nginx. Ports 3000/3004 and the
other pm2 apps (`ziktag-backend`, `track-user-backend`) are untouched.

## Env files (not in git)

**Layered, never edited to switch.** `backend/src/config/loadEnv.ts` resolves
`mode = APP_ENV ?? NODE_ENV ?? "development"` and loads `.env.<mode>` first,
then `.env` for whatever the overlay omits:

| File on the server | Contents |
| ------------------ | -------- |
| `backend/.env` | Shared values — JWT, S3/AWS, Cashfree, Resend, Message Central, media rules, `HOST`/`PORT`/`LOG_LEVEL`, `VAPID_SUBJECT` |
| `backend/.env.production` | `NODE_ENV=production`, prod DB pair, `CORS_ORIGIN`, `PUBLIC_WEB_URL`, `PUBLIC_API_URL`, the server's `VAPID_*` pair |
| `backend/ecosystem.config.cjs` | **In git.** Sets `APP_ENV=production` for pm2 — the whole switch |

**Live since 2026-08-07.** The pm2 side was applied with `pm2 delete` +
`pm2 start ecosystem.config.cjs` + `pm2 save` (a plain `pm2 restart` does not
adopt a new ecosystem file). Pre-split backup:
`~/uniemax/backup/env.pre-split-20260807`.

> ⚠️ **`.env.development` must NEVER exist on the server.** If `APP_ENV` were
> ever lost, the loader would fall back to development mode; with no
> `.env.development` present that fails loudly, but with one present it would
> silently point production at the **dev database**. Its absence is a guard.

Every entrypoint prints `env: mode=… NODE_ENV=… db=<host> web=…` at boot, so a
wrong-database deploy is visible in `pm2 logs` immediately:

```
env: mode=production NODE_ENV=production db=aws-0-ap-south-1.pooler.supabase.com:6543 web=https://uniemax.com
```

Because the shared `.env` no longer carries `DATABASE_URL`, **any Prisma CLI
command on the server needs the prefix** — without it you get
`Error: The datasource.url property is required…` rather than a silent hit on
the wrong database:

```bash
APP_ENV=production npm run db:status
APP_ENV=production npm run db:deploy
```

Legacy note: a single combined `.env` still boots — with `APP_ENV` unset the
loader falls back to `.env` alone. That fallback is what let the loader ship
one deploy ahead of this split.

- `backend/.env` — the shared half, copied from the local dev machine
  (`d:\Live Project\Client Project\Legionx\backend\.env`).
  **These two vars live in `.env.production`, never in the shared file** —
  they are localhost on the dev machine and must point at the public domain:

  | Var              | Local                   | Server (correct value)  |
  | ---------------- | ----------------------- | ----------------------- |
  | `PUBLIC_WEB_URL` | `http://localhost:5173` | `https://uniemax.com`   |
  | `PUBLIC_API_URL` | (unset)                 | `https://uniemax.com`   |

  Both point at the **production** domain because one backend (`:4000`)
  serves dev, prod and the `:8081` site — so the return URL can only match
  one of them, and real customers must be the ones it matches. A payment
  started on `dev.uniemax.zontechx.com` therefore returns the customer to
  `uniemax.com`.

  `PUBLIC_WEB_URL` builds the Cashfree `return_url` (a localhost value sends
  paying customers to their own machine) and `PUBLIC_API_URL` builds the
  webhook `notify_url` (`<PUBLIC_API_URL>/api/v1/payments/webhooks/cashfree`).
  After any `.env` re-upload, re-apply both and restart pm2. Back up the
  previous file to `~/uniemax/backup/` first. Note the local `.env` may have
  **no trailing newline** — append with `printf '\n…'` or the new var lands on
  the last comment line and is silently ignored.

  `CORS_ORIGIN` is **required** once `NODE_ENV=production`: the app is
  cookie-credentialed, so `config/env.ts` refuses to boot on the `*` default.
  Current value:
  `https://uniemax.com,https://www.uniemax.com,https://dev.uniemax.zontechx.com,http://localhost:5173`
- `frontend/.env` — contains only `VITE_GOOGLE_MAPS_API_KEY`.
  `VITE_API_URL` is deliberately **unset** so the built app calls the API
  same-origin (`/api/...`), which nginx proxies to `127.0.0.1:4000`.

### Databases (two Supabase projects)

| Env  | Supabase ref           | Pooler host                            | Status |
| ---- | ---------------------- | -------------------------------------- | ------ |
| dev  | `sysjwxfwkydhtclukuxh` | `aws-1-ap-south-1.pooler.supabase.com` | retained, not served |
| prod | `zjbeveonmeqnmsjbjomw` | `aws-0-ap-south-1.pooler.supabase.com` | **live since 2026-08-07** |

`DATABASE_URL` uses the transaction pooler (`:6543?pgbouncer=true`) for
runtime; `DIRECT_URL` uses the session pooler (`:5432`) for migrations. Note
the pooler prefix differs per project (`aws-1-` dev, `aws-0-` prod) — copy it
from Supabase → Connect, don't assume.

Never use the `db.<ref>.supabase.co` host Supabase labels "Direct connection":
it is IPv6-only and the EC2 box is IPv4, so it fails with `ENETUNREACH`. A
password containing `@` must be percent-encoded (`%40`) inside the URL, or the
string splits at the wrong `@` and the host parses as garbage.

The prod database schema was created on 2026-08-06 with `npm run db:deploy`
(all 3 migrations, **no data copied** from dev).

Each clone talks to exactly one database — see "Two environments" above. The
dev clone owns the only `.env.development` on the box; the prod clone must
never gain one.

#### Server cutover to the prod database — DONE 2026-08-07

The server now runs `NODE_ENV=production` against the **prod** project
(`aws-0-…`), with `PUBLIC_WEB_URL`/`PUBLIC_API_URL` = `https://uniemax.com`
and an explicit `CORS_ORIGIN`. The pre-cutover file is backed up at
`~/uniemax/backup/env.pre-proddb-20260807` (dev DB + the retired domain).

Consequence, by design: the live catalog reset to empty. The former dev-DB
content (8 stores / 39 products / 15 orders as of cutover) still exists in the
**dev** project and is simply no longer served. Rollback = restore that backup
and `pm2 restart uniemax-backend`.

To repeat this kind of `.env` swap:

```bash
cp ~/uniemax/backend/.env ~/uniemax/backup/env.pre-<change>-<date>   # back up FIRST
# pscp the local .env up, then:
cd ~/uniemax/backend && npm run db:status   # expect "up to date" on the right host
pm2 restart uniemax-backend --update-env && pm2 save
pm2 logs uniemax-backend --nostream --lines 20   # must NOT show a config exit
curl -s http://127.0.0.1:4000/api/v1/public/push-config   # VAPID key unchanged?
```

> ⚠️ **Never upload the local `VAPID_*` values.** The keys were generated on
> the server (`npm run push-keys`) and differ from any local pair; overwriting
> them invalidates every existing browser push subscription. Splice the
> server's three `VAPID_*` lines into the file *before* uploading, then confirm
> via `/api/v1/public/push-config` that `publicKey` is unchanged.

An admin account is per-database: a fresh project has none until
`npm run create-admin -- <email> <pw> [name]` runs against it.

## URLs

| URL                                            | What                    |
| ---------------------------------------------- | ----------------------- |
| **`https://dev.uniemax.zontechx.com/`**        | Storefront (primary URL) |
| **`https://dev.uniemax.zontechx.com/admin`**   | Admin app               |
| **`https://dev.uniemax.zontechx.com/api/v1/...`** | API (proxied to :4000) |
| `http://13.206.249.204:8080/`                  | Same site, direct port (needs TCP 8080 in SG) |
| `http://13.206.249.204/` (+ `/admin`, `/api`)  | Same site on port 80 (IP fallback) |

### Production site (frontend-only)

| URL                                          | What                                  |
| -------------------------------------------- | ------------------------------------- |
| **`https://uniemax.com/`**                   | PROD storefront (primary)             |
| **`https://uniemax.com/admin`**              | PROD admin app                        |
| **`https://uniemax.com/api/v1/...`**         | API (proxied to :4000)                |
| `https://www.uniemax.com/`                   | Same site (covered by the same cert)  |
| `http://13.206.249.204:8081/`                | Same prod site, direct port (needs TCP 8081 in SG) |

Prod serves its own frontend build from `/var/www/uniemax-prod` (nginx sites
`uniemax-prod` on port 8081 + `uniemax-com` for the domain) and its **own
backend** (`uniemax-backend`, `:4000`, prod database) built from the `~/uniemax`
clone. Nothing is shared with dev any more — a dev deploy cannot affect
production, and prod intentionally lags dev until a `v*` tag is released.

Prod domain & HTTPS: A record `uniemax.com` (+ `www`) → `13.206.249.204`
(**DNS only** / grey cloud — same renewal rule as dev), Let's Encrypt cert via
`certbot --nginx` (cert name `uniemax.com`, covers `uniemax.com` +
`www.uniemax.com`, auto-renews, expires 2026-11-04), HTTP→HTTPS 301 on the
domain. TCP 8081 is open in the security group for direct-IP access.

> The old prod domain `uniemax.zontechx.com` is **retired** — its vhost
> (`uniemax-prod-domain`) no longer exists on the server, replaced by
> `uniemax-com`. Do not reintroduce it in configs or docs.

## Domain & HTTPS

- DNS: `dev.uniemax.zontechx.com` → A record → `13.206.249.204` (Cloudflare,
  **DNS only** / grey cloud — do not enable the orange proxy or certbot renewal
  via HTTP challenge breaks).
- nginx vhost: `/etc/nginx/sites-available/uniemax-domain` (symlinked in
  `sites-enabled`) — `server_name dev.uniemax.zontechx.com`, same content as the
  IP site, plus the certbot-managed 443 block. HTTP on the domain 301-redirects
  to HTTPS.
- Certificate: Let's Encrypt via `certbot --nginx` (cert name
  `dev.uniemax.zontechx.com`, auto-renewal scheduled by certbot's systemd
  timer; the ziktag cert renews the same way).
- The plain-IP site (`sites-available/uniemax`, ports 80 + 8080) is separate
  from the domain vhost, so certbot edits never touch it.

## Deployment — GitHub Actions (primary)

CI/CD lives in `.github/workflows/`:

| Workflow | Trigger | Does |
| -------- | ------- | ---- |
| `ci.yml` | every push + PR | `npm ci`, `prisma generate`, backend typecheck + build, frontend build. Also reused as a gate by both deploys. |
| `deploy-dev.yml` | push to `main` | Deploys `~/uniemax-dev` → `dev.uniemax.zontechx.com`. Runs `db:deploy` against the **dev** DB. |
| `deploy-prod.yml` | tag `v*` (or manual) | Waits for approval on the `production` environment, then deploys `~/uniemax` → `uniemax.com`. Health-checks and **auto-rolls-back** on failure. |

Release to production:

```bash
git tag v1.2.0 && git push origin v1.2.0     # then approve in the Actions tab
```

Both deploys assert the boot banner names the right database (`aws-1-` for dev,
`aws-0-` for prod) and fail rather than continue if it doesn't.

Required repo configuration:

- **Secrets:** `SSH_PRIVATE_KEY` (OpenSSH format), `SSH_HOST`, `SSH_USER`,
  `SSH_KNOWN_HOSTS`.
- **Environments:** `development` (no gate) and `production` (required
  reviewer — this is the approval gate).

### Manual fallback (Claude Code runbook)

`/deploy_dev` and `/deploy_prod` remain as break-glass for when Actions is
unavailable or a one-off is needed. They run the steps below over SSH (plink,
see [Server](#server)). Note `/deploy_prod` is frontend-only and never touches
the backend or pm2.

> ⚠️ **The repo root is an npm workspace** (`frontend` + `backend`). Always run
> `npm ci` from the repo **root** (`~/uniemax`). Running it inside `backend/` or
> `frontend/` deletes the shared root `node_modules` and crashes the other app.

```bash
# 0. Confirm what's being deployed (local main must be pushed first)
cd ~/uniemax && git fetch && git log --oneline HEAD..origin/main   # incoming commits

# 1. Pull + install (root — see warning above). Skip npm ci if no
#    package-lock.json change came in.
git pull
npm ci --no-audit --no-fund

# 2. Backend (skip if no backend/ or prisma/ files changed)
cd ~/uniemax/backend
npx prisma generate        # needed whenever schema or deps changed
APP_ENV=production npm run db:deploy   # pending migrations (no-op if none)
npm run build
pm2 restart uniemax-backend && pm2 save

# 3. Frontend (skip if no frontend/ files changed)
cd ~/uniemax/frontend
npm run build
sudo rm -rf /var/www/uniemax/*
sudo cp -r dist/* /var/www/uniemax/
```

### Post-deploy verification (always)

```bash
pm2 ls                                   # uniemax-backend online, restart count NOT climbing
sudo ss -tlnp | grep ':4000'             # backend listening
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/api/v1/public/media-config   # 200
```

Then from the local machine: `http://13.206.249.204/` (storefront),
`/admin`, and `/api/v1/public/stores` (DB-backed) must all return 200.
If the backend crash-loops, check `pm2 logs uniemax-backend --nostream --lines 40`.

Notes:
- Schema changes ship as **committed migrations**: `npm run db:migrate` on the
  dev machine creates + applies one, and the server runs `npm run db:deploy`
  (plus `prisma generate`). `prisma db push` is no longer used — earlier
  pushed columns are baselined by `prisma/migrations/1_payment_sessions`.
- Env files are not in git; they persist on the server across deploys. Only
  re-upload them (pscp) if a new env var was added.

### The `/admin` console needs its own nginx fallback

The admin app is a **second SPA** (`admin.html`) served at `/admin` on the same
origin, with client-side routes like `/admin/orders/abc`. All four site configs
(`uniemax`, `uniemax-domain`, `uniemax-prod`, `uniemax-com`) **already
carry** these two blocks ahead of the catch-all — verified on the server:

```nginx
location = /admin  { try_files /admin.html =404; }   # the bare path
location ^~ /admin/ { try_files $uri /admin.html; }  # deep links + assets
location /          { try_files $uri $uri/ /index.html; }  # storefront
```

`^~` matters: it stops nginx from falling through to `location /` for anything
under `/admin/`, so a refresh on a console route returns `admin.html` instead
of the storefront. Verify after a deploy (`8080` = dev, `8081` = prod):

```bash
curl -s -H 'Accept: text/html' http://127.0.0.1:8080/admin/orders | grep -c assets/admin   # 1
curl -s http://127.0.0.1:8080/ | grep -c assets/storefront                                 # 1
```

### Stale-build errors after a deploy

Both SPAs are code-split, so a route pulls a hash-named chunk
(`/assets/StoresPage-DPQOZI4D.js`). Every build renames those chunks and every
deploy does `rm -rf /var/www/<root>/*`, so the previous build's files are gone
the moment a deploy lands. A browser still holding the old `index.html` then
asks for a chunk that no longer exists and the SPA fallback answers it with
`index.html` — HTML served as JavaScript, which the module loader rejects:

```
Failed to fetch dynamically imported module: https://uniemax.com/assets/StoresPage-DPQOZI4D.js
```

The symptom is a React Router error screen that a manual refresh clears, most
often right after a deploy. Three things prevent it, all live since 2026-09-11:

**1 + 2 — nginx** (`/etc/nginx/snippets/uniemax-spa-cache.conf`, `include`d by
all four uniemax vhosts so the policy has one source of truth):

```nginx
location ^~ /assets/ {
    try_files $uri =404;                                       # never fall back to HTML
    add_header Cache-Control "public, max-age=31536000, immutable";
}
location = /index.html { add_header Cache-Control "no-cache"; }
location = /admin.html { add_header Cache-Control "no-cache"; }
```

The shells previously went out with **no `Cache-Control` at all** — only an
ETag — so browsers cached them heuristically and a returning visitor could boot
last week's build without ever having a tab open. `no-cache` means "revalidate
every time", not "don't store", so the ETag still saves the bytes on a 304.
`location = /admin` needs its own `add_header` because its `try_files
/admin.html =404` serves the shell **without** an internal redirect, so it
never re-enters `location = /admin.html`.

Pre-change backups: `/etc/nginx/sites-available/*.pre-spa-cache`.

**3 — the app** (`frontend/src/shared/staleBuildReload.ts`, called from both
`main.tsx` entrypoints): listens for Vite's `vite:preloadError`, cancels it and
reloads once, so the tab that *was* open across a deploy recovers itself on the
same URL instead of showing the error screen. A sessionStorage stamp caps it at
one attempt per 30s, so an offline user or a genuinely broken deploy cannot put
the tab in a reload loop.

Verify after a deploy (`8080` = dev, `8081` = prod):

```bash
curl -sI http://127.0.0.1:8081/ | grep -i cache-control              # no-cache
curl -s -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:8081/assets/does-not-exist.js                     # 404, not 200
curl -sI http://127.0.0.1:8081/assets/<a real file>.js | grep -i cache-control   # immutable
```

### Web Push env (`VAPID_*`)

Push notifications need a VAPID key pair in the server's `backend/.env`.
Generate it **on the server, once**, and never rotate it casually — rotating
invalidates every browser subscription:

```bash
cd ~/uniemax/backend && npm run push-keys   # paste the three lines into .env
pm2 restart uniemax-backend
curl -s http://127.0.0.1:4000/api/v1/public/push-config   # {"publicKey":"B…","enabled":true}
```

> ⚠️ **Edit `.env` on the server with an editor, not a shell one-liner.**
> Quoting through PowerShell → plink → bash mangles values (a `VAPID_SUBJECT`
> once landed as `" mailto:…\`). `VAPID_SUBJECT` must be a plain `mailto:` or
> `https:` URL; anything else is now rejected by `package/push/config.ts`,
> which warns and falls back to the default rather than letting the server
> fail to boot.

Without the keys the app still works — the in-app notification bell fills
normally and the server logs each push instead of sending it. Push also
requires HTTPS, which both domains already have. Full detail:
[`PUSH_NOTIFICATIONS.md`](./PUSH_NOTIFICATIONS.md).
- pm2 process list is persisted (`pm2 save`), so `uniemax-backend` survives a
  reboot (pm2 startup is configured for the `ubuntu` user).

## Naming note

The GitHub repository is still called **legionx** (`zontechx-india/legionx`);
the product and everything on the server is named **uniemax / UnieMax**. The
repo will be renamed later — when that happens, update the git remote on the
server: `git remote set-url origin git@github.com:zontechx-india/<new-name>.git`.
