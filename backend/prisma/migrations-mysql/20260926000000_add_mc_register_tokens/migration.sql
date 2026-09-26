CREATE TABLE `mc_register_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `minecraft_uuid` VARCHAR(191) NOT NULL,
    `minecraft_name` VARCHAR(191) NOT NULL,
    `server_id` VARCHAR(191) NOT NULL,
    `player_credential_hash` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `mc_register_tokens_token_key`(`token`),
    UNIQUE INDEX `mc_register_tokens_minecraft_uuid_key`(`minecraft_uuid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `mc_register_tokens` ADD CONSTRAINT `mc_register_tokens_server_id_fkey` FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
