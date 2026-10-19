# Data model: suppliers (Phase 2) ☐

> **Read when:** working on suppliers, invites, links, link terms, offered
> products or the terms log. **Update when:** these models change.
> Conventions: [data-model](../context.md).

```prisma
enum SupplierStatus     { PENDING ACTIVE SUSPENDED }   // PENDING only if inviteNeedsAdminApproval
enum SupplierVisibility { PRIVATE PUBLIC }             // PUBLIC = public catalogue, Phase 7
enum InviteStatus       { SENT ACCEPTED REVOKED EXPIRED }
enum LinkStatus         { ACTIVE PAUSED ENDED }
enum ReturnFeePayer     { SELLER SUPPLIER }            // who pays the supplier's fee when a parcel comes back (D-17)
enum DropshipActor      { SUPPLIER SELLER ADMIN SYSTEM }

/// A store that ships orders for the sellers it is linked to.
model Supplier {
  id             String             @id @default(cuid())
  storeId        String             @unique            // the supplier's store
  status         SupplierStatus     @default(ACTIVE)
  visibility     SupplierVisibility @default(PRIVATE)
  shippingFee    Decimal            @default(0) @db.Decimal(10, 2)  // per supplier order
  shipWithinDays Int                                    // asked when joining
  returnDays     Int                                    // 0 = no returns; asked, never pre-selected
  statusNote     String?                                // admin's note on suspend
  links          SupplierLink[]
  products       SupplyProduct[]
  orders         SupplierOrder[]
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt
}

/// A one-time link a seller sends to bring a supplier.
model SupplierInvite {
  id             String         @id @default(cuid())
  tokenHash      String         @unique                 // sha-256 of the link token; the token itself is never stored
  sellerStoreId  String
  createdBy      String                                 // customer id of the seller
  contactName    String
  contactPhone   String?
  contactEmail   String?
  codAllowed     Boolean                                // asked, never pre-selected (D-5)
  returnFeePayer ReturnFeePayer                         // asked, never pre-selected (D-17)
  status         InviteStatus   @default(SENT)
  expiresAt      DateTime
  linkId         String?                                // set on accept
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  @@index([sellerStoreId, status])
}

/// One seller–supplier relationship.
model SupplierLink {
  id             String          @id @default(cuid())
  supplierId     String
  supplier       Supplier        @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  sellerStoreId  String
  codAllowed     Boolean                                // current term; orders keep their own copy (D-18)
  returnFeePayer ReturnFeePayer                         // current term; orders keep their own copy
  status         LinkStatus      @default(ACTIVE)
  statusBy       DropshipActor?                         // who paused / ended it (either side, D-19)
  resales        Resale[]
  orders         SupplierOrder[]
  settlements    Settlement[]
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  @@unique([supplierId, sellerStoreId])
  @@index([sellerStoreId, status])
}

/// A supplier's own product offered to its sellers.
model SupplyProduct {
  id         String          @id @default(cuid())
  supplierId String
  supplier   Supplier        @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  productId  String          @unique                   // supplier's own StoreProduct (never a copy)
  isOpen     Boolean         @default(true)
  variants   SupplyVariant[]
  resales    Resale[]
  createdAt  DateTime        @default(now())
  updatedAt  DateTime        @updatedAt
  @@index([supplierId, isOpen])
}

model SupplyVariant {
  id              String        @id @default(cuid())
  supplyProductId String
  supplyProduct   SupplyProduct @relation(fields: [supplyProductId], references: [id], onDelete: Cascade)
  variantId       String        @unique                // supplier's StoreProductVariant
  cost            Decimal       @db.Decimal(10, 2)     // "price for sellers"
  isOpen          Boolean       @default(true)
}

/// Every change to a term, shown to both sides and kept for disputes (D-18).
/// A change takes effect for orders placed after createdAt.
model TermsChange {
  id         String        @id @default(cuid())
  supplierId String
  linkId     String?                                   // null = a supplier-wide term (fee, ship within, returns, price)
  field      String                                    // "shippingFee" · "shipWithinDays" · "returnDays" · "cost:{variantId}" · "codAllowed" · "returnFeePayer"
  fromValue  String?
  toValue    String?
  changedBy  String                                    // customer or admin id
  changedAs  DropshipActor
  createdAt  DateTime      @default(now())
  @@index([supplierId, createdAt])
  @@index([linkId, createdAt])
}
```
