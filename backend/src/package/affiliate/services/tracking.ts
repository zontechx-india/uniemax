import { HttpError } from "../../../utils/httpError.js";
import { deps } from "../deps.js";
import { daysFromNow, newToken } from "../domain.js";

interface ClickMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
  referer?: string | undefined;
}

/**
 * A visitor opened /a/:token. Records the click, mints an attribution the
 * browser will carry to checkout, and says where the storefront should land.
 */
export async function recordClick(token: string, meta: ClickMeta) {
  const link = await deps.prisma.affiliateLink.findUnique({
    where: { token },
    include: {
      storeAffiliate: {
        select: { status: true, affiliate: { select: { status: true } } },
      },
    },
  });
  const usable =
    link?.enabled &&
    link.storeAffiliate.status === "ACTIVE" &&
    link.storeAffiliate.affiliate.status === "ACTIVE";
  if (!link || !usable) throw HttpError.notFound("This link is no longer active");

  const program = await deps.prisma.affiliateProgram.findUnique({
    where: { storeId: link.storeId },
    select: { enabled: true, attributionDays: true },
  });
  if (!program?.enabled) throw HttpError.notFound("This link is no longer active");

  const [attribution] = await deps.prisma.$transaction([
    deps.prisma.affiliateAttribution.create({
      data: {
        token: newToken(24),
        linkId: link.id,
        affiliateId: link.affiliateId,
        storeAffiliateId: link.storeAffiliateId,
        storeId: link.storeId,
        expiresAt: daysFromNow(program.attributionDays),
      },
    }),
    deps.prisma.affiliateLink.update({
      where: { id: link.id },
      data: { clickCount: { increment: 1 } },
    }),
    deps.prisma.affiliateClick.create({
      data: {
        linkId: link.id,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        referer: meta.referer ?? null,
      },
    }),
  ]);

  return {
    path: link.productSlug
      ? `/store/${link.storeSlug}/product/${link.productSlug}`
      : `/store/${link.storeSlug}`,
    storeSlug: link.storeSlug,
    ref: attribution.token,
    expiresAt: attribution.expiresAt,
  };
}
