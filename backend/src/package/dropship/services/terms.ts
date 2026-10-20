import type { Prisma } from "../../../generated/prisma/client.js";
import { deps } from "../deps.js";
import { describeChange } from "../domain.js";
import type { TermDiff } from "../domain.js";

type Tx = Prisma.TransactionClient;
type Actor = "SUPPLIER" | "SELLER" | "ADMIN" | "SYSTEM";

/** Write one TermsChange row per diff (D-18: every change is logged). */
export async function logChanges(
  tx: Tx,
  input: {
    supplierId: string;
    linkId: string | null;
    diffs: TermDiff[];
    changedBy: string;
    changedAs: Actor;
  },
): Promise<void> {
  if (input.diffs.length === 0) return;
  await tx.termsChange.createMany({
    data: input.diffs.map((d) => ({
      supplierId: input.supplierId,
      linkId: input.linkId,
      field: d.field,
      fromValue: d.fromValue,
      toValue: d.toValue,
      changedBy: input.changedBy,
      changedAs: input.changedAs,
    })),
  });
}

/**
 * A link's terms as they stand now, plus its change log: the link's own terms
 * (COD, returned-parcel fee) and the supplier-wide ones (fee, ship within,
 * returns, prices for sellers). Newest first.
 */
export async function linkTerms(linkId: string) {
  const link = await deps.prisma.supplierLink.findUniqueOrThrow({
    where: { id: linkId },
    include: { supplier: true },
  });
  const rows = await deps.prisma.termsChange.findMany({
    where: {
      OR: [{ linkId }, { supplierId: link.supplierId, linkId: null }],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return {
    current: {
      codAllowed: link.codAllowed,
      returnFeePayer: link.returnFeePayer,
      shippingFee: Number(link.supplier.shippingFee),
      shipWithinDays: link.supplier.shipWithinDays,
      returnDays: link.supplier.returnDays,
    },
    log: rows.map((row) => ({
      id: row.id,
      field: row.field,
      fromValue: row.fromValue,
      toValue: row.toValue,
      changedAs: row.changedAs,
      createdAt: row.createdAt,
      text: describeChange(row.field, row.fromValue, row.toValue),
    })),
  };
}
