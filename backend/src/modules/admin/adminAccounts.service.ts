import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { hashPassword } from "../../utils/password.js";
import { revokeAllSessions } from "../../package/auth/index.js";
import type { AdminCreateInput, AdminUpdateInput } from "./admin.schema.js";

/**
 * Platform-admin accounts. Only a SUPER_ADMIN may create, edit or reset one
 * — an ADMIN who could mint admins is a SUPER_ADMIN with extra steps.
 *
 * Two rules protect the console from locking itself out or being taken over:
 *   - nobody may change their own role or deactivate themselves;
 *   - the last active SUPER_ADMIN cannot be demoted or deactivated.
 */

const adminSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.AdminSelect;

/** Guard used by every mutating route in this file. */
export function assertSuperAdmin(role: string): void {
  if (role !== "SUPER_ADMIN") {
    throw HttpError.forbidden("Only a super admin can manage admin accounts");
  }
}

export async function listAdmins() {
  return prisma.admin.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: adminSelect,
  });
}

export async function createAdmin(input: AdminCreateInput) {
  const existing = await prisma.admin.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) throw HttpError.conflict("An admin with this email already exists");

  return prisma.admin.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      name: input.name ?? null,
      role: input.role,
    },
    select: adminSelect,
  });
}

/** Would this change leave the platform without an active super admin? */
async function assertNotLastSuperAdmin(targetId: string) {
  const others = await prisma.admin.count({
    where: { role: "SUPER_ADMIN", isActive: true, id: { not: targetId } },
  });
  if (others === 0) {
    throw HttpError.conflict(
      "This is the last active super admin — promote another one first",
    );
  }
}

export async function updateAdmin(
  actorId: string,
  targetId: string,
  input: AdminUpdateInput,
) {
  const target = await prisma.admin.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, isActive: true },
  });
  if (!target) throw HttpError.notFound("Admin not found");

  const losingSuperAdmin =
    (input.role !== undefined && input.role !== "SUPER_ADMIN") ||
    input.isActive === false;
  if (target.role === "SUPER_ADMIN" && losingSuperAdmin) {
    if (targetId === actorId) {
      throw HttpError.forbidden(
        "You cannot change your own role or deactivate yourself",
      );
    }
    await assertNotLastSuperAdmin(targetId);
  }

  const admin = await prisma.admin.update({
    where: { id: targetId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: adminSelect,
  });

  // A deactivated admin must lose access now, not when their token expires.
  //
  // A DEMOTED one too, and for a less obvious reason: the role rides in the
  // access token and is not re-read from this table per request, so a former
  // SUPER_ADMIN would otherwise keep super-admin powers until that token
  // expires. That window is up to `JWT_ACCESS_EXPIRES_IN` (15m) and it now
  // covers editing any seller's shop (`/api/v1/admin/manage/stores`), so the
  // demotion has to take effect at once. Revoking forces a refresh, which
  // mints a token carrying the new role.
  const roleChanged = input.role !== undefined && input.role !== target.role;
  if (input.isActive === false || roleChanged) {
    await revokeAllSessions(targetId, "admin");
  }
  return admin;
}

/**
 * Reset another admin's password (there is no self-service reset on the admin
 * surface). Every session of that admin is revoked, so a stolen session
 * cannot survive the reset that was meant to end it.
 */
export async function resetAdminPassword(targetId: string, password: string) {
  const target = await prisma.admin.findUnique({
    where: { id: targetId },
    select: { id: true },
  });
  if (!target) throw HttpError.notFound("Admin not found");

  await prisma.admin.update({
    where: { id: targetId },
    data: { passwordHash: await hashPassword(password) },
  });
  const revokedSessions = await revokeAllSessions(targetId, "admin");
  return { id: targetId, passwordReset: true, revokedSessions };
}
