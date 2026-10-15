import { randomBytes } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import { resolveAudience, siteUrl } from "./whatsapp.audiences.js";
import { WaApiError } from "./whatsapp.client.js";
import { isTrackingUrl, resolveMapping } from "./whatsapp.fields.js";
import type { Mapping } from "./whatsapp.fields.js";
import type { CampaignDraft } from "./whatsapp.schema.js";
import { availableTemplates, isAllowedRecipient, sendTemplate } from "./whatsapp.service.js";
import { fillTemplateBody, templateSendProblem } from "./whatsapp.templates.js";
import type { TemplateSummary } from "./whatsapp.templates.js";

/**
 * Campaigns — one approved template, filled per person, sent to an audience.
 *
 * Creating one resolves the audience ONCE into `WaCampaignRecipient` rows
 * (PENDING, or SKIPPED with the reason) and returns. A background worker in
 * this process then works through PENDING rows at WA_SEND_RATE_PER_SEC:
 * scheduled campaigns start at their time, PAUSED ones wait, a restart
 * resumes where it stopped (a row caught mid-send is marked FAILED, never
 * re-sent — a duplicate is worse than a gap). Each row is claimed with a
 * PENDING → SENDING compare-and-set, so a row is sent at most once.
 *
 * Skipped at creation, with the reason kept per row: no usable number,
 * opted out (STOP), no marketing consent when `requireOptIn`, messaged by
 * another campaign within `frequencyCapHours`, a value the mapping couldn't
 * fill, and — outside production — numbers not on the dev allowlist.
 */

// ---- Checking a draft --------------------------------------------------------

interface PlannedRecipient {
  waId: string;
  name: string | null;
  bodyParams: string[];
  buttons: { value: string; track: boolean }[];
  skip: string | null;
}

async function templateFor(
  draft: Pick<CampaignDraft, "templateName" | "languageCode" | "mapping">,
  log: FastifyBaseLogger,
): Promise<TemplateSummary> {
  const templates = await availableTemplates(log);
  if (!templates) {
    throw new HttpError(503, "Couldn't read the templates from WhatsApp right now — try again in a minute");
  }
  return checkMapping(templates, draft.templateName, draft.languageCode, draft.mapping);
}

/** The mapping fits the template — counts, media header type, trackable buttons. */
export function checkMapping(
  templates: TemplateSummary[],
  name: string,
  language: string,
  mapping: Mapping,
): TemplateSummary {
  const problem = templateSendProblem(templates, name, language, {
    params: mapping.body.length,
    buttons: mapping.buttons.length,
    headerMedia: mapping.header !== null,
  });
  if (problem) throw new HttpError(422, problem);
  const template = templates.find((t) => t.name === name && t.language === language)!;
  if (mapping.header && template.headerMedia !== mapping.header.type) {
    throw new HttpError(422, `This template's header is a ${template.headerMedia} — not a ${mapping.header.type}`);
  }
  mapping.buttons.forEach((button, i) => {
    if (button.track && !isTrackingUrl(template.urlButtons[i]!.url)) {
      throw new HttpError(
        422,
        `Button "${template.urlButtons[i]!.text}" can't count clicks — its link in the template must be ${siteUrl()}/api/v1/r/{{1}}`,
      );
    }
  });
  return template;
}

async function plan(draft: CampaignDraft, log: FastifyBaseLogger) {
  const template = await templateFor(draft, log);
  const audience = await resolveAudience(draft.audience);
  const waIds = audience.members.map((m) => m.waId);

  const [contacts, capped] = await Promise.all([
    waIds.length
      ? prisma.waContact.findMany({
          where: { waId: { in: waIds } },
          select: { waId: true, optedOut: true, marketingOptInAt: true },
        })
      : [],
    draft.frequencyCapHours > 0 && waIds.length
      ? prisma.waMessage.findMany({
          where: {
            direction: "OUT",
            campaignId: { not: null },
            waId: { in: waIds },
            createdAt: { gte: new Date(Date.now() - draft.frequencyCapHours * 60 * 60 * 1000) },
          },
          distinct: ["waId"],
          select: { waId: true },
        })
      : [],
  ]);
  const contactBy = new Map(contacts.map((c) => [c.waId, c]));
  const cappedSet = new Set(capped.map((c) => c.waId));

  const recipients: PlannedRecipient[] = audience.members.map((member) => {
    const contact = contactBy.get(member.waId);
    const filled = resolveMapping(draft.mapping, member.fields);
    let skip: string | null = null;
    if (!isAllowedRecipient(member.waId)) skip = "Not on the test allowlist";
    else if (contact?.optedOut) skip = "Opted out (STOP)";
    else if (draft.requireOptIn && !contact?.marketingOptInAt) skip = "No marketing consent";
    else if (cappedSet.has(member.waId)) skip = `Messaged in the last ${draft.frequencyCapHours}h`;
    else if (filled.unfilled.length > 0) skip = `Missing value for ${filled.unfilled.join(", ")}`;
    else if (filled.buttons.some((b) => b.track && !/^https?:\/\//i.test(b.value))) {
      skip = "Tracked link is not a web address";
    }
    return {
      waId: member.waId,
      name: member.name,
      bodyParams: filled.bodyParams,
      buttons: filled.buttons,
      skip,
    };
  });

  const skipped: Record<string, number> = {};
  for (const r of recipients) {
    if (r.skip) {
      // Group "Missing value for {{2}}" style reasons under one label.
      const key = r.skip.startsWith("Missing value") ? "Missing a value" : r.skip;
      skipped[key] = (skipped[key] ?? 0) + 1;
    }
  }
  return {
    template,
    recipients,
    invalid: audience.invalid,
    duplicates: audience.duplicates,
    skipped,
    eligible: recipients.filter((r) => !r.skip).length,
  };
}

function previewButtons(template: TemplateSummary, buttons: PlannedRecipient["buttons"]) {
  return buttons.map((b, i) => ({
    text: template.urlButtons[i]?.text ?? `Button ${i + 1}`,
    url: b.track ? b.value : (template.urlButtons[i]?.url ?? "").replace(/\{\{\s*1\s*\}\}/, b.value),
  }));
}

/** Counts, skip reasons and a few filled-in messages — before anything is sent. */
export async function previewCampaign(draft: CampaignDraft, log: FastifyBaseLogger) {
  const p = await plan(draft, log);
  return {
    total: p.recipients.length,
    eligible: p.eligible,
    skipped: p.skipped,
    invalid: p.invalid,
    duplicates: p.duplicates,
    category: p.template.category,
    sample: p.recipients
      .filter((r) => !r.skip)
      .slice(0, 5)
      .map((r) => ({
        waId: r.waId,
        name: r.name,
        body: fillTemplateBody(p.template.body, r.bodyParams),
        buttons: previewButtons(p.template, r.buttons),
      })),
  };
}

// ---- Links -------------------------------------------------------------------

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode(): string {
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/**
 * A tracked link's redirect: count the click, then send the person on.
 * Unknown codes go to the site's home page rather than an error — the
 * person tapped a button in good faith.
 */
export async function followLink(code: string): Promise<string> {
  if (!/^[A-Za-z0-9]{6,20}$/.test(code)) return siteUrl();
  const now = new Date();
  const link = await prisma.waLink
    .update({
      where: { code },
      data: { clicks: { increment: 1 }, lastClickedAt: now },
      select: { url: true, firstClickedAt: true },
    })
    .catch(() => null);
  if (!link) return siteUrl();
  if (!link.firstClickedAt) {
    await prisma.waLink.updateMany({
      where: { code, firstClickedAt: null },
      data: { firstClickedAt: now },
    });
  }
  return link.url;
}

// ---- Creating ----------------------------------------------------------------

export async function createCampaign(
  draft: CampaignDraft,
  adminId: string | null,
  log: FastifyBaseLogger,
) {
  const p = await plan(draft, log);
  if (p.eligible === 0) {
    const reasons = Object.entries(p.skipped)
      .map(([reason, n]) => `${n} ${reason.toLowerCase()}`)
      .join(", ");
    throw new HttpError(
      422,
      p.recipients.length === 0
        ? "This audience has no one with a usable WhatsApp number"
        : `No one in this audience can be sent to (${reasons})`,
    );
  }

  const now = new Date();
  const scheduled = draft.scheduledAt && draft.scheduledAt.getTime() > now.getTime() + 30_000;
  const skippedCount = p.recipients.length - p.eligible;

  const campaign = await prisma.waCampaign.create({
    data: {
      name: draft.name,
      templateName: draft.templateName,
      languageCode: draft.languageCode,
      category: p.template.category,
      status: scheduled ? "SCHEDULED" : "SENDING",
      scheduledAt: scheduled ? draft.scheduledAt : null,
      startedAt: scheduled ? null : now,
      audience: draft.audience as Prisma.InputJsonValue,
      mapping: draft.mapping as Prisma.InputJsonValue,
      requireOptIn: draft.requireOptIn,
      frequencyCapHours: draft.frequencyCapHours,
      createdBy: adminId,
      total: p.recipients.length,
      skipped: skippedCount,
    },
    select: { id: true },
  });

  // Tracked buttons get their code now, so the queue row already holds the
  // exact values that will be sent.
  const links: { code: string; url: string; campaignId: string; waId: string }[] = [];
  const rows = p.recipients.map((r) => {
    const buttonParams = r.skip
      ? []
      : r.buttons.map((b) => {
          if (!b.track) return b.value;
          const code = newCode();
          links.push({ code, url: b.value, campaignId: campaign.id, waId: r.waId });
          return code;
        });
    return {
      campaignId: campaign.id,
      waId: r.waId,
      name: r.name,
      bodyParams: r.bodyParams,
      buttonParams,
      status: r.skip ? ("SKIPPED" as const) : ("PENDING" as const),
      note: r.skip,
      processedAt: r.skip ? now : null,
    };
  });
  for (let i = 0; i < rows.length; i += 1000) {
    await prisma.waCampaignRecipient.createMany({ data: rows.slice(i, i + 1000) });
  }
  for (let i = 0; i < links.length; i += 1000) {
    await prisma.waLink.createMany({ data: links.slice(i, i + 1000) });
  }

  wake(log);
  return { campaignId: campaign.id, eligible: p.eligible, skipped: skippedCount };
}

/**
 * One message to the admin's own number with the first eligible person's
 * values — what they will actually get, before the whole list does.
 */
export async function testCampaign(draft: CampaignDraft & { to: string }, log: FastifyBaseLogger) {
  const p = await plan(draft, log);
  const sample = p.recipients.find((r) => !r.skip);
  if (!sample) throw new HttpError(422, "No one in this audience can be sent to, so there are no values to test with");
  const buttonParams: string[] = [];
  for (const b of sample.buttons) {
    if (!b.track) {
      buttonParams.push(b.value);
      continue;
    }
    const code = newCode();
    await prisma.waLink.create({ data: { code, url: b.value, waId: null, campaignId: null } });
    buttonParams.push(code);
  }
  await sendTemplate(
    {
      to: draft.to,
      templateName: draft.templateName,
      languageCode: draft.languageCode,
      bodyParams: sample.bodyParams,
      buttonParams,
      header: draft.mapping.header,
    },
    log,
  );
  return { usedValuesOf: sample.name ?? `+${sample.waId}` };
}

// ---- Controls ----------------------------------------------------------------

export async function controlCampaign(
  id: string,
  action: "pause" | "resume" | "cancel",
  log: FastifyBaseLogger,
) {
  const campaign = await prisma.waCampaign.findUnique({
    where: { id },
    select: { status: true, scheduledAt: true },
  });
  if (!campaign) throw HttpError.notFound("Campaign not found");
  const now = new Date();

  if (action === "pause") {
    if (campaign.status !== "SENDING" && campaign.status !== "SCHEDULED") {
      throw HttpError.conflict("Only a sending or scheduled campaign can be paused");
    }
    await prisma.waCampaign.update({ where: { id }, data: { status: "PAUSED" } });
  } else if (action === "resume") {
    if (campaign.status !== "PAUSED") throw HttpError.conflict("This campaign is not paused");
    const later = campaign.scheduledAt && campaign.scheduledAt > now;
    await prisma.waCampaign.update({
      where: { id },
      data: later ? { status: "SCHEDULED" } : { status: "SENDING", startedAt: now },
    });
    wake(log);
  } else {
    if (campaign.status === "COMPLETED" || campaign.status === "CANCELLED") {
      throw HttpError.conflict("This campaign has already ended");
    }
    await prisma.$transaction(async (tx) => {
      const dropped = await tx.waCampaignRecipient.updateMany({
        where: { campaignId: id, status: "PENDING" },
        data: { status: "SKIPPED", note: "Cancelled", processedAt: now },
      });
      await tx.waCampaign.update({
        where: { id },
        data: { status: "CANCELLED", finishedAt: now, skipped: { increment: dropped.count } },
      });
    });
  }
  return getCampaign(id);
}

// ---- The sender --------------------------------------------------------------

let timer: NodeJS.Timeout | null = null;
let running = false;
/** A Meta rate-limit answer pauses sending until then. */
let backoffUntil = 0;

/** Starts the in-process sender. Idempotent; a no-op while WhatsApp is off. */
export function startCampaignWorker(log: FastifyBaseLogger): void {
  if (!env.WA_ENABLED || timer) return;
  void recoverInterrupted(log).catch((err: unknown) =>
    log.error({ err }, "whatsapp: campaign recovery failed"),
  );
  timer = setInterval(() => wake(log), 10_000);
  timer.unref();
}

export function stopCampaignWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Run a pass now (no-op if one is already running). */
function wake(log: FastifyBaseLogger): void {
  if (running || !env.WA_ENABLED) return;
  running = true;
  void pass(log)
    .catch((err: unknown) => log.error({ err }, "whatsapp: campaign pass failed"))
    .finally(() => {
      running = false;
    });
}

/**
 * Rows a previous process claimed but never finished. Whether Meta got the
 * message is unknown, so they are failed with that said — not resent.
 */
async function recoverInterrupted(log: FastifyBaseLogger) {
  const stuck = await prisma.waCampaignRecipient.groupBy({
    by: ["campaignId"],
    where: { status: "SENDING" },
    _count: { _all: true },
  });
  for (const group of stuck) {
    await prisma.$transaction([
      prisma.waCampaignRecipient.updateMany({
        where: { campaignId: group.campaignId, status: "SENDING" },
        data: {
          status: "FAILED",
          note: "Interrupted by a server restart — it may or may not have been sent",
          processedAt: new Date(),
        },
      }),
      prisma.waCampaign.update({
        where: { id: group.campaignId },
        data: { failed: { increment: group._count._all } },
      }),
    ]);
    log.warn({ campaignId: group.campaignId, rows: group._count._all }, "whatsapp: recovered interrupted sends");
  }
}

/** Works through due campaigns for up to ~50 s, then yields to the next tick. */
async function pass(log: FastifyBaseLogger) {
  const startedAt = Date.now();
  const now = new Date();
  await prisma.waCampaign.updateMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    data: { status: "SENDING", startedAt: now },
  });

  const interval = 1000 / env.WA_SEND_RATE_PER_SEC;
  while (Date.now() - startedAt < 50_000) {
    if (Date.now() < backoffUntil) return;
    const sending = await prisma.waCampaign.findMany({
      where: { status: "SENDING" },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        templateName: true,
        languageCode: true,
        mapping: true,
        frequencyCapHours: true,
      },
    });

    // Oldest campaign first, a batch at a time. A campaign with nothing
    // PENDING is finished (or waiting on a row a restart will settle) — it
    // is skipped, never spun on, so it can't starve the others.
    let worked = false;
    for (const campaign of sending) {
      const batch = await prisma.waCampaignRecipient.findMany({
        where: { campaignId: campaign.id, status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 25,
        select: { id: true, waId: true, bodyParams: true, buttonParams: true },
      });
      if (batch.length === 0) {
        await finishIfDone(campaign.id);
        continue;
      }
      worked = true;
      for (const row of batch) {
        const status = await prisma.waCampaign.findUnique({
          where: { id: campaign.id },
          select: { status: true },
        });
        if (status?.status !== "SENDING") break; // paused or cancelled mid-batch
        const t0 = Date.now();
        const stop = await sendRow(campaign, row, log);
        if (stop) return;
        const wait = interval - (Date.now() - t0);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      }
      break; // re-read the list: a campaign may have been paused or added
    }
    if (!worked) return;
  }
}

async function finishIfDone(campaignId: string) {
  const left = await prisma.waCampaignRecipient.count({
    where: { campaignId, status: { in: ["PENDING", "SENDING"] } },
  });
  if (left === 0) {
    await prisma.waCampaign.updateMany({
      where: { id: campaignId, status: "SENDING" },
      data: { status: "COMPLETED", finishedAt: new Date() },
    });
  }
}

/** Sends one queue row. Returns true when the whole pass should stop (rate limit). */
async function sendRow(
  campaign: {
    id: string;
    templateName: string;
    languageCode: string;
    mapping: Prisma.JsonValue;
    frequencyCapHours: number;
  },
  row: { id: string; waId: string; bodyParams: Prisma.JsonValue; buttonParams: Prisma.JsonValue },
  log: FastifyBaseLogger,
): Promise<boolean> {
  const claimed = await prisma.waCampaignRecipient.updateMany({
    where: { id: row.id, status: "PENDING" },
    data: { status: "SENDING" },
  });
  if (claimed.count === 0) return false;

  const finish = (status: "SENT" | "SKIPPED" | "FAILED", note: string | null, messageId: string | null = null) =>
    prisma.$transaction([
      prisma.waCampaignRecipient.update({
        where: { id: row.id },
        data: { status, note, messageId, processedAt: new Date() },
      }),
      prisma.waCampaign.update({
        where: { id: campaign.id },
        data: { [status === "SENT" ? "sent" : status === "SKIPPED" ? "skipped" : "failed"]: { increment: 1 } },
      }),
    ]);

  // The cap is re-checked at send time: a scheduled campaign's audience was
  // checked when it was created, and another campaign may have gone since.
  if (campaign.frequencyCapHours > 0) {
    const recent = await prisma.waMessage.findFirst({
      where: {
        waId: row.waId,
        direction: "OUT",
        campaignId: { not: null, notIn: [campaign.id] },
        createdAt: { gte: new Date(Date.now() - campaign.frequencyCapHours * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recent) {
      await finish("SKIPPED", `Messaged in the last ${campaign.frequencyCapHours}h`);
      return false;
    }
  }

  const mapping = campaign.mapping as Mapping | null;
  try {
    const result = await sendTemplate(
      {
        to: row.waId,
        templateName: campaign.templateName,
        languageCode: campaign.languageCode,
        bodyParams: row.bodyParams as string[],
        buttonParams: row.buttonParams as string[],
        header: mapping?.header ?? null,
      },
      log,
      { campaignId: campaign.id },
    );
    await finish("SENT", null, result.recordId);
    return false;
  } catch (error) {
    if (error instanceof WaApiError && error.statusCode === 429) {
      // Meta is throttling: put the row back and stop for a minute.
      await prisma.waCampaignRecipient.update({ where: { id: row.id }, data: { status: "PENDING" } });
      backoffUntil = Date.now() + 60_000;
      log.warn({ campaignId: campaign.id }, "whatsapp: rate limited, backing off");
      return true;
    }
    const message = error instanceof Error ? error.message : "Send failed";
    // Opted out since creation (409) or off the dev allowlist (403): not an attempt.
    const skipped =
      error instanceof HttpError &&
      !(error instanceof WaApiError) &&
      (error.statusCode === 409 || error.statusCode === 403);
    await finish(skipped ? "SKIPPED" : "FAILED", message);
    if (!skipped && !(error instanceof WaApiError)) {
      log.error({ err: error, campaignId: campaign.id }, "whatsapp: campaign send error");
    }
    return false;
  }
}

// ---- Reading -----------------------------------------------------------------

export async function listCampaigns(page: number, pageSize: number) {
  const [total, rows] = await Promise.all([
    prisma.waCampaign.count(),
    prisma.waCampaign.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        templateName: true,
        languageCode: true,
        category: true,
        status: true,
        scheduledAt: true,
        startedAt: true,
        finishedAt: true,
        total: true,
        sent: true,
        skipped: true,
        failed: true,
        createdAt: true,
      },
    }),
  ]);
  return { rows, meta: buildListMeta(total, page, pageSize) };
}

/** waIds that replied within 7 days of their campaign message. */
async function repliedWaIds(campaignId: string): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ waId: string }[]>`
    SELECT DISTINCT r."waId"
    FROM "wa_campaign_recipients" r
    JOIN "wa_messages" m ON m."waId" = r."waId" AND m."direction" = 'IN'
    WHERE r."campaignId" = ${campaignId}
      AND r."status" = 'SENT'
      AND m."createdAt" >= r."processedAt"
      AND m."createdAt" <= r."processedAt" + interval '7 days'`;
  return new Set(rows.map((r) => r.waId));
}

async function clickedWaIds(campaignId: string): Promise<Set<string>> {
  const links = await prisma.waLink.findMany({
    where: { campaignId, clicks: { gt: 0 } },
    select: { waId: true },
  });
  return new Set(links.flatMap((l) => (l.waId ? [l.waId] : [])));
}

export async function getCampaign(id: string) {
  const campaign = await prisma.waCampaign.findUnique({ where: { id } });
  if (!campaign) throw HttpError.notFound("Campaign not found");

  const [byStatus, queue, failures, clickAgg, clicked, replied, tracked] = await Promise.all([
    prisma.waMessage.groupBy({
      by: ["lastStatus"],
      where: { campaignId: id },
      _count: { _all: true },
    }),
    prisma.waCampaignRecipient.groupBy({
      by: ["status"],
      where: { campaignId: id },
      _count: { _all: true },
    }),
    prisma.waMessage.groupBy({
      by: ["errorCode", "errorTitle"],
      where: { campaignId: id, lastStatus: "failed" },
      _count: { _all: true },
      orderBy: { _count: { errorCode: "desc" } },
    }),
    prisma.waLink.aggregate({ where: { campaignId: id }, _sum: { clicks: true } }),
    clickedWaIds(id),
    repliedWaIds(id),
    prisma.waLink.count({ where: { campaignId: id } }),
  ]);
  const skipReasons = await prisma.waCampaignRecipient.groupBy({
    by: ["note"],
    where: { campaignId: id, status: "SKIPPED" },
    _count: { _all: true },
    orderBy: { _count: { note: "desc" } },
    take: 8,
  });
  const statuses = Object.fromEntries(byStatus.map((g) => [g.lastStatus ?? "unknown", g._count._all]));
  const queueCounts = Object.fromEntries(queue.map((g) => [g.status, g._count._all]));

  return {
    ...campaign,
    audience: audienceSummary(campaign.audience),
    statuses: {
      accepted: statuses["accepted"] ?? 0,
      sent: statuses["sent"] ?? 0,
      delivered: statuses["delivered"] ?? 0,
      read: statuses["read"] ?? 0,
      failed: statuses["failed"] ?? 0,
    },
    queue: {
      pending: (queueCounts["PENDING"] ?? 0) + (queueCounts["SENDING"] ?? 0),
      sent: queueCounts["SENT"] ?? 0,
      skipped: queueCounts["SKIPPED"] ?? 0,
      failed: queueCounts["FAILED"] ?? 0,
    },
    engagement: {
      /** Null when the campaign had no tracked button. */
      clicks: tracked > 0 ? (clickAgg._sum.clicks ?? 0) : null,
      clickers: tracked > 0 ? clicked.size : null,
      replied: replied.size,
    },
    skipReasons: skipReasons.map((r) => ({ reason: r.note ?? "Skipped", count: r._count._all })),
    failures: failures.map((f) => ({
      errorCode: f.errorCode,
      errorTitle: f.errorTitle,
      count: f._count._all,
    })),
  };
}

type RecipientFilter = "pending" | "skipped" | "failed" | "sent" | "delivered" | "read" | "clicked" | "replied";

async function recipientWhere(
  id: string,
  status: RecipientFilter | undefined,
): Promise<Prisma.WaCampaignRecipientWhereInput> {
  const base = { campaignId: id };
  switch (status) {
    case undefined:
      return base;
    case "pending":
      return { ...base, status: { in: ["PENDING", "SENDING"] } };
    case "skipped":
      return { ...base, status: "SKIPPED" };
    case "failed":
      return { ...base, OR: [{ status: "FAILED" }, { message: { lastStatus: "failed" } }] };
    case "sent":
      return { ...base, status: "SENT" };
    case "delivered":
      return { ...base, message: { lastStatus: { in: ["delivered", "read"] } } };
    case "read":
      return { ...base, message: { lastStatus: "read" } };
    case "clicked":
      return { ...base, waId: { in: [...(await clickedWaIds(id))] } };
    case "replied":
      return { ...base, waId: { in: [...(await repliedWaIds(id))] } };
  }
}

const recipientSelect = {
  id: true,
  waId: true,
  name: true,
  status: true,
  note: true,
  processedAt: true,
  message: { select: { lastStatus: true, errorCode: true, errorTitle: true } },
} satisfies Prisma.WaCampaignRecipientSelect;

export async function listRecipients(
  id: string,
  query: { page: number; pageSize: number; status?: RecipientFilter | undefined },
) {
  const found = await prisma.waCampaign.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw HttpError.notFound("Campaign not found");
  const where = await recipientWhere(id, query.status);
  const [total, rows, clicked] = await Promise.all([
    prisma.waCampaignRecipient.count({ where }),
    prisma.waCampaignRecipient.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: recipientSelect,
    }),
    clickedWaIds(id),
  ]);
  return {
    rows: rows.map(({ message, ...r }) => ({
      ...r,
      lastStatus: message?.lastStatus ?? null,
      errorCode: message?.errorCode ?? null,
      errorTitle: message?.errorTitle ?? null,
      clicked: clicked.has(r.waId),
    })),
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}

const csvCell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value);
  // Leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Every recipient with where their message got to — for a spreadsheet. */
export async function exportRecipients(id: string): Promise<{ filename: string; csv: string }> {
  const campaign = await prisma.waCampaign.findUnique({ where: { id }, select: { name: true } });
  if (!campaign) throw HttpError.notFound("Campaign not found");
  const [rows, clicked, replied] = await Promise.all([
    prisma.waCampaignRecipient.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "asc" },
      select: recipientSelect,
    }),
    clickedWaIds(id),
    repliedWaIds(id),
  ]);
  const lines = [
    ["phone", "name", "queue", "delivery", "clicked", "replied", "note", "processed_at"].join(","),
    ...rows.map((r) =>
      [
        `+${r.waId}`,
        r.name,
        r.status.toLowerCase(),
        r.message?.lastStatus ?? "",
        clicked.has(r.waId) ? "yes" : "no",
        replied.has(r.waId) ? "yes" : "no",
        r.message?.errorTitle ?? r.note,
        r.processedAt?.toISOString() ?? "",
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  const slug = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "campaign";
  return { filename: `${slug}-recipients.csv`, csv: lines.join("\n") };
}

/** A pasted list can be 10 000 rows; the detail page needs only its kind and size. */
function audienceSummary(audience: Prisma.JsonValue | null) {
  const a = audience as { kind?: string; rows?: unknown[] } | null;
  if (!a?.kind) return null;
  return a.kind === "list" ? { kind: "list", rows: a.rows?.length ?? 0 } : a;
}
