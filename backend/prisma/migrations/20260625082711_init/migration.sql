-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "minecraft_uuid" TEXT,
    "minecraft_name" TEXT,
    "avatar_url" TEXT,
    "role" TEXT NOT NULL DEFAULT 'player',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "servers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "address" TEXT,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "template" TEXT NOT NULL DEFAULT '',
    "form_data" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "author_id" INTEGER NOT NULL,
    "server_id" TEXT,
    "assignee_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "closed_at" DATETIME,
    CONSTRAINT "tickets_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tickets_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tickets_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "labels" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "description" TEXT
);

-- CreateTable
CREATE TABLE "ticket_labels" (
    "ticket_id" INTEGER NOT NULL,
    "label_id" TEXT NOT NULL,

    PRIMARY KEY ("ticket_id", "label_id"),
    CONSTRAINT "ticket_labels_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ticket_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticket_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'web',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticket_id" INTEGER,
    "comment_id" TEXT,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaded_by" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "attachments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "permission_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticket_id" INTEGER NOT NULL,
    "permission_node" TEXT,
    "group_name" TEXT,
    "execution_status" TEXT NOT NULL DEFAULT 'pending',
    "executed_at" DATETIME,
    "error_message" TEXT,
    CONSTRAINT "permission_requests_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "link_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "minecraft_uuid" TEXT NOT NULL,
    "minecraft_name" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "link_codes_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "setup_status" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "is_setup" BOOLEAN NOT NULL DEFAULT false,
    "site_name" TEXT NOT NULL DEFAULT 'LightTickets',
    "site_url" TEXT,
    "require_login" BOOLEAN NOT NULL DEFAULT false,
    "allow_web_register" BOOLEAN NOT NULL DEFAULT true,
    "footer_content" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticket_id" INTEGER NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ticket_templates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "name_i18n" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "title_prefix" TEXT,
    "labels" TEXT NOT NULL DEFAULT '[]',
    "body" TEXT NOT NULL,
    "completion_hooks" TEXT NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_minecraft_uuid_key" ON "users"("minecraft_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "servers_name_key" ON "servers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "servers_api_key_key" ON "servers"("api_key");

-- CreateIndex
CREATE UNIQUE INDEX "labels_name_key" ON "labels"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permission_requests_ticket_id_key" ON "permission_requests"("ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "link_codes_code_key" ON "link_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_templates_name_key" ON "ticket_templates"("name");
