ALTER TABLE "tickets" ADD COLUMN "completion_hooks_initialized" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ticket_completion_hooks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticket_id" INTEGER NOT NULL,
    "event" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fields" TEXT NOT NULL,
    "actions" TEXT NOT NULL,
    "response" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "visibility" TEXT NOT NULL DEFAULT 'staff',
    "completed_by_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    CONSTRAINT "ticket_completion_hooks_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ticket_completion_hooks_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ticket_completion_hooks_ticket_id_status_idx" ON "ticket_completion_hooks"("ticket_id", "status");
