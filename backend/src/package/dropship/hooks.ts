import { HttpError } from "../../utils/httpError.js";
import { hook } from "../events/hooks.js";
import { deps } from "./deps.js";
import { COD_SPLIT_REFUSED, PICKUP_REFUSED, onePlace, pauseText, priceProblem } from "./domain.js";
import * as orders from "./services/supplierOrders.js";

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

  // Placement, the gateway's undo and every cancel run inside the core's own
  // transaction (services/supplierOrders.ts): stock is reserved, tagged and
  // snapshotted together, or the whole placement is refused (K-1, K-7).
  hook("order.placing", (tx, orderId) => orders.place(tx, orderId));
  hook("order.unplacing", (tx, orderId) => orders.unplace(tx, orderId));
  hook("order.cancelling", (tx, orderId) => orders.cancelling(tx, orderId));

  // K-4, K-5: pickup is never offered for supplier products, and cash on
  // delivery only when the whole order ships as one parcel (D-13).
  hook("checkout.options", async (_storeId, lines) => {
    const ids = lines.map((l) => l.productId);
    if (ids.length === 0) return {};
    const copies = await deps.prisma.resale.findMany({
      where: { productId: { in: ids } },
      select: { productId: true, link: { select: { supplierId: true } } },
    });
    if (copies.length === 0) return {};
    const supplierOf = new Map(copies.map((c) => [c.productId, c.link.supplierId]));
    const places = lines.map((l) => ({ supplierId: supplierOf.get(l.productId) ?? null }));
    return { pickup: PICKUP_REFUSED, cod: onePlace(places) ? null : COD_SPLIT_REFUSED };
  });
}
