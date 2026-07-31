ALTER TABLE "attachments" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "attachments" ADD COLUMN "expires_at" DATETIME;
ALTER TABLE "app_config" ADD COLUMN "attachment_config" TEXT;

UPDATE "attachments"
SET "status" = 'attached'
WHERE "ticket_id" IS NOT NULL OR "comment_id" IS NOT NULL;

UPDATE "attachments"
SET "expires_at" = datetime("created_at", '+7 days')
WHERE "ticket_id" IS NULL AND "comment_id" IS NULL;

CREATE INDEX "attachments_status_expires_at_idx" ON "attachments"("status", "expires_at");
CREATE INDEX "attachments_uploaded_by_status_idx" ON "attachments"("uploaded_by", "status");
