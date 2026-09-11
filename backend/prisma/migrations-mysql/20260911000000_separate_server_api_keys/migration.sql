ALTER TABLE `servers`
    ADD COLUMN `identify_id` VARCHAR(191) NULL,
    ADD COLUMN `alias` VARCHAR(191) NULL,
    MODIFY `api_key` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `servers_identify_id_key` ON `servers`(`identify_id`);

CREATE TABLE `server_api_keys` (
    `id` VARCHAR(191) NOT NULL,
    `key_hash` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `type` ENUM('paper_folia', 'velocity') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `server_api_keys_key_hash_key`(`key_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `server_api_key_bindings` (
    `api_key_id` VARCHAR(191) NOT NULL,
    `server_id` VARCHAR(191) NOT NULL,
    INDEX `server_api_key_bindings_server_id_idx`(`server_id`),
    PRIMARY KEY (`api_key_id`, `server_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `server_api_key_bindings` ADD CONSTRAINT `server_api_key_bindings_api_key_id_fkey`
    FOREIGN KEY (`api_key_id`) REFERENCES `server_api_keys`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `server_api_key_bindings` ADD CONSTRAINT `server_api_key_bindings_server_id_fkey`
    FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
