# package/affiliate

Seller-run affiliate marketing. Full design: [docs/AFFILIATE.md](../../../../docs/AFFILIATE.md).

```
index.ts         registerAffiliate(app, { prisma, host }) — the only thing the app imports
types.ts         AffiliateHost — everything this package needs from the platform
hosts/           host implementations (inProcess today; an HTTP one on extraction)
domain.ts        pure rules: rate resolution, amounts, tokens
services/        program · invitations · partner · tracking · commissions
routes/          seller · partner · public · admin  (all under /api/v1/affiliate)
events.ts        order-event subscribers + the hourly approval/prune job
```

## Rules that keep it liftable

- Nothing in here imports core modules except `hosts/inProcess.ts`. Allowed
  shared imports: `utils/*`, `package/auth`, `package/events`, the generated
  Prisma client.
- The Prisma client is injected through `deps`, never imported.
- Affiliate tables live in the `affiliate` Postgres schema
  (`prisma/schema/affiliate.prisma`) with **no foreign key to a core table**.
- Event handlers are idempotent (`orderItemId` is unique), so redelivery is safe.
- The core knows one thing: `Order.affiliateRef`, an opaque string.

## Extracting to a standalone service

1. Move this folder and `prisma/schema/affiliate.prisma`; copy the allowed
   shared imports.
2. Write `hosts/remote.ts` against `AffiliateHost` (HTTP to the core).
3. Replace `package/events` with an outbox in the core + a poller here.
4. nginx: route `/api/v1/affiliate` to the new port. Frontend: repoint
   `packages/affiliate/config.ts`.
