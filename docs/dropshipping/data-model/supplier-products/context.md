# Data model: supplier products (Phase 3) ☐

> **Read when:** working on the seller's copies of supplier products, pricing
> or sync. **Update when:** these models change.
> Conventions: [data-model](../context.md).

```prisma
enum ResaleState { ACTIVE PAUSED }
enum PauseReason { COST_ABOVE_PRICE SUPPLY_CLOSED SUPPLIER_INACTIVE LINK_INACTIVE SOURCE_REMOVED }

/// A seller's copy of a supply product.
model Resale {
  id              String          @id @default(cuid())
  sellerStoreId   String
  linkId          String
  link            SupplierLink    @relation(fields: [linkId], references: [id], onDelete: Restrict)
  productId       String          @unique              // the copy (seller's StoreProduct)
  supplyProductId String
  supplyProduct   SupplyProduct   @relation(fields: [supplyProductId], references: [id], onDelete: Restrict)
  followCost      Boolean         @default(true)       // D-12
  state           ResaleState     @default(ACTIVE)
  pauseReason     PauseReason?
  resumeOnClear   Boolean         @default(false)      // the copy was live when the system paused it
  variants        ResaleVariant[]
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  @@unique([sellerStoreId, supplyProductId])
}

model ResaleVariant {
  id              String  @id @default(cuid())
  resaleId        String
  resale          Resale  @relation(fields: [resaleId], references: [id], onDelete: Cascade)
  variantId       String  @unique                      // the copy's variant
  supplyVariantId String
  lastCost        Decimal @db.Decimal(10, 2)           // cost already applied to the price; makes follow-price idempotent
  @@index([supplyVariantId])
}
```
