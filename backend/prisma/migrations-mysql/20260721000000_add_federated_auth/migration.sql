CREATE TABLE `federated_auth_providers` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `icon_url` VARCHAR(191) NULL,
    `protocol` ENUM('oidc', 'oauth') NOT NULL,
    `issuer` VARCHAR(191) NULL,
    `authorization_endpoint` VARCHAR(191) NULL,
    `token_endpoint` VARCHAR(191) NULL,
    `user_info_endpoint` VARCHAR(191) NULL,
    `redirect_uri` VARCHAR(191) NOT NULL,
    `client_id` VARCHAR(191) NOT NULL,
    `client_secret_encrypted` TEXT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `subject_path` VARCHAR(191) NOT NULL,
    `username_path` VARCHAR(191) NULL,
    `email_path` VARCHAR(191) NULL,
    `avatar_path` VARCHAR(191) NULL,
    `authorization_params` TEXT NULL,
    `pkce` BOOLEAN NOT NULL DEFAULT true,
    `secret_mode` ENUM('basic', 'post', 'bcrypt') NOT NULL DEFAULT 'basic',
    `access_token_path` VARCHAR(191) NOT NULL DEFAULT 'access_token',
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `allow_registration` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `federated_auth_providers_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `federated_auth_identities` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `provider_id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `username_hint` VARCHAR(191) NULL,
    `email_hint` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `federated_auth_identities_provider_id_subject_key`(`provider_id`, `subject`),
    UNIQUE INDEX `federated_auth_identities_user_id_provider_id_key`(`user_id`, `provider_id`),
    INDEX `federated_auth_identities_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `federated_auth_flows` (
    `id` VARCHAR(191) NOT NULL,
    `state_hash` VARCHAR(191) NOT NULL,
    `browser_hash` VARCHAR(191) NOT NULL,
    `provider_id` VARCHAR(191) NOT NULL,
    `intent` ENUM('login', 'link') NOT NULL,
    `user_id` INTEGER NULL,
    `return_to` VARCHAR(191) NOT NULL,
    `payload_encrypted` TEXT NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `federated_auth_flows_state_hash_key`(`state_hash`),
    INDEX `federated_auth_flows_expires_at_idx`(`expires_at`),
    INDEX `federated_auth_flows_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `federated_auth_registrations` (
    `id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `provider_id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `username_hint` VARCHAR(191) NULL,
    `email_hint` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `federated_auth_registrations_token_hash_key`(`token_hash`),
    INDEX `federated_auth_registrations_provider_id_subject_idx`(`provider_id`, `subject`),
    INDEX `federated_auth_registrations_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `federated_auth_identities` ADD CONSTRAINT `federated_auth_identities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `federated_auth_identities` ADD CONSTRAINT `federated_auth_identities_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `federated_auth_providers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `federated_auth_flows` ADD CONSTRAINT `federated_auth_flows_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `federated_auth_providers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `federated_auth_flows` ADD CONSTRAINT `federated_auth_flows_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `federated_auth_registrations` ADD CONSTRAINT `federated_auth_registrations_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `federated_auth_providers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
