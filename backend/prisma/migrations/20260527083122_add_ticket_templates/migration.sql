-- CreateTable
CREATE TABLE "ticket_templates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "name_i18n" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "title_prefix" TEXT,
    "labels" TEXT NOT NULL DEFAULT '[]',
    "body" TEXT NOT NULL,
    "completion_hooks" TEXT NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_templates_name_key" ON "ticket_templates"("name");
