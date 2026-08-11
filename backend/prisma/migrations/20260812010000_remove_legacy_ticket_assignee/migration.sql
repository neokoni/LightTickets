INSERT OR IGNORE INTO "ticket_assignees" ("ticket_id", "user_id")
SELECT "id", "assignee_id"
FROM "tickets"
WHERE "assignee_id" IS NOT NULL;

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_tickets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "template" TEXT NOT NULL DEFAULT '',
    "form_data" TEXT,
    "game_context" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "author_id" INTEGER NOT NULL,
    "server_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "closed_at" DATETIME,
    "completion_hooks_initialized" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "tickets_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tickets_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_tickets" ("id", "title", "body", "template", "form_data", "game_context", "status", "hidden", "author_id", "server_id", "created_at", "updated_at", "closed_at", "completion_hooks_initialized")
SELECT "id", "title", "body", "template", "form_data", "game_context", "status", "hidden", "author_id", "server_id", "created_at", "updated_at", "closed_at", "completion_hooks_initialized"
FROM "tickets";

DROP TABLE "tickets";
ALTER TABLE "new_tickets" RENAME TO "tickets";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
