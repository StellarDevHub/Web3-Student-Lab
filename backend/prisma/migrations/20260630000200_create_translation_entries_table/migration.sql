-- CreateTable: TranslationEntry for i18n platform strings
CREATE TABLE "translation_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "locale" TEXT NOT NULL,
    "namespace" TEXT NOT NULL DEFAULT 'platform',
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translation_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "translation_entries_workspaceId_locale_namespace_key_key" ON "translation_entries"("workspaceId", "locale", "namespace", "key");
CREATE INDEX "translation_entries_workspaceId_locale_namespace_idx" ON "translation_entries"("workspaceId", "locale", "namespace");
