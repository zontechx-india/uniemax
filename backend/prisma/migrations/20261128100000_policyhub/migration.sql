-- PolicyHub: platform policies in their own schema (docs/policyhub/README.md).
-- Additive only — no existing table changes. Every row carries its project;
-- links use (id, project) so a version / event can't cross projects.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "policyhub";

-- CreateEnum
CREATE TYPE "policyhub"."PolicyVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "policyhub"."policies" (
    "id" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policyhub"."policy_versions" (
    "id" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "policyhub"."PolicyVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "body" TEXT NOT NULL,
    "changeSummary" TEXT,
    "changeReason" TEXT,
    "settings" JSONB,
    "effectiveFrom" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "publishedByEmail" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policyhub"."policy_events" (
    "id" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "note" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "policies_project_code_key" ON "policyhub"."policies"("project", "code");

-- CreateIndex
CREATE UNIQUE INDEX "policies_id_project_key" ON "policyhub"."policies"("id", "project");

-- CreateIndex
CREATE INDEX "policy_versions_project_policyId_status_effectiveFrom_idx" ON "policyhub"."policy_versions"("project", "policyId", "status", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_policyId_version_key" ON "policyhub"."policy_versions"("policyId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_id_project_key" ON "policyhub"."policy_versions"("id", "project");

-- CreateIndex
CREATE INDEX "policy_events_versionId_createdAt_idx" ON "policyhub"."policy_events"("versionId", "createdAt");

-- CreateIndex
CREATE INDEX "policy_events_project_createdAt_idx" ON "policyhub"."policy_events"("project", "createdAt");

-- AddForeignKey
ALTER TABLE "policyhub"."policy_versions" ADD CONSTRAINT "policy_versions_policyId_project_fkey" FOREIGN KEY ("policyId", "project") REFERENCES "policyhub"."policies"("id", "project") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policyhub"."policy_events" ADD CONSTRAINT "policy_events_versionId_project_fkey" FOREIGN KEY ("versionId", "project") REFERENCES "policyhub"."policy_versions"("id", "project") ON DELETE RESTRICT ON UPDATE CASCADE;

