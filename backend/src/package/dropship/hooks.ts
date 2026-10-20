import { HttpError } from "../../utils/httpError.js";
import { hook } from "../events/hooks.js";
import { deps } from "./deps.js";
import { pauseText, priceProblem } from "./domain.js";

/**
 * The core hooks this package answers (docs/dropshipping/architecture →
 * Hooks). Each looks its product up in `Resale` first, so a store with no
 * supplier products pays one indexed read and nothing else.
 */
export function registerHooks(): void {
  hook("product.saving", async (productId, change) => {
    const resale = await deps.prisma.resale.findUnique({
      where: { productId },
      include: { variants: true, supplyProduct: { include: { variants: true } } },
    });
    if (!resale) return;
    const input = change.input;

    if (change.kind === "copy") {
      // C-17: a duplicate would be an unlinked product the seller can't stock.
      throw HttpError.conflict("A supplier product can't be duplicated");
    }
    if (change.kind === "options") {
      throw HttpError.badRequest("Options are set by the supplier"); // C-4
    }
    if (change.kind === "update") {
      if (input.deliveryRule !== undefined || input.codAvailable !== undefined) {
        throw HttpError.badRequest("Delivery area and cash on delivery are set by the supplier");
      }
      if (input.isActive === true && resale.state === "PAUSED" && resale.pauseReason) {
        // C-15: fix the reason first.
        throw HttpError.conflict(`${pauseText(resale.pauseReason)} — fix that first, then switch it on`);
      }
      if (input.isActive === false && resale.resumeOnClear) {
        // The seller wants it off: a pause clearing must not switch it back on.
        await deps.prisma.resale.update({ where: { id: resale.id }, data: { resumeOnClear: false } });
      }
      return;
    }
    // kind === "variant"
    if (
      input.stockQuantity !== undefined ||
      input.isActive !== undefined ||
      input.compareAtPrice !== undefined
    ) {
      throw HttpError.badRequest("Stock, options and MRP are set by the supplier");
    }
    if (input.price !== undefined) {
      const rv = resale.variants.find((v) => v.variantId === change.variantId);
      const offer = rv && resale.supplyProduct.variants.find((v) => v.variantId === rv.supplyVariantId);
      if (!rv || !offer) return;
      const [source] = await deps.host.getProductSnapshots([resale.supplyProduct.productId]);
      const mrp = source?.variants.find((v) => v.id === rv.supplyVariantId)?.compareAtPrice ?? null;
      const problem = priceProblem(input.price as number, offer.cost, mrp);
      if (problem) throw HttpError.badRequest(problem); // C-3
    }
  });

  hook("order.placing", async (tx, orderId) => {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { productId: true, productName: true },
    });
    const ids = items.flatMap((i) => (i.productId ? [i.productId] : []));
    if (ids.length === 0) return;
    const copy = await tx.resale.findFirst({ where: { productId: { in: ids } }, select: { productId: true } });
    if (!copy) return;
    const name = items.find((i) => i.productId === copy.productId)?.productName ?? "This product";
    // C-24: orders for supplier products are routed from Phase 4.
    throw HttpError.conflict(`"${name}" is coming soon — it can't be ordered yet.`);
  });
}
