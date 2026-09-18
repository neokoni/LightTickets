CREATE TABLE `player_groups` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `player_group_items` (
    `id` VARCHAR(191) NOT NULL,
    `group_id` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `player_group_items_group_id_value_key`(`group_id`, `value`),
    INDEX `player_group_items_value_idx`(`value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `player_group_items` ADD CONSTRAINT `player_group_items_group_id_fkey`
  FOREIGN KEY (`group_id`) REFERENCES `player_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
