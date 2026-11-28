/**
 * PolicyHub — end-to-end check against a REAL database (dev only).
 * docs/policyhub/README.md §7, §12 Phase 1.
 *
 * Runs the real PolicyHub service under a throwaway project name
 * ("qa-<time>"), so it never sees or touches real policies: create, edit,
 * publish, schedule, reset, the publish refusals, the public view, project
 * isolation at the database level, and a parallel "start draft" race. Then
 * deletes everything it made.
 *
 *   npx tsx scripts/policy-check.ts
 *
 * Refuses to run against production (APP_ENV / NODE_ENV = production).
 */
import "../src/config/loadEnv.js";
import assert from "node:assert/strict";

if ((process.env.APP_ENV ?? process.env.NODE_ENV) === "production") {
  throw new Error("Refusing to run the policy check against production");
}

// Set the project BEFORE the service (and its env) is loaded.
const PROJECT = `qa-${Date.now()}`;
const OTHER = `${PROJECT}-other`;
process.env.POLICY_PROJECT = PROJECT;

const { prisma } = await import("../src/config/prisma.js");
const svc = await import("../src/package/policy/service.js");

const ADMIN = { id: "qa-admin", email: "qa-admin@example.test" };
const CODE = "PYO-001";
const SETTINGS = { cutoff: "18:00", windowStart: "18:00", windowEnd: "22:00", timezone: "Asia/Kolkata" };
const BODY =
  "Delivered before {{cutoff}} {{tz}}: paid the same day, transfer started between {{windowStart}} and {{windowEnd}} {{tz}}.";

/** Expects the call to fail with this HTTP status. */
async function rejects(status: number, fn: () => Promise<unknown>, label: string) {
  try {
    await fn();
  } catch (err) {
    assert.equal((err as { statusCode?: number }).statusCode, status, `${label}: ${String(err)}`);
    console.log(`  ✔ ${label} → ${status}`);
    return;
  }
  assert.fail(`${label}: expected ${status}, but it succeeded`);
}

const ok = (label: string) => console.log(`  ✔ ${label}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  try {
    console.log(`project ${PROJECT}`);

    // ---- Create ------------------------------------------------------------
    await svc.createPolicy({ code: CODE, name: "Seller Payout Policy", audience: "seller" }, ADMIN);
    let admin = await svc.getPolicy(CODE);
    assert.equal(admin.versions.length, 1);
    assert.equal(admin.versions[0]?.status, "DRAFT");
    assert.equal(admin.events[0]?.action, "CREATED");
    ok("create → empty draft v1 + CREATED event");
    await rejects(409, () => svc.createPolicy({ code: CODE, name: "x", audience: "seller" }, ADMIN), "create same code again");
    await rejects(404, () => svc.getPublicPolicy(CODE), "public view before anything is published");

    // ---- Draft edits ---------------------------------------------------------
    await rejects(400, () => svc.updateDraft(CODE, { settings: { ...SETTINGS, cutoff: "6pm" } }, ADMIN), "bad settings");
    await svc.updateDraft(CODE, { body: "Paid at 6 PM", settings: SETTINGS }, ADMIN);
    admin = await svc.getPolicy(CODE);
    assert.ok(admin.versions[0]!.problems.some((p) => p.includes("{{cutoff}}")));
    ok("draft preview lists what blocks publishing");
    await rejects(400, () => svc.publishDraft(CODE, {}, ADMIN), "publish wording with hand-typed times");

    await svc.updateDraft(CODE, { body: BODY }, ADMIN);
    const edited = (await svc.getPolicy(CODE)).events.find((e) => e.action === "EDITED" && e.after && "body" in (e.after as object) && (e.after as { body: string }).body === BODY);
    assert.ok(edited, "EDITED event with before/after");
    assert.deepEqual(edited.before, { body: "Paid at 6 PM" });
    ok("edit → EDITED event with only the changed fields");

    await rejects(400, () => svc.publishDraft(CODE, { effectiveFrom: new Date(Date.now() - 60 * 60 * 1000) }, ADMIN), "publish in the past");

    // ---- Publish v1 ------------------------------------------------------------
    await svc.publishDraft(CODE, {}, ADMIN);
    const v1 = await svc.getPublicPolicy(CODE);
    assert.equal(v1.version, 1);
    assert.equal(
      v1.body,
      "Delivered before 6:00 PM IST: paid the same day, transfer started between 6:00 PM and 10:00 PM IST.",
    );
    assert.ok(!("changeReason" in v1) && !("publishedByEmail" in v1), "no admin fields in public view");
    ok("publish now → public shows v1, wording filled from settings, no admin fields");
    const v1Row = await prisma.policyVersion.findFirstOrThrow({ where: { project: PROJECT, version: 1 } });

    await rejects(409, () => svc.updateDraft(CODE, { body: "changed" }, ADMIN), "edit with no draft (published can't change)");

    // ---- v2: draft, parallel start, publish rules ------------------------------
    const [a, b] = await Promise.all([svc.startDraft(CODE, ADMIN), svc.startDraft(CODE, ADMIN)]);
    assert.equal(a.id, b.id);
    assert.equal(a.version, 2);
    assert.equal(a.body, BODY);
    ok("two parallel 'start draft' calls → one draft v2, copied from v1");

    await svc.updateDraft(CODE, { settings: { ...SETTINGS, cutoff: "17:00" } }, ADMIN);
    await rejects(400, () => svc.publishDraft(CODE, {}, ADMIN), "publish v2 without change summary / reason");
    await svc.updateDraft(CODE, { changeSummary: "Cutoff moved to 5 PM", changeReason: "QA check" }, ADMIN);

    const startsAt = new Date(Date.now() + 4000);
    await svc.publishDraft(CODE, { effectiveFrom: startsAt }, ADMIN);
    admin = await svc.getPolicy(CODE);
    assert.equal(admin.versions.find((v) => v.version === 2)?.state, "SCHEDULED");
    assert.equal((await svc.getPublicPolicy(CODE)).version, 1);
    assert.deepEqual((await svc.getPublicHistory(CODE)).versions.map((v) => v.version), [1]);
    ok("future publish → admin sees SCHEDULED, public still v1 and history hides v2");

    // ---- v3 draft: start must be after v2's; reset ------------------------------
    await svc.startDraft(CODE, ADMIN);
    await svc.updateDraft(CODE, { body: `${BODY} Extra line.`, changeSummary: "x", changeReason: "y" }, ADMIN);
    await rejects(400, () => svc.publishDraft(CODE, { effectiveFrom: new Date(startsAt.getTime() - 1000) }, ADMIN), "publish v3 starting before v2");
    await svc.resetDraft(CODE, ADMIN);
    admin = await svc.getPolicy(CODE);
    const v3 = admin.versions.find((v) => v.version === 3)!;
    assert.equal(v3.status, "DRAFT");
    assert.equal(v3.body, BODY);
    assert.equal(v3.changeSummary, null);
    assert.equal((v3.settings as { cutoff: string }).cutoff, "17:00"); // copied from v2
    assert.equal(admin.events[0]?.action, "RESET");
    ok("reset → draft back to a copy of v2, RESET event, draft kept (never deleted)");

    // ---- v2 takes effect -----------------------------------------------------
    await sleep(Math.max(0, startsAt.getTime() - Date.now()) + 500);
    const v2 = await svc.getPublicPolicy(CODE);
    assert.equal(v2.version, 2);
    assert.match(v2.body, /before 5:00 PM IST/);
    const history = await svc.getPublicHistory(CODE);
    assert.deepEqual(history.versions.map((v) => v.version), [2, 1]);
    assert.equal(history.versions[1]?.effectiveTo?.getTime(), startsAt.getTime());
    const old = await svc.getPublicHistory(CODE, 1);
    assert.match((old as { body: string }).body, /before 6:00 PM IST/);
    ok("at its start time v2 is current; v1 kept with its period and its own wording");

    const v1After = await prisma.policyVersion.findUniqueOrThrow({ where: { id: v1Row.id } });
    assert.deepEqual(
      { body: v1After.body, settings: v1After.settings, effectiveFrom: v1After.effectiveFrom, updatedAt: v1After.updatedAt },
      { body: v1Row.body, settings: v1Row.settings, effectiveFrom: v1Row.effectiveFrom, updatedAt: v1Row.updatedAt },
    );
    ok("v1 row unchanged after all later work");

    // ---- Project isolation -------------------------------------------------------
    const policy = await prisma.policy.findFirstOrThrow({ where: { project: PROJECT, code: CODE } });
    await assert.rejects(
      prisma.policyVersion.create({
        data: { project: OTHER, policyId: policy.id, version: 99, body: "x", createdById: "qa", createdByEmail: "qa" },
      }),
      /Foreign key|foreign key|P2003/,
    );
    ok("DB refuses a version whose project differs from its policy");
    await prisma.policy.create({ data: { project: OTHER, code: CODE, name: "Other project's", audience: "seller" } });
    assert.equal((await svc.getPolicy(CODE)).name, "Seller Payout Policy");
    assert.equal((await svc.listPolicies()).length, 1);
    ok("same code in another project is separate and invisible here");

    console.log("ALL POLICY CHECKS PASSED");
  } finally {
    for (const project of [PROJECT, OTHER]) {
      await prisma.policyEvent.deleteMany({ where: { project } });
      await prisma.policyVersion.deleteMany({ where: { project } });
      await prisma.policy.deleteMany({ where: { project } });
    }
    console.log("cleaned up");
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
