ALTER TABLE "minecraft_hook_deliveries" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "minecraft_hook_deliveries" ADD COLUMN "failed_at" DATETIME;

CREATE INDEX "minecraft_hook_deliveries_server_id_status_idx" ON "minecraft_hook_deliveries"("server_id", "status");
