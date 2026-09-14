CREATE TABLE "audit_log_pending" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticket_id" INTEGER NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "target_key" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "settles_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "audit_log_pending_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "audit_log_pending_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "audit_log_pending_ticket_id_target_key_key" ON "audit_log_pending"("ticket_id", "target_key");
CREATE INDEX "audit_log_pending_settles_at_idx" ON "audit_log_pending"("settles_at");
