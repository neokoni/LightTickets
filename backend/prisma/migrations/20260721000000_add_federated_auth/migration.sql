CREATE TABLE "federated_auth_providers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon_url" TEXT,
    "protocol" TEXT NOT NULL,
    "issuer" TEXT,
    "authorization_endpoint" TEXT,
    "token_endpoint" TEXT,
    "user_info_endpoint" TEXT,
    "redirect_uri" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret_encrypted" TEXT,
    "scope" TEXT NOT NULL,
    "subject_path" TEXT NOT NULL,
    "username_path" TEXT,
    "email_path" TEXT,
    "avatar_path" TEXT,
    "authorization_params" TEXT,
    "pkce" BOOLEAN NOT NULL DEFAULT true,
    "secret_mode" TEXT NOT NULL DEFAULT 'basic',
    "access_token_path" TEXT NOT NULL DEFAULT 'access_token',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "allow_registration" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "federated_auth_providers_slug_key" ON "federated_auth_providers"("slug");

CREATE TABLE "federated_auth_identities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "provider_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "username_hint" TEXT,
    "email_hint" TEXT,
    "avatar_url" TEXT,
    "last_login_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "federated_auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "federated_auth_identities_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "federated_auth_providers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "federated_auth_identities_provider_id_subject_key" ON "federated_auth_identities"("provider_id", "subject");
CREATE UNIQUE INDEX "federated_auth_identities_user_id_provider_id_key" ON "federated_auth_identities"("user_id", "provider_id");
CREATE INDEX "federated_auth_identities_user_id_idx" ON "federated_auth_identities"("user_id");

CREATE TABLE "federated_auth_flows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "state_hash" TEXT NOT NULL,
    "browser_hash" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "user_id" INTEGER,
    "return_to" TEXT NOT NULL,
    "payload_encrypted" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "used_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "federated_auth_flows_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "federated_auth_providers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "federated_auth_flows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "federated_auth_flows_state_hash_key" ON "federated_auth_flows"("state_hash");
CREATE INDEX "federated_auth_flows_expires_at_idx" ON "federated_auth_flows"("expires_at");
CREATE INDEX "federated_auth_flows_user_id_idx" ON "federated_auth_flows"("user_id");

CREATE TABLE "federated_auth_registrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token_hash" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "username_hint" TEXT,
    "email_hint" TEXT,
    "avatar_url" TEXT,
    "expires_at" DATETIME NOT NULL,
    "used_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "federated_auth_registrations_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "federated_auth_providers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "federated_auth_registrations_token_hash_key" ON "federated_auth_registrations"("token_hash");
CREATE INDEX "federated_auth_registrations_provider_id_subject_idx" ON "federated_auth_registrations"("provider_id", "subject");
CREATE INDEX "federated_auth_registrations_expires_at_idx" ON "federated_auth_registrations"("expires_at");
