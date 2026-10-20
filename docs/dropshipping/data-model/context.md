# Data model

> **Read when:** you need a table or field. Open only the file for your area
> (index below). **Update when:** the schema changes. Once a model is built,
> mark it ☑ and make sure it matches the code exactly.

## Conventions

- Money is `Decimal(10, 2)` end to end, never a JS float.
- Every dropship model carries `@@schema("dropship")` (left out of the
  snippets for brevity) and lives in `backend/prisma/schema/dropship.prisma`.
- No foreign keys to `public.*`. Ids pointing at core rows are plain strings.
- Shared enums: `DropshipActor` and `ReturnFeePayer` are defined in
  [suppliers](suppliers/context.md) (Phase 2) and used by later phases.

## Index

| Area | Models | Phase | File |
| --- | --- | --- | --- |
| Core additions | `OrderShipment` ☑, `OrderItem.shipmentId` ☑, `OrderItem.fulfilledBy` ☑, `NotificationKind.DROPSHIP` ☑ | 0, 1 | this file (below) |
| Suppliers | `Supplier` ☑, `SupplierInvite` ☑, `SupplierLink` ☑, `SupplyProduct` ☑, `SupplyVariant` ☑, `TermsChange` ☑ | 2 | [suppliers/context.md](suppliers/context.md) |
| Supplier products | `Resale` ☑, `ResaleVariant` ☑ | 3 | [supplier-products/context.md](supplier-products/context.md) |
| Orders | `SupplierOrder`, `SupplierOrderLine`, `SupplierOrderEvent` | 4 | [orders/context.md](orders/context.md) |
| Money | `Settlement`; Easy Split fields | 5, 6 | [money/context.md](money/context.md) |

## Core additions (`prisma/schema/core.prisma`)

Once built, these are documented in `BACKEND_CONTEXT.md` (Data Model), and
this section links there.

### Phase 0 ☑ (built 20 Oct 2026 — migration `20261020120000_order_shipments`)

Documented in full in `BACKEND_CONTEXT.md` (Data Model → **OrderShipment**);
the shape, for reference:

```prisma
enum ShipmentSource { SELLER PACKAGE }

/// One parcel of an order: courier, tracking, and what happened to it.
model OrderShipment {
  id             String         @id @default(cuid())
  orderId        String
  order          Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  carrierCode    String?                    // code from modules/orders/couriers.ts; null = typed "Other"
  carrier        String                     // the name, snapshotted
  trackingNumber String?                    // required for PACKAGE parcels (D-4)
  trackingUrl    String?                    // only a link the seller pasted (D-24)
  senderName     String?                    // "Shipped by {supplier}"; null = the store itself
  source         ShipmentSource @default(SELLER)
  externalRef    String?                    // opaque, e.g. the supplier order id
  shippedAt      DateTime       @default(now())
  deliveredAt    DateTime?
  returnedAt     DateTime?                  // "came back"
  restocked      Boolean        @default(false) // its returned items went back in stock on cancel
  podKey         String?                    // optional proof-of-delivery photo (media bucket)
  items          OrderItem[]
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  @@index([orderId])
  @@map("order_shipments")
}

// OrderItem gains:
//   shipmentId String?  → OrderShipment (onDelete: SetNull), @@index([shipmentId])
//   — the parcel this item went out in
```

### Phase 1 ☑ (built 20 Oct 2026 — migration `20261020150000_package_seams`)

```prisma
// OrderItem gains:
//   fulfilledBy String?   — opaque tag set by a package inside order.placing
//                           ("dropship"); null = the seller ships it
// NotificationKind gains: DROPSHIP
```
