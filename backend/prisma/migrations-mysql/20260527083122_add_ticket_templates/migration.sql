-- CreateTable
CREATE TABLE `ticket_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `name_i18n` LONGTEXT NOT NULL,
    `description` LONGTEXT NOT NULL,
    `title_prefix` VARCHAR(191) NULL,
    `labels` LONGTEXT NOT NULL DEFAULT ('[]'),
    `body` LONGTEXT NOT NULL,
    `completion_hooks` LONGTEXT NOT NULL DEFAULT ('[]'),
    `enabled` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ticket_templates_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
