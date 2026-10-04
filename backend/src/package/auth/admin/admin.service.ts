import { prisma, Prisma } from "../core/config/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import { authProviders } from "../providers/index.js";
import type { Principal } from "../core/authCore.types.js";
import {
  assertLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
} from "../core/loginThrottle.js";
import type { AdminLoginInput } from "./admin.schema.js";

/** Compared against for unknown/inactive accounts — see `authenticate`. */
const dummyHashPromise = authProviders.passwordHasher.hash(
  "timing-equalizer-not-a-real-password",
);

const publicAdminSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.AdminSelect;

/**
 * Admin credential provider: email + password only (no social/OTP on the
 * admin surface). Verifies credentials and returns the `principal` for the
 * core to issue a session — this service never mints tokens.
 */
export async function authenticate(input: AdminLoginInput) {
  // Per-account cool-down (see loginThrottle.ts), before any bcrypt work.
  assertLoginAllowed("admin", input.email);

  const admin = await prisma.admin.findUnique({
    where: { email: input.email },
  });

  // Same error whether the email is unknown or the password is wrong — never
  // reveal which accounts exist, in message OR in timing (the dummy compare
  // keeps an unknown email exactly as slow as a wrong password).
  if (!admin || !admin.isActive) {
    await authProviders.passwordHasher.verify(
      input.password,
      await dummyHashPromise,
    );
    recordLoginFailure("admin", input.email);
    throw HttpError.unauthorized("Invalid email or password");
  }

  const valid = await authProviders.passwordHasher.verify(
    input.password,
    admin.passwordHash,
  );
  if (!valid) {
    recordLoginFailure("admin", input.email);
    throw HttpError.unauthorized("Invalid email or password");
  }
  clearLoginFailures("admin", input.email);

  await prisma.admin.update({
    where: { id: admin.id },
    data: {
      lastLoginAt: new Date(),
      // Upgrade an older-work-factor hash while the plaintext is in hand.
      ...(authProviders.passwordHasher.needsRehash(admin.passwordHash)
        ? { passwordHash: await authProviders.passwordHasher.hash(input.password) }
        : {}),
    },
  });

  const { passwordHash: _omit, ...safe } = admin;
  const principal: Principal = { id: admin.id, type: "admin", role: admin.role };
  return { principal, admin: safe };
}

export async function getProfile(id: string) {
  const admin = await prisma.admin.findUnique({
    where: { id },
    select: publicAdminSelect,
  });
  if (!admin) throw HttpError.unauthorized("Admin account no longer exists");
  return admin;
}
