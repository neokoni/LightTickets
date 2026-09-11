PRAGMA foreign_keys=OFF;

CREATE TABLE "new_servers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "identify_id" TEXT,
    "alias" TEXT,
    "api_key" TEXT,
    "address" TEXT,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_servers" ("id", "name", "api_key", "address", "description", "created_at")
SELECT "id", "name", "api_key", "address", "description", "created_at" FROM "servers";

DROP TABLE "servers";
ALTER TABLE "new_servers" RENAME TO "servers";
CREATE UNIQUE INDEX "servers_name_key" ON "servers"("name");
CREATE UNIQUE INDEX "servers_identify_id_key" ON "servers"("identify_id");
CREATE UNIQUE INDEX "servers_api_key_key" ON "servers"("api_key");

CREATE TABLE "server_api_keys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key_hash" TEXT NOT NULL,
    "title" TEXT,
    "type" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "server_api_key_bindings" (
    "api_key_id" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    CONSTRAINT "server_api_key_bindings_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "server_api_keys" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "server_api_key_bindings_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("api_key_id", "server_id")
);

CREATE UNIQUE INDEX "server_api_keys_key_hash_key" ON "server_api_keys"("key_hash");
CREATE INDEX "server_api_key_bindings_server_id_idx" ON "server_api_key_bindings"("server_id");

PRAGMA foreign_keys=ON;
