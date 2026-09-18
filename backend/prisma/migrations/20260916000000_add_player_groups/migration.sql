CREATE TABLE "player_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "note" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "player_group_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "player_group_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "player_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "player_group_items_group_id_value_key" ON "player_group_items"("group_id", "value");
CREATE INDEX "player_group_items_value_idx" ON "player_group_items"("value");
