CREATE TABLE "mc_register_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "minecraft_uuid" TEXT NOT NULL,
    "minecraft_name" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "player_credential_hash" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mc_register_tokens_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "mc_register_tokens_token_key" ON "mc_register_tokens"("token");
CREATE UNIQUE INDEX "mc_register_tokens_minecraft_uuid_key" ON "mc_register_tokens"("minecraft_uuid");
