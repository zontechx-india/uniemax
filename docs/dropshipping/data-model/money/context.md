# Data model: money (Phases 5–6) ☐

> **Read when:** working on recorded payments or Easy Split fields.
> **Update when:** these models change. Conventions: [data-model](../context.md).

## Phase 5: recorded payments ☐

```prisma
enum SettlementDirection { SELLER_TO_SUPPLIER SUPPLIER_TO_SELLER }

/// A payment one side recorded as made to the other (D-16, DIRECT lines).
model Settlement {
  id         String              @id @default(cuid())
  linkId     String
  link       SupplierLink        @relation(fields: [linkId], references: [id], onDelete: Restrict)
  direction  SettlementDirection
  amount     Decimal             @db.Decimal(10, 2)
  paidOn     DateTime
  reference  String?                                   // UPI / bank reference
  note       String?
  recordedBy String                                    // customer id
  recordedAs DropshipActor                             // SELLER or SUPPLIER
  deletedAt  DateTime?                                 // the recorder can delete their own entry; kept for audit
  createdAt  DateTime            @default(now())
  @@index([linkId, paidOn])
}
```

## Phase 6: Easy Split ☐

```prisma
enum SplitState { REQUESTED DONE FAILED FALLBACK_DIRECT }
// StatementState gains: SPLIT
// SupplierOrder gains:
//   splitState SplitState?
//   splitRef   String?      // PaymentHub / Cashfree split reference
//   splitAt    DateTime?
```

Payout accounts (Cashfree vendors) belong to the core payments track, not to
this schema. The host answers `getPayoutAccount(storeId)`.
