CREATE TABLE "registration_email_verifications" (
    "email" TEXT NOT NULL PRIMARY KEY,
    "code_hash" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "registration_email_verifications_expires_at_idx"
ON "registration_email_verifications"("expires_at");
