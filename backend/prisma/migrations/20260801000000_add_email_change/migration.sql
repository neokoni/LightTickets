ALTER TABLE "users" ADD COLUMN "pending_email" TEXT;

CREATE UNIQUE INDEX "users_pending_email_key" ON "users"("pending_email");

CREATE TABLE "email_change_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "new_email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "cancel_token_hash" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_change_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "email_change_requests_user_id_key" ON "email_change_requests"("user_id");
CREATE UNIQUE INDEX "email_change_requests_new_email_key" ON "email_change_requests"("new_email");
CREATE UNIQUE INDEX "email_change_requests_cancel_token_hash_key" ON "email_change_requests"("cancel_token_hash");
CREATE INDEX "email_change_requests_expires_at_idx" ON "email_change_requests"("expires_at");
