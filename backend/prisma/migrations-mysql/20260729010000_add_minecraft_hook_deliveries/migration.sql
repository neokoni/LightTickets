CREATE TABLE `minecraft_hook_deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `ticket_id` INTEGER NOT NULL,
    `server_id` VARCHAR(191) NOT NULL,
    `event` VARCHAR(191) NOT NULL,
    `player_uuid` VARCHAR(191) NULL,
    `hooks` LONGTEXT NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_attempt_at` DATETIME(3) NULL,
    `acknowledged_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `minecraft_hook_deliveries_server_id_acknowledged_at_idx`(`server_id`, `acknowledged_at`),
    INDEX `minecraft_hook_deliveries_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `minecraft_hook_deliveries` ADD CONSTRAINT `minecraft_hook_deliveries_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `minecraft_hook_deliveries` ADD CONSTRAINT `minecraft_hook_deliveries_server_id_fkey` FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
