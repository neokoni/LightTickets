ALTER TABLE `users` ADD COLUMN `pending_email` VARCHAR(320) NULL;

CREATE UNIQUE INDEX `users_pending_email_key` ON `users`(`pending_email`);

CREATE TABLE `email_change_requests` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `new_email` VARCHAR(320) NOT NULL,
    `code_hash` VARCHAR(64) NOT NULL,
    `cancel_token_hash` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `email_change_requests_user_id_key`(`user_id`),
    UNIQUE INDEX `email_change_requests_new_email_key`(`new_email`),
    UNIQUE INDEX `email_change_requests_cancel_token_hash_key`(`cancel_token_hash`),
    INDEX `email_change_requests_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `email_change_requests` ADD CONSTRAINT `email_change_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
