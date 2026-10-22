# Data model: suppliers (Phase 2) ☑

> **Read when:** working on suppliers, invites, links, link terms, offered
> products or the terms log. **Update when:** these models change.
> Conventions: [data-model](../context.md).

Built 20 Oct 2026 in `backend/prisma/schema/dropship.prisma` (migration
`20261020180000_dropship_suppliers`, which also creates the `dropship` Postgres
schema). Every model and enum carries `@@schema("dropship")`; tables are
snake_case via `@@map`. Relations to later models (`Resale`, `SupplierOrder`,
`Settlement`) are added by the phases that build them.

```prisma
enum SupplierStatus     { PENDING ACTIVE SUSPENDED }   // PENDING only if inviteNeedsAdminApproval
enum SupplierVisibility { PRIVATE PUBLIC }             // PUBLIC = public catalogue, Phase 7
enum InviteStatus       { SENT ACCEPTED REVOKED EXPIRED }
enum LinkStatus         { PENDING ACTIVE PAUSED ENDED }   // PENDING: the joiner did not match the invite (D-51)
enum ReturnFeePayer     { SELLER SUPPLIER }            // who pays the supplier's fee when a parcel comes back (D-17)
enum DropshipActor      { SUPPLIER SELLER ADMIN SYSTEM }

/// A store that ships orders for the sellers it is linked to.
model Supplier {                                       // @@map("suppliers")
  id             String             @id @default(cuid())
  storeId        String             @unique            // the supplier's store
  supplyOnly     Boolean            @default(false)    // store created on joining (D-28): set-up steps hidden
  status         SupplierStatus     @default(ACTIVE)
  visibility     SupplierVisibility @default(PRIVATE)
  shippingFee    Decimal            @default(0) @db.Decimal(10, 2)  // per supplier order
  shipWithinDays Int                                    // asked when joining
  returnDays     Int                                    // 0 = no returns; asked, never pre-selected
  statusNote     String?                                // admin's note on suspend / restore
  links          SupplierLink[]
  products       SupplyProduct[]
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt
  @@index([status])
}

/// A one-time link a seller sends to bring a supplier.
model SupplierInvite {                                 // @@map("supplier_invites")
  id             String         @id @default(cuid())
  tokenHash      String         @unique                 // sha-256 of the link token; the token itself is never stored
  sellerStoreId  String
  createdBy      String                                 // customer id of the seller
  contactName    String
  contactPhone   String?
  contactEmail   String?
  codAllowed     Boolean                                // asked, never pre-selected (D-5)
  returnFeePayer ReturnFeePayer                         // asked, never pre-selected (D-17)
  status         InviteStatus   @default(SENT)          // EXPIRED written lazily; reads use inviteState()
  expiresAt      DateTime
  linkId         String?                                // set on accept
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  @@index([sellerStoreId, status])
}

/// One seller–supplier relationship.
model SupplierLink {                                   // @@map("supplier_links")
  id             String          @id @default(cuid())
  supplierId     String
  supplier       Supplier        @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  sellerStoreId  String
  codAllowed     Boolean                                // current term; orders keep their own copy (D-18)
  returnFeePayer ReturnFeePayer                         // current term; orders keep their own copy
  status         LinkStatus      @default(ACTIVE)
  statusBy       DropshipActor?                         // who paused / ended it (either side, D-19)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  @@unique([supplierId, sellerStoreId])
  @@index([sellerStoreId, status])
}

/// A supplier's own product offered to its sellers.
model SupplyProduct {                                  // @@map("supply_products")
  id         String          @id @default(cuid())
  supplierId String
  supplier   Supplier        @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  productId  String          @unique                   // supplier's own StoreProduct (never a copy)
  isOpen     Boolean         @default(true)
  variants   SupplyVariant[]
  createdAt  DateTime        @default(now())
  updatedAt  DateTime        @updatedAt
  @@index([supplierId, isOpen])
}

model SupplyVariant {                                  // @@map("supply_variants")
  id              String        @id @default(cuid())
  supplyProductId String
  supplyProduct   SupplyProduct @relation(fields: [supplyProductId], references: [id], onDelete: Cascade)
  variantId       String        @unique                // supplier's StoreProductVariant
  cost            Decimal       @db.Decimal(10, 2)     // "price for sellers"
  isOpen          Boolean       @default(true)
  @@index([supplyProductId])
}

/// Every change to a term, shown to both sides and kept for disputes (D-18).
/// A change takes effect for orders placed after createdAt.
model TermsChange {                                    // @@map("terms_changes")
  id         String        @id @default(cuid())
  supplierId String
  linkId     String?                                   // null = a supplier-wide term (fee, ship within, returns, price)
  field      String                                    // "shippingFee" · "shipWithinDays" · "returnDays" · "cost:{variantId}" · "codAllowed" · "returnFeePayer"
  fromValue  String?                                   // null on the first value (written when joining)
  toValue    String?                                   // null on "cost:…" = no longer offered
  changedBy  String                                    // customer or admin id
  changedAs  DropshipActor
  createdAt  DateTime      @default(now())
  @@index([supplierId, createdAt])
  @@index([linkId, createdAt])
}
```

Joining writes the first values into `TermsChange` too (`fromValue: null`): the
link's two terms as `SELLER` (the inviter), and a new supplier's fee,
ship-within and returns as `SUPPLIER`. So the log is the whole record (T-11).
