ALTER TABLE `link_codes` ADD COLUMN `player_credential_hash` VARCHAR(64) NULL;

CREATE TABLE `minecraft_player_credentials` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `minecraft_uuid` VARCHAR(191) NOT NULL,
    `credential_hash` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `minecraft_player_credentials_user_id_key`(`user_id`),
    UNIQUE INDEX `minecraft_player_credentials_minecraft_uuid_key`(`minecraft_uuid`),
    UNIQUE INDEX `minecraft_player_credentials_credential_hash_key`(`credential_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `minecraft_player_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `credential_id` VARCHAR(191) NOT NULL,
    `server_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `minecraft_player_sessions_token_hash_key`(`token_hash`),
    INDEX `minecraft_player_sessions_credential_id_idx`(`credential_id`),
    INDEX `minecraft_player_sessions_server_id_idx`(`server_id`),
    INDEX `minecraft_player_sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `minecraft_player_credentials` ADD CONSTRAINT `minecraft_player_credentials_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `minecraft_player_sessions` ADD CONSTRAINT `minecraft_player_sessions_credential_id_fkey` FOREIGN KEY (`credential_id`) REFERENCES `minecraft_player_credentials`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `minecraft_player_sessions` ADD CONSTRAINT `minecraft_player_sessions_server_id_fkey` FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
