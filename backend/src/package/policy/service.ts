import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { policyConfig } from "./config.js";
import {
  bodyProblems,
  codeRules,
  effectiveFromProblem,
  renderBody,
  settingsProblem,
  startedHistory,
  versionInForce,
} from "./rules.js";
import type { DraftUpdateInput, PolicyCreateInput, PublishInput } from "./schema.js";

/**
 * PolicyHub service — the ONLY code that reads or writes schema `policyhub`
 * (docs/policyhub/README.md §5). Every query is scoped to
 * `policyConfig.project`. Published versions are never changed: every write
 * here touches the DRAFT row only, under a lock on the policy row.
 */

export interface PolicyActor {
  id: string;
  email: string;
}

type Tx = Prisma.TransactionClient;
type VersionRow = Prisma.PolicyVersionGetPayload<object>;

const project = () => policyConfig.project;

/** Fields an edit can change — and that before/after in the audit compares. */
const EDITABLE = ["body", "changeSummary", "changeReason", "settings"] as const;
type Editable = (typeof EDITABLE)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findPolicy(code: string) {
  const policy = await prisma.policy.findUnique({
    where: { project_code: { project: project(), code } },
  });
  if (!policy) throw HttpError.notFound(`Policy ${code} not found`);
  return policy;
}

/** Finds the policy and locks its row for the rest of the transaction. */
async function lockPolicy(tx: Tx, code: string) {
  const policy = await tx.policy.findUnique({
    where: { project_code: { project: project(), code } },
  });
  if (!policy) throw HttpError.notFound(`Policy ${code} not found`);
  await tx.$queryRaw`SELECT 1 FROM "policyhub"."policies" WHERE "id" = ${policy.id} FOR UPDATE`;
  return policy;
}

function draftOf(tx: Tx, policyId: string) {
  return tx.policyVersion.findFirst({ where: { project: project(), policyId, status: "DRAFT" } });
}

function latestPublished(tx: Tx, policyId: string) {
  return tx.policyVersion.findFirst({
    where: { project: project(), policyId, status: "PUBLISHED" },
    orderBy: { version: "desc" },
  });
}

function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value == null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function writeEvent(
  tx: Tx,
  versionId: string,
  action: "CREATED" | "EDITED" | "RESET" | "PUBLISHED",
  actor: PolicyActor,
  extra: { note?: string; before?: unknown; after?: unknown } = {},
) {
  return tx.policyEvent.create({
    data: {
      project: project(),
      versionId,
      action,
      actorId: actor.id,
      actorEmail: actor.email,
      note: extra.note ?? null,
      before: jsonValue(extra.before),
      after: jsonValue(extra.after),
    },
  });
}

/** The fields of `next` that differ from `prev`, as { before, after }. */
function diff(prev: Pick<VersionRow, Editable>, next: Partial<Pick<VersionRow, Editable>>) {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (next[key] === undefined) continue;
    if (JSON.stringify(prev[key] ?? null) === JSON.stringify(next[key] ?? null)) continue;
    before[key] = prev[key] ?? null;
    after[key] = next[key] ?? null;
  }
  return Object.keys(after).length ? { before, after } : null;
}

/** Where a version stands at `now`. */
function stateOf(v: VersionRow, current: VersionRow | null, now: Date) {
  if (v.status === "DRAFT") return "DRAFT" as const;
  if (v.effectiveFrom && v.effectiveFrom > now) return "SCHEDULED" as const;
  return v.id === current?.id ? ("CURRENT" as const) : ("PAST" as const);
}

const brief = (v: VersionRow | null | undefined) =>
  v ? { version: v.version, effectiveFrom: v.effectiveFrom } : null;

// ---------------------------------------------------------------------------
// Admin — read
// ---------------------------------------------------------------------------

export async function listPolicies() {
  const now = new Date();
  const policies = await prisma.policy.findMany({
    where: { project: project() },
    orderBy: { code: "asc" },
    include: { versions: true },
  });
  return policies.map((p) => {
    const scheduled = p.versions
      .filter((v) => v.status === "PUBLISHED" && v.effectiveFrom && v.effectiveFrom > now)
      .sort((a, b) => a.version - b.version)[0];
    const draft = p.versions.find((v) => v.status === "DRAFT");
    return {
      code: p.code,
      name: p.name,
      audience: p.audience,
      current: brief(versionInForce(p.versions, now)),
      scheduled: brief(scheduled),
      draft: draft ? { version: draft.version, updatedAt: draft.updatedAt } : null,
      versionCount: p.versions.length,
    };
  });
}

/** Everything about one policy for the console: versions, preview, audit. */
export async function getPolicy(code: string) {
  const now = new Date();
  const policy = await findPolicy(code);
  const versions = await prisma.policyVersion.findMany({
    where: { project: project(), policyId: policy.id },
    orderBy: { version: "desc" },
  });
  const events = await prisma.policyEvent.findMany({
    where: { project: project(), versionId: { in: versions.map((v) => v.id) } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const current = versionInForce(versions, now);
  const publishedByStart = versions
    .filter((v) => v.status === "PUBLISHED" && v.effectiveFrom)
    .sort((a, b) => a.effectiveFrom!.getTime() - b.effectiveFrom!.getTime());
  const numberOf = new Map(versions.map((v) => [v.id, v.version]));

  return {
    code: policy.code,
    name: policy.name,
    audience: policy.audience,
    hasSettings: Boolean(codeRules(policy.code)),
    current: brief(current),
    versions: versions.map((v) => {
      const i = publishedByStart.findIndex((p) => p.id === v.id);
      return {
        id: v.id,
        version: v.version,
        status: v.status,
        state: stateOf(v, current, now),
        body: v.body,
        renderedBody: renderBody(v.body, v.settings),
        /** What would stop publishing — drafts only. */
        problems: v.status === "DRAFT" ? publishProblems(policy.code, v) : [],
        changeSummary: v.changeSummary,
        changeReason: v.changeReason,
        settings: v.settings,
        effectiveFrom: v.effectiveFrom,
        effectiveTo: i >= 0 ? (publishedByStart[i + 1]?.effectiveFrom ?? null) : null,
        publishedAt: v.publishedAt,
        publishedByEmail: v.publishedByEmail,
        createdByEmail: v.createdByEmail,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      };
    }),
    events: events.map((e) => ({
      id: e.id,
      version: numberOf.get(e.versionId) ?? null,
      action: e.action,
      actorEmail: e.actorEmail,
      note: e.note,
      before: e.before,
      after: e.after,
      createdAt: e.createdAt,
    })),
  };
}

/** Everything that stops a draft from being published (empty = ready). */
function publishProblems(code: string, v: Pick<VersionRow, "body" | "settings" | "version" | "changeSummary" | "changeReason">) {
  const problems = bodyProblems(code, v.body);
  if (codeRules(code)) {
    if (v.settings == null) problems.push("Settings are required for this policy");
    else {
      const p = settingsProblem(code, v.settings);
      if (p) problems.push(p);
    }
  }
  if (v.version > 1) {
    if (!v.changeSummary) problems.push("Add a change summary (shown to readers)");
    if (!v.changeReason) problems.push("Add the reason for the change");
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Admin — write
// ---------------------------------------------------------------------------

/** New policy + its empty draft v1. */
export async function createPolicy(input: PolicyCreateInput, actor: PolicyActor) {
  return prisma.$transaction(async (tx) => {
    const exists = await tx.policy.findUnique({
      where: { project_code: { project: project(), code: input.code } },
      select: { id: true },
    });
    if (exists) throw HttpError.conflict(`Policy ${input.code} already exists`);
    const policy = await tx.policy.create({
      data: { project: project(), code: input.code, name: input.name, audience: input.audience },
    });
    const draft = await tx.policyVersion.create({
      data: {
        project: project(),
        policyId: policy.id,
        version: 1,
        body: "",
        createdById: actor.id,
        createdByEmail: actor.email,
      },
    });
    await writeEvent(tx, draft.id, "CREATED", actor, { note: `Policy ${policy.code} created` });
    return policy;
  });
}

/**
 * The policy's draft — the existing one, or a new one copied from the
 * latest published version (there is at most one draft per policy).
 */
export async function startDraft(code: string, actor: PolicyActor) {
  return prisma.$transaction(async (tx) => {
    const policy = await lockPolicy(tx, code);
    const existing = await draftOf(tx, policy.id);
    if (existing) return existing;

    const source = await latestPublished(tx, policy.id);
    const draft = await tx.policyVersion.create({
      data: {
        project: project(),
        policyId: policy.id,
        version: (source?.version ?? 0) + 1,
        body: source?.body ?? "",
        settings: jsonValue(source?.settings),
        createdById: actor.id,
        createdByEmail: actor.email,
      },
    });
    await writeEvent(tx, draft.id, "CREATED", actor, {
      note: source ? `Copied from version ${source.version}` : "Empty draft",
    });
    return draft;
  });
}

export async function updateDraft(code: string, input: DraftUpdateInput, actor: PolicyActor) {
  if (input.settings !== undefined) {
    const problem = settingsProblem(code, input.settings);
    if (problem) throw HttpError.badRequest(problem);
  }
  return prisma.$transaction(async (tx) => {
    const policy = await lockPolicy(tx, code);
    const draft = await draftOf(tx, policy.id);
    if (!draft) throw HttpError.conflict("There is no draft — start one first");

    const next = {
      ...(input.body !== undefined && { body: input.body }),
      ...(input.changeSummary !== undefined && { changeSummary: input.changeSummary }),
      ...(input.changeReason !== undefined && { changeReason: input.changeReason }),
      ...(input.settings !== undefined && { settings: input.settings as Prisma.JsonValue }),
    };
    const change = diff(draft, next);
    if (!change) return draft;

    const updated = await tx.policyVersion.update({
      where: { id: draft.id },
      data: {
        ...(next.body !== undefined && { body: next.body }),
        ...(next.changeSummary !== undefined && { changeSummary: next.changeSummary }),
        ...(next.changeReason !== undefined && { changeReason: next.changeReason }),
        ...(next.settings !== undefined && { settings: jsonValue(next.settings) }),
      },
    });
    await writeEvent(tx, draft.id, "EDITED", actor, change);
    return updated;
  });
}

/** "Discard changes": the draft goes back to a copy of the latest published version. */
export async function resetDraft(code: string, actor: PolicyActor) {
  return prisma.$transaction(async (tx) => {
    const policy = await lockPolicy(tx, code);
    const draft = await draftOf(tx, policy.id);
    if (!draft) throw HttpError.conflict("There is no draft to reset");
    const source = await latestPublished(tx, policy.id);

    const next = {
      body: source?.body ?? "",
      changeSummary: null,
      changeReason: null,
      settings: (source?.settings ?? null) as Prisma.JsonValue,
    };
    const change = diff(draft, next);
    if (!change) return draft;

    const updated = await tx.policyVersion.update({
      where: { id: draft.id },
      data: { ...next, settings: jsonValue(next.settings) },
    });
    await writeEvent(tx, draft.id, "RESET", actor, {
      ...change,
      note: source ? `Reset to version ${source.version}` : "Reset to empty",
    });
    return updated;
  });
}

/** Freezes the draft as a published version, starting now or later. */
export async function publishDraft(code: string, input: PublishInput, actor: PolicyActor) {
  return prisma.$transaction(async (tx) => {
    const policy = await lockPolicy(tx, code);
    const draft = await draftOf(tx, policy.id);
    if (!draft) throw HttpError.conflict("There is no draft to publish");

    const problems = publishProblems(policy.code, draft);
    if (problems.length) throw HttpError.badRequest(problems.join(". "));

    const now = new Date();
    const effectiveFrom = input.effectiveFrom ?? now;
    const last = await tx.policyVersion.findFirst({
      where: { project: project(), policyId: policy.id, status: "PUBLISHED" },
      orderBy: { effectiveFrom: "desc" },
      select: { effectiveFrom: true },
    });
    const when = effectiveFromProblem(effectiveFrom, now, last?.effectiveFrom ?? null);
    if (when) throw HttpError.badRequest(when);

    const published = await tx.policyVersion.update({
      where: { id: draft.id },
      data: {
        status: "PUBLISHED",
        effectiveFrom,
        publishedAt: now,
        publishedById: actor.id,
        publishedByEmail: actor.email,
      },
    });
    await writeEvent(tx, draft.id, "PUBLISHED", actor, {
      after: { effectiveFrom: effectiveFrom.toISOString() },
    });
    return published;
  });
}

// ---------------------------------------------------------------------------
// For other UnieMax code (payouts) — docs/policyhub/README.md §10
// ---------------------------------------------------------------------------

export interface VersionRef {
  id: string;
  version: number;
  effectiveFrom: Date;
}

/** The version of `code` in force at `at`, or null (no policy, nothing started then). */
export async function versionAt(code: string, at: Date): Promise<VersionRef | null> {
  const row = await prisma.policyVersion.findFirst({
    where: {
      project: project(),
      policy: { code },
      status: "PUBLISHED",
      effectiveFrom: { lte: at },
    },
    orderBy: { effectiveFrom: "desc" },
    select: { id: true, version: true, effectiveFrom: true },
  });
  return row?.effectiveFrom ? { id: row.id, version: row.version, effectiveFrom: row.effectiveFrom } : null;
}

/** Version number + start for saved version ids (unknown ids are left out). */
export async function versionsByIds(ids: readonly string[]): Promise<Map<string, Omit<VersionRef, "id">>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await prisma.policyVersion.findMany({
    where: { project: project(), id: { in: unique }, status: "PUBLISHED" },
    select: { id: true, version: true, effectiveFrom: true },
  });
  return new Map(
    rows.flatMap((r) => (r.effectiveFrom ? [[r.id, { version: r.version, effectiveFrom: r.effectiveFrom }]] : [])),
  );
}

// ---------------------------------------------------------------------------
// Public — published and started versions only, no admin fields
// ---------------------------------------------------------------------------

async function startedVersions(code: string) {
  const policy = await findPolicy(code);
  const versions = await prisma.policyVersion.findMany({
    where: { project: project(), policyId: policy.id, status: "PUBLISHED", effectiveFrom: { lte: new Date() } },
  });
  return { policy, history: startedHistory(versions, new Date()) };
}

function publicVersion(
  policy: { code: string; name: string; audience: string },
  v: VersionRow & { effectiveFrom: Date; effectiveTo: Date | null },
) {
  return {
    code: policy.code,
    name: policy.name,
    audience: policy.audience,
    version: v.version,
    effectiveFrom: v.effectiveFrom,
    effectiveTo: v.effectiveTo,
    body: renderBody(v.body, v.settings),
    changeSummary: v.changeSummary,
    settings: v.settings,
  };
}

export async function getPublicPolicy(code: string) {
  const { policy, history } = await startedVersions(code);
  const current = history[0];
  if (!current) throw HttpError.notFound(`Policy ${code} has no published version yet`);
  return publicVersion(policy, current);
}

/**
 * Every policy with a version in force, for the public Policies page: one
 * line each, no wording. A policy with nothing published (or only a version
 * scheduled for later) is left out.
 */
export async function listPublicPolicies() {
  const now = new Date();
  const policies = await prisma.policy.findMany({
    where: { project: project() },
    orderBy: { code: "asc" },
    include: { versions: { where: { status: "PUBLISHED", effectiveFrom: { lte: now } } } },
  });
  return policies.flatMap((p) => {
    const current = versionInForce(p.versions, now);
    if (!current) return [];
    return [
      {
        code: p.code,
        name: p.name,
        audience: p.audience,
        version: current.version,
        effectiveFrom: current.effectiveFrom,
        changeSummary: current.changeSummary,
      },
    ];
  });
}

/** The version list (no wording), or one version in full with `version`. */
export async function getPublicHistory(code: string, version?: number) {
  const { policy, history } = await startedVersions(code);
  if (version !== undefined) {
    const one = history.find((v) => v.version === version);
    if (!one) throw HttpError.notFound(`Version ${version} of ${code} not found`);
    return publicVersion(policy, one);
  }
  return {
    code: policy.code,
    name: policy.name,
    versions: history.map((v) => ({
      version: v.version,
      effectiveFrom: v.effectiveFrom,
      effectiveTo: v.effectiveTo,
      changeSummary: v.changeSummary,
    })),
  };
}
