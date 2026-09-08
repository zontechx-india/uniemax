import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { ok, list } from "../../utils/response.js";
import { HttpError } from "../../utils/httpError.js";
import { idParamSchema } from "../../utils/zodHelpers.js";
import * as schema from "./admin.schema.js";
import * as dashboard from "./adminDashboard.service.js";
import * as stores from "./adminStores.service.js";
import * as customers from "./adminCustomers.service.js";
import * as orders from "./adminOrders.service.js";
import * as products from "./adminProducts.service.js";
import * as accounts from "./adminAccounts.service.js";
import * as categoryMapping from "./adminCategoryMapping.service.js";
import { listAudit, recordAudit } from "./adminAudit.js";

/**
 * Thin controllers for the platform-admin console: parse with Zod, call the
 * service, wrap in the standard envelope — and, for every write, append one
 * audit line. Nothing else lives here.
 */

/** The acting admin. `requireAdmin` has already run, so it is always set. */
function actor(request: FastifyRequest) {
  if (!request.admin) throw HttpError.unauthorized();
  return request.admin;
}

const storeParams = z.object({ id: z.string().min(1) });
const bankParams = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
});

// ---- Dashboard ------------------------------------------------------------

export async function getDashboard(request: FastifyRequest) {
  const query = schema.rangeQuery.parse(request.query);
  return ok(await dashboard.getDashboard(query));
}

// ---- Stores ---------------------------------------------------------------

export async function listStores(request: FastifyRequest) {
  const query = schema.storeListQuery.parse(request.query);
  const { rows, meta } = await stores.listStores(query);
  return list(rows, meta);
}

export async function getStore(request: FastifyRequest) {
  const { id } = storeParams.parse(request.params);
  return ok(await stores.getStore(id));
}

export async function suspendStore(request: FastifyRequest) {
  const { id } = storeParams.parse(request.params);
  const input = schema.storeSuspendSchema.parse(request.body);
  const store = await stores.setSuspended(id, input);
  recordAudit(request, {
    action: input.suspended ? "store.suspend" : "store.restore",
    entityType: "store",
    entityId: store.id,
    meta: { name: store.name, reason: input.reason ?? null },
  });
  return ok(store);
}

export async function verifyBankAccount(request: FastifyRequest) {
  const { id, accountId } = bankParams.parse(request.params);
  const input = schema.bankVerificationSchema.parse(request.body);
  const store = await stores.setBankVerification(
    id,
    accountId,
    actor(request).id,
    input,
  );
  recordAudit(request, {
    action: `bankAccount.${input.status.toLowerCase()}`,
    entityType: "storeBankAccount",
    entityId: accountId,
    meta: { storeId: store.id, note: input.note ?? null },
  });
  return ok(store);
}

// ---- Customers ------------------------------------------------------------

export async function listCustomers(request: FastifyRequest) {
  const query = schema.customerListQuery.parse(request.query);
  const { rows, meta } = await customers.listCustomers(query);
  return list(rows, meta);
}

export async function getCustomer(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await customers.getCustomer(id));
}

export async function blockCustomer(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const input = schema.customerBlockSchema.parse(request.body);
  const customer = await customers.setBlocked(id, input);
  recordAudit(request, {
    action: input.blocked ? "customer.block" : "customer.unblock",
    entityType: "customer",
    entityId: id,
    meta: {
      email: customer.email,
      reason: input.reason ?? null,
      revokedSessions: customer.revokedSessions,
    },
  });
  return ok(customer);
}

// ---- Orders & payments ----------------------------------------------------

export async function listOrders(request: FastifyRequest) {
  const query = schema.orderListQuery.parse(request.query);
  const { rows, meta, filteredRevenue } = await orders.listOrders(query);
  return { ...list(rows, meta), filteredRevenue };
}

export async function getOrder(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await orders.getOrder(id));
}

export async function listPayments(request: FastifyRequest) {
  const query = schema.paymentListQuery.parse(request.query);
  const { rows, meta, totals } = await orders.listPayments(query);
  return { ...list(rows, meta), totals };
}

// ---- Products -------------------------------------------------------------

export async function listProducts(request: FastifyRequest) {
  const query = schema.productListQuery.parse(request.query);
  const { rows, meta } = await products.listProducts(query);
  return list(rows, meta);
}

export async function getProduct(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await products.getProduct(id));
}

export async function setProductVisibility(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const input = schema.productVisibilitySchema.parse(request.body);
  const product = await products.setVisibility(id, input);
  recordAudit(request, {
    action: input.isActive ? "product.show" : "product.hide",
    entityType: "storeProduct",
    entityId: id,
    meta: { name: product.name, reason: input.reason ?? null },
  });
  return ok(product);
}

// ---- Audit trail ----------------------------------------------------------

/** Shelves a seller typed before the taxonomy existed. */
export async function listShelfMappings(request: FastifyRequest) {
  const query = schema.shelfListQuery.parse(request.query);
  const result = await categoryMapping.listShelves(query);
  return list(result.rows, result.meta);
}

/**
 * Convert a typed shelf into a platform category. `dryRun` returns the plan
 * only — no write, no audit line — which is what the console shows before
 * asking for confirmation.
 */
export async function convertShelf(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const input = schema.shelfConvertSchema.parse(request.body);
  if (input.dryRun) {
    return ok(await categoryMapping.planConversion(id, input.categoryId));
  }
  const result = await categoryMapping.convertShelf(id, input.categoryId);
  recordAudit(request, {
    action: "storeCategory.convert",
    entityType: "storeCategory",
    entityId: result.shelf.id,
    meta: {
      store: result.shelf.store.name,
      from: result.plan.from.shelfPath,
      to: result.plan.to.pathLabel,
      how: result.plan.action,
      productsMoved: result.plan.productsMoved,
      parentCreated: result.plan.parent?.created ?? false,
    },
  });
  return ok(result);
}

export async function getAudit(request: FastifyRequest) {
  const query = schema.auditListQuery.parse(request.query);
  const { rows, meta } = await listAudit(query);
  return list(rows, meta);
}

// ---- Admin accounts (SUPER_ADMIN only) ------------------------------------

export async function listAdmins(request: FastifyRequest) {
  accounts.assertSuperAdmin(actor(request).role);
  return ok(await accounts.listAdmins());
}

export async function createAdmin(request: FastifyRequest) {
  accounts.assertSuperAdmin(actor(request).role);
  const input = schema.adminCreateSchema.parse(request.body);
  const admin = await accounts.createAdmin(input);
  recordAudit(request, {
    action: "admin.create",
    entityType: "admin",
    entityId: admin.id,
    meta: { email: admin.email, role: admin.role },
  });
  return ok(admin);
}

export async function updateAdmin(request: FastifyRequest) {
  const me = actor(request);
  accounts.assertSuperAdmin(me.role);
  const { id } = idParamSchema.parse(request.params);
  const input = schema.adminUpdateSchema.parse(request.body);
  const admin = await accounts.updateAdmin(me.id, id, input);
  recordAudit(request, {
    action: "admin.update",
    entityType: "admin",
    entityId: id,
    meta: { ...input },
  });
  return ok(admin);
}

export async function resetAdminPassword(request: FastifyRequest) {
  accounts.assertSuperAdmin(actor(request).role);
  const { id } = idParamSchema.parse(request.params);
  const { password } = schema.adminPasswordSchema.parse(request.body);
  const result = await accounts.resetAdminPassword(id, password);
  recordAudit(request, {
    action: "admin.passwordReset",
    entityType: "admin",
    entityId: id,
    meta: { revokedSessions: result.revokedSessions },
  });
  return ok(result);
}
