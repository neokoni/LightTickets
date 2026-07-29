CREATE TABLE "minecraft_hook_deliveries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticket_id" INTEGER NOT NULL,
    "server_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "player_uuid" TEXT,
    "hooks" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" DATETIME,
    "acknowledged_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "minecraft_hook_deliveries_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "minecraft_hook_deliveries_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "minecraft_hook_deliveries_server_id_acknowledged_at_idx" ON "minecraft_hook_deliveries"("server_id", "acknowledged_at");
CREATE INDEX "minecraft_hook_deliveries_created_at_idx" ON "minecraft_hook_deliveries"("created_at");
