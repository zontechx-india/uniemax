# Data model: supplier orders (Phase 4) ☐

> **Read when:** working on supplier orders, their lines, status history or
> the terms snapshot. **Update when:** these models change.
> Conventions: [data-model](../context.md). Snapshot rule:
> [terms](../../terms/context.md).

```prisma
enum SupplierOrderStatus { AWAITING_PAYMENT EXPIRED NEW ACCEPTED SHIPPED DELIVERED REJECTED CANCELLED RETURNED }
enum PaymentMode         { PREPAID COD }
enum StatementState      { PENDING OWED HELD VOID }
enum SettleVia           { DIRECT SPLIT }              // D-16

/// One supplier's share of one customer order.
model SupplierOrder {
  id              String              @id @default(cuid())
  orderId         String                                // public.orders.id
  orderNumber     String                                // snapshot
  sellerStoreId   String
  supplierId      String
  supplier        Supplier            @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  linkId          String
  link            SupplierLink        @relation(fields: [linkId], references: [id], onDelete: Restrict)
  status          SupplierOrderStatus @default(AWAITING_PAYMENT)
  paymentMode     PaymentMode
  collectAmount   Decimal?            @db.Decimal(10, 2) // COD only: the order total
  // Terms snapshot (D-18): every later step reads these, never the current settings
  shipWithinDays  Int
  returnDays      Int
  returnFeePayer  ReturnFeePayer
  platformFee     Decimal             @default(0) @db.Decimal(10, 2)
  settleVia       SettleVia                             // may only fall back SPLIT → DIRECT (T-10)
  shipBy          DateTime?
  shipmentId      String?                               // core OrderShipment id once shipped
  closeReason     String?                               // why REJECTED / CANCELLED / EXPIRED / RETURNED
  issueOpenAt     DateTime?                             // "Report a problem"
  issueTicketId   String?
  adminResolvedAt DateTime?                             // admin "Needs action" → Resolve
  adminNote       String?
  costTotal       Decimal             @db.Decimal(10, 2)
  shippingFee     Decimal             @db.Decimal(10, 2)
  supplierShare   Decimal             @db.Decimal(10, 2) // costTotal + shippingFee
  statementState  StatementState      @default(PENDING)
  owedAt          DateTime?
  acceptedAt      DateTime?
  shippedAt       DateTime?
  deliveredAt     DateTime?
  closedAt        DateTime?
  lines           SupplierOrderLine[]
  events          SupplierOrderEvent[]
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  @@unique([orderId, supplierId])
  @@index([supplierId, status])
  @@index([sellerStoreId, createdAt])
  @@index([linkId, statementState])
  @@index([status, createdAt])
  @@index([status, shipBy])
}

model SupplierOrderLine {
  id                String        @id @default(cuid())
  supplierOrderId   String
  supplierOrder     SupplierOrder @relation(fields: [supplierOrderId], references: [id], onDelete: Cascade)
  orderItemId       String        @unique              // public.order_items.id
  supplierVariantId String                             // stock to reserve / release
  productName       String
  variantName       String?
  supplierSku       String?                            // the SUPPLIER's SKU, for its packing slip
  quantity          Int
  unitCost          Decimal       @db.Decimal(10, 2)   // snapshot at placement
}

/// Audit trail of every status change.
model SupplierOrderEvent {
  id              String               @id @default(cuid())
  supplierOrderId String
  supplierOrder   SupplierOrder        @relation(fields: [supplierOrderId], references: [id], onDelete: Cascade)
  from            SupplierOrderStatus?
  to              SupplierOrderStatus
  actor           DropshipActor
  actorId         String?
  note            String?
  createdAt       DateTime             @default(now())
  @@index([supplierOrderId, createdAt])
}
```
