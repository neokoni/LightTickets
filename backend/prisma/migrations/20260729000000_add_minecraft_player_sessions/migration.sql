ALTER TABLE "link_codes" ADD COLUMN "player_credential_hash" TEXT;

CREATE TABLE "minecraft_player_credentials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "minecraft_uuid" TEXT NOT NULL,
    "credential_hash" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "minecraft_player_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "minecraft_player_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "credential_id" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "minecraft_player_sessions_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "minecraft_player_credentials" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "minecraft_player_sessions_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "minecraft_player_credentials_user_id_key" ON "minecraft_player_credentials"("user_id");
CREATE UNIQUE INDEX "minecraft_player_credentials_minecraft_uuid_key" ON "minecraft_player_credentials"("minecraft_uuid");
CREATE UNIQUE INDEX "minecraft_player_credentials_credential_hash_key" ON "minecraft_player_credentials"("credential_hash");
CREATE UNIQUE INDEX "minecraft_player_sessions_token_hash_key" ON "minecraft_player_sessions"("token_hash");
CREATE INDEX "minecraft_player_sessions_credential_id_idx" ON "minecraft_player_sessions"("credential_id");
CREATE INDEX "minecraft_player_sessions_server_id_idx" ON "minecraft_player_sessions"("server_id");
CREATE INDEX "minecraft_player_sessions_expires_at_idx" ON "minecraft_player_sessions"("expires_at");
