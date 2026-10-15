import type { FastifyBaseLogger } from "fastify";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import { loadSellers, sellerMember } from "./whatsapp.audiences.js";
import type { SellerRow } from "./whatsapp.audiences.js";
import { checkMapping } from "./whatsapp.campaigns.js";
import { WaApiError } from "./whatsapp.client.js";
import { mappingSchema, resolveMapping } from "./whatsapp.fields.js";
import type { Mapping } from "./whatsapp.fields.js";
import { availableTemplates, isAllowedRecipient, sendTemplate } from "./whatsapp.service.js";
import { toWaId } from "./whatsapp.webhook.js";

/**
 * Automations — template messages sent on events, not by hand.
 *
 * Each entry in `AUTOMATIONS` names a trigger and finds the events that are
 * due; a `WaAutomation` row holds the admin's settings (on/off, template,
 * mapping, config). A scanner in this process runs every few minutes:
 *
 *   - **Once per event.** A `WaAutomationRun` row is inserted BEFORE the
 *     send, unique on (automation, event), so an event fires at most once
 *     however often the scanner runs or restarts.
 *   - **No backlog.** Only events after the automation was switched on
 *     (`enabledAt`) count — turning one on never messages every past seller.
 *   - **Quiet hours.** Nothing is sent 21:00–09:00 India time; due events
 *     simply wait for the morning.
 *   - **Same rules as any send:** opted-out skipped, marketing templates only
 *     to people with consent, dev allowlist outside production.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const SCAN_MS = 5 * 60 * 1000;
/** Per automation per scan — a safety valve, not a pace. */
const MAX_PER_SCAN = 200;

export interface DueEvent {
  refKey: string;
  seller: SellerRow;
  /** Extra fields for the mapping (order details). */
  extra?: Record<string, string>;
}

export interface ConfigField {
  key: string;
  label: string;
  hint: string;
  kind: "dayList" | "days";
}

interface AutomationDefinition {
  key: string;
  title: string;
  description: string;
  /** Which fields the mapping can use. */
  fieldKind: "sellers" | "sellerOrders";
  configFields: ConfigField[];
  defaults: { templateName: string | null; mapping: Mapping; config: Record<string, unknown> };
  /** Validates and normalises the admin's config. */
  parseConfig: (raw: Record<string, unknown>) => Record<string, unknown>;
  due: (ctx: { enabledAt: Date; config: Record<string, unknown>; now: Date }) => Promise<DueEvent[]>;
}

const emptyMapping: Mapping = { body: [], buttons: [], header: null };

const dayList = (raw: unknown, fallback: number[]) => {
  const list = Array.isArray(raw) ? raw.map(Number) : fallback;
  const clean = [...new Set(list.filter((n) => Number.isInteger(n) && n >= 1 && n <= 60))].sort(
    (a, b) => a - b,
  );
  if (clean.length === 0 || clean.length > 5) {
    throw new HttpError(422, "Choose 1 to 5 days between 1 and 60");
  }
  return clean;
};

const dayCount = (raw: unknown, fallback: number, min: number, max: number) => {
  const n = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(422, `Choose a number of days between ${min} and ${max}`);
  }
  return n;
};

const money = (value: Prisma.Decimal | number) =>
  `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

async function orderEvents(
  where: Prisma.OrderWhereInput,
  refKey: (order: { id: string; storeId: string }) => string,
): Promise<DueEvent[]> {
  const orders = await prisma.order.findMany({
    where: { ...where, storeId: { not: null }, status: { not: "CANCELLED" } },
    orderBy: { placedAt: "asc" },
    take: MAX_PER_SCAN,
    select: { id: true, storeId: true, orderNumber: true, total: true, customerName: true },
  });
  if (orders.length === 0) return [];
  const sellers = new Map(
    (await loadSellers({}, [...new Set(orders.map((o) => o.storeId!))])).map((s) => [s.store.id, s]),
  );
  return orders.flatMap((order) => {
    const seller = sellers.get(order.storeId!);
    if (!seller) return [];
    return [
      {
        refKey: refKey({ id: order.id, storeId: order.storeId! }),
        seller,
        extra: {
          order_number: String(order.orderNumber),
          order_total: money(order.total),
          customer_name: order.customerName ?? "",
        },
      },
    ];
  });
}

export const AUTOMATIONS: AutomationDefinition[] = [
  {
    key: "seller_setup_followup",
    title: "Setup follow-up",
    description:
      "Reminds a new seller to finish setting up, a few days after they create their store. Stops once setup is complete.",
    fieldKind: "sellers",
    configFields: [
      {
        key: "days",
        label: "Days after the store is created",
        hint: "Up to five, e.g. 1, 3, 7",
        kind: "dayList",
      },
    ],
    defaults: {
      templateName: "seller_setup_pending",
      mapping: {
        body: [
          { value: "{seller_name}", fallback: "there" },
          { value: "{store_name}" },
          { value: "{setup_percent}" },
          { value: "{pending_steps}" },
        ],
        buttons: [{ value: "{store_slug}", track: false }],
        header: null,
      },
      config: { days: [1, 3, 7] },
    },
    parseConfig: (raw) => ({ days: dayList(raw["days"], [1, 3, 7]) }),
    async due({ enabledAt, config, now }) {
      const days = config["days"] as number[];
      const maxDay = Math.max(...days);
      const recent = await prisma.store.findMany({
        where: {
          suspendedAt: null,
          createdAt: { gte: new Date(now.getTime() - (maxDay + 2) * DAY_MS) },
        },
        select: { id: true },
      });
      if (recent.length === 0) return [];
      const sellers = await loadSellers({}, recent.map((s) => s.id));
      const events: DueEvent[] = [];
      for (const seller of sellers) {
        if (seller.readiness.complete) continue;
        // The latest reminder that has come due since switching on — earlier
        // ones that were missed are not sent late.
        const dueDays = days.filter((d) => {
          const at = seller.store.createdAt.getTime() + d * DAY_MS;
          return at <= now.getTime() && at >= enabledAt.getTime();
        });
        const day = dueDays.at(-1);
        if (day !== undefined) events.push({ refKey: `${seller.store.id}:d${day}`, seller });
      }
      return events;
    },
  },
  {
    key: "store_published",
    title: "Store goes live",
    description: "Congratulates a seller when their store is published, with a link to share it.",
    fieldKind: "sellers",
    configFields: [],
    defaults: { templateName: null, mapping: emptyMapping, config: {} },
    parseConfig: () => ({}),
    async due({ enabledAt }) {
      const stores = await prisma.store.findMany({
        where: { suspendedAt: null, isPublished: true, publishedAt: { gte: enabledAt } },
        select: { id: true },
        take: MAX_PER_SCAN,
      });
      if (stores.length === 0) return [];
      const sellers = await loadSellers({}, stores.map((s) => s.id));
      return sellers.map((seller) => ({ refKey: seller.store.id, seller }));
    },
  },
  {
    key: "first_order",
    title: "First order",
    description: "Celebrates a store's very first order.",
    fieldKind: "sellerOrders",
    configFields: [],
    defaults: { templateName: null, mapping: emptyMapping, config: {} },
    parseConfig: () => ({}),
    async due({ enabledAt }) {
      // Stores whose earliest order is after switching on = their first order is new.
      const firsts = await prisma.order.groupBy({
        by: ["storeId"],
        where: { storeId: { not: null }, status: { not: "CANCELLED" } },
        _min: { placedAt: true },
        having: { placedAt: { _min: { gte: enabledAt } } },
      });
      if (firsts.length === 0) return [];
      return orderEvents(
        {
          OR: firsts.map((f) => ({ storeId: f.storeId!, placedAt: f._min.placedAt! })),
        },
        (order) => order.storeId,
      );
    },
  },
  {
    key: "new_order_alert",
    title: "New order alert",
    description: "Tells the seller the moment an order comes in (use a utility template).",
    fieldKind: "sellerOrders",
    configFields: [],
    defaults: { templateName: null, mapping: emptyMapping, config: {} },
    parseConfig: () => ({}),
    async due({ enabledAt, now }) {
      // A day's look-back bounds the query; quiet-hours orders wait till morning.
      const since = new Date(Math.max(enabledAt.getTime(), now.getTime() - DAY_MS));
      return orderEvents({ placedAt: { gte: since } }, (order) => order.id);
    },
  },
  {
    key: "inactive_store",
    title: "Quiet store nudge",
    description:
      "Nudges a published store that has gone a while without an order, with tips to get one. At most once per quiet spell.",
    fieldKind: "sellers",
    configFields: [
      { key: "days", label: "Days without an order", hint: "Between 7 and 90", kind: "days" },
    ],
    defaults: { templateName: null, mapping: emptyMapping, config: { days: 14 } },
    parseConfig: (raw) => ({ days: dayCount(raw["days"], 14, 7, 90) }),
    async due({ enabledAt, config, now }) {
      const days = config["days"] as number;
      const sellers = await loadSellers({ published: true });
      const events: DueEvent[] = [];
      for (const seller of sellers) {
        const lastActivity = seller.lastOrderAt ?? seller.store.publishedAt ?? seller.store.createdAt;
        const quietSince = lastActivity.getTime() + days * DAY_MS;
        // Went quiet after switching on — so it never blasts every existing quiet store.
        if (quietSince <= now.getTime() && quietSince >= enabledAt.getTime()) {
          events.push({
            refKey: `${seller.store.id}:${new Date(quietSince).toISOString().slice(0, 10)}`,
            seller,
          });
        }
      }
      return events;
    },
  },
];

const definitionOf = (key: string) => {
  const def = AUTOMATIONS.find((a) => a.key === key);
  if (!def) throw HttpError.notFound("No such automation");
  return def;
};

// ---- Settings ------------------------------------------------------------------

export async function listAutomations() {
  const since = new Date(Date.now() - 7 * DAY_MS);
  const [rows, stats, last] = await Promise.all([
    prisma.waAutomation.findMany(),
    prisma.waAutomationRun.groupBy({
      by: ["automationKey", "status"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.waAutomationRun.groupBy({
      by: ["automationKey"],
      _max: { createdAt: true },
    }),
  ]);
  const rowBy = new Map(rows.map((r) => [r.key, r]));
  return AUTOMATIONS.map((def) => {
    const row = rowBy.get(def.key);
    const count = (status: string) =>
      stats.find((s) => s.automationKey === def.key && s.status === status)?._count._all ?? 0;
    return {
      key: def.key,
      title: def.title,
      description: def.description,
      fieldKind: def.fieldKind,
      configFields: def.configFields,
      enabled: row?.enabled ?? false,
      enabledAt: row?.enabledAt ?? null,
      templateName: row?.templateName ?? def.defaults.templateName,
      languageCode: row?.languageCode ?? null,
      mapping: (row?.mapping as Mapping | null) ?? def.defaults.mapping,
      config: (row?.config as Record<string, unknown> | null) ?? def.defaults.config,
      last7Days: { sent: count("SENT"), skipped: count("SKIPPED"), failed: count("FAILED") },
      lastRunAt: last.find((l) => l.automationKey === def.key)?._max.createdAt ?? null,
    };
  });
}

export async function updateAutomation(
  key: string,
  input: {
    enabled: boolean;
    templateName: string | null;
    languageCode: string | null;
    mapping: Mapping;
    config: Record<string, unknown>;
  },
  adminId: string | null,
  log: FastifyBaseLogger,
) {
  const def = definitionOf(key);
  const config = def.parseConfig(input.config);
  const parsed = mappingSchema.parse(input.mapping);
  // Click tracking is a campaign feature; here a button's value is the link itself.
  const mapping = { ...parsed, buttons: parsed.buttons.map((b) => ({ ...b, track: false })) };
  if (input.enabled) {
    if (!input.templateName || !input.languageCode) {
      throw new HttpError(422, "Choose a template before switching this on");
    }
    const templates = await availableTemplates(log);
    if (!templates) throw new HttpError(503, "Couldn't read the templates from WhatsApp right now");
    checkMapping(templates, input.templateName, input.languageCode, mapping);
  }
  const current = await prisma.waAutomation.findUnique({ where: { key } });
  const switchingOn = input.enabled && !current?.enabled;
  const data = {
    enabled: input.enabled,
    templateName: input.templateName,
    languageCode: input.languageCode,
    mapping: mapping as Prisma.InputJsonValue,
    config: config as Prisma.InputJsonValue,
    updatedBy: adminId,
    // Re-arming from now: events while it was off are never sent late.
    ...(switchingOn ? { enabledAt: new Date() } : {}),
  };
  await prisma.waAutomation.upsert({ where: { key }, create: { key, ...data }, update: data });
  return (await listAutomations()).find((a) => a.key === key)!;
}

export async function listRuns(key: string, page: number, pageSize: number) {
  definitionOf(key);
  const where = { automationKey: key };
  const [total, rows] = await Promise.all([
    prisma.waAutomationRun.count({ where }),
    prisma.waAutomationRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const stores = new Map(
    (
      await prisma.store.findMany({
        where: { id: { in: rows.flatMap((r) => (r.storeId ? [r.storeId] : [])) } },
        select: { id: true, name: true },
      })
    ).map((s) => [s.id, s.name]),
  );
  return {
    rows: rows.map((r) => ({ ...r, storeName: r.storeId ? (stores.get(r.storeId) ?? null) : null })),
    meta: buildListMeta(total, page, pageSize),
  };
}

// ---- Scanner -------------------------------------------------------------------

/** 09:00–21:00 in India — when sellers expect a business message. */
export function withinSendingHours(now: Date): boolean {
  const istMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440;
  return istMinutes >= 9 * 60 && istMinutes < 21 * 60;
}

let timer: NodeJS.Timeout | null = null;
let scanning = false;

export function startAutomationScanner(log: FastifyBaseLogger): void {
  if (!env.WA_ENABLED || timer) return;
  timer = setInterval(() => void scan(log), SCAN_MS);
  timer.unref();
}

export function stopAutomationScanner(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

async function scan(log: FastifyBaseLogger) {
  if (scanning) return;
  const now = new Date();
  if (!withinSendingHours(now)) return;
  scanning = true;
  try {
    const enabled = await prisma.waAutomation.findMany({ where: { enabled: true } });
    if (enabled.length === 0) return;
    const templates = await availableTemplates(log);
    if (!templates) return; // try again next scan rather than send unchecked
    for (const row of enabled) {
      const def = AUTOMATIONS.find((a) => a.key === row.key);
      if (!def || !row.templateName || !row.languageCode || !row.enabledAt) continue;
      try {
        await runAutomation(def, row, templates, now, log);
      } catch (err) {
        log.error({ err, automation: row.key }, "whatsapp: automation scan failed");
      }
    }
  } finally {
    scanning = false;
  }
}

async function runAutomation(
  def: AutomationDefinition,
  row: {
    key: string;
    templateName: string | null;
    languageCode: string | null;
    mapping: Prisma.JsonValue;
    config: Prisma.JsonValue;
    enabledAt: Date | null;
  },
  templates: NonNullable<Awaited<ReturnType<typeof availableTemplates>>>,
  now: Date,
  log: FastifyBaseLogger,
) {
  const mapping = mappingSchema.parse(row.mapping ?? {});
  const template = checkMapping(templates, row.templateName!, row.languageCode!, mapping);
  const config = def.parseConfig((row.config as Record<string, unknown> | null) ?? {});
  const events = await def.due({ enabledAt: row.enabledAt!, config, now });
  if (events.length === 0) return;

  const done = new Set(
    (
      await prisma.waAutomationRun.findMany({
        where: { automationKey: def.key, refKey: { in: events.map((e) => e.refKey) } },
        select: { refKey: true },
      })
    ).map((r) => r.refKey),
  );
  const fresh = events.filter((e) => !done.has(e.refKey)).slice(0, MAX_PER_SCAN);
  if (fresh.length === 0) return;

  const marketing = template.category === "MARKETING";
  for (const event of fresh) {
    const member = sellerMember(event.seller);
    const waId = (member.phone ? toWaId(member.phone) : null) ?? (member.altPhone ? toWaId(member.altPhone) : null);

    // Claim the event first — the unique pair makes a second claim fail.
    const run = await prisma.waAutomationRun
      .create({
        data: {
          automationKey: def.key,
          refKey: event.refKey,
          waId,
          storeId: event.seller.store.id,
          status: "PENDING",
        },
        select: { id: true },
      })
      .catch(() => null);
    if (!run) continue;
    const settle = (status: "SENT" | "SKIPPED" | "FAILED", note: string | null, messageId: string | null = null) =>
      prisma.waAutomationRun.update({ where: { id: run.id }, data: { status, note, messageId } });

    if (!waId) {
      await settle("SKIPPED", "No usable phone number");
      continue;
    }
    if (!isAllowedRecipient(waId)) {
      await settle("SKIPPED", "Not on the test allowlist");
      continue;
    }
    if (marketing) {
      const contact = await prisma.waContact.findUnique({
        where: { waId },
        select: { marketingOptInAt: true },
      });
      if (!contact?.marketingOptInAt) {
        await settle("SKIPPED", "No marketing consent");
        continue;
      }
    }
    const fields = { ...member.member.fields, phone: `+${waId}`, ...event.extra };
    const filled = resolveMapping(mapping, fields);
    if (filled.unfilled.length > 0) {
      await settle("SKIPPED", `Missing value for ${filled.unfilled.join(", ")}`);
      continue;
    }
    try {
      const result = await sendTemplate(
        {
          to: waId,
          templateName: row.templateName!,
          languageCode: row.languageCode!,
          bodyParams: filled.bodyParams,
          // Automations don't track clicks — the link goes straight through.
          buttonParams: filled.buttons.map((b) => b.value),
          header: mapping.header,
        },
        log,
        { automationKey: def.key },
      );
      await settle("SENT", null, result.recordId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Send failed";
      const skipped =
        error instanceof HttpError &&
        !(error instanceof WaApiError) &&
        (error.statusCode === 409 || error.statusCode === 403);
      await settle(skipped ? "SKIPPED" : "FAILED", message);
      if (error instanceof WaApiError && error.statusCode === 429) return; // throttled: next scan
    }
  }
  log.info({ automation: def.key, events: fresh.length }, "whatsapp: automation ran");
}
