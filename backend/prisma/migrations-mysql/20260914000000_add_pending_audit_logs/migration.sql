CREATE TABLE `audit_log_pending` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` INTEGER NOT NULL,
    `actor_id` INTEGER NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `target_key` VARCHAR(191) NOT NULL,
    `old_value` TEXT NULL,
    `new_value` TEXT NULL,
    `settles_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `audit_log_pending_ticket_id_target_key_key`(`ticket_id`, `target_key`),
    INDEX `audit_log_pending_settles_at_idx`(`settles_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `audit_log_pending` ADD CONSTRAINT `audit_log_pending_ticket_id_fkey`
    FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `audit_log_pending` ADD CONSTRAINT `audit_log_pending_actor_id_fkey`
    FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
