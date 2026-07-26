ALTER TABLE `tickets` ADD COLUMN `completion_hooks_initialized` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `ticket_completion_hooks` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` INTEGER NOT NULL,
    `event` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `fields` LONGTEXT NOT NULL,
    `actions` LONGTEXT NOT NULL,
    `response` LONGTEXT NULL,
    `status` ENUM('pending', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    `visibility` ENUM('public', 'staff') NOT NULL DEFAULT 'staff',
    `completed_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,

    INDEX `ticket_completion_hooks_ticket_id_status_idx`(`ticket_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ticket_completion_hooks` ADD CONSTRAINT `ticket_completion_hooks_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ticket_completion_hooks` ADD CONSTRAINT `ticket_completion_hooks_completed_by_id_fkey` FOREIGN KEY (`completed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
