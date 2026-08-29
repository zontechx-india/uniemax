-- CreateTable
CREATE TABLE "store_theme_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "theme" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_theme_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_theme_templates_isActive_displayOrder_idx" ON "store_theme_templates"("isActive", "displayOrder");
