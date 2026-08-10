ALTER TABLE `users` ADD COLUMN `minecraft_link_failed_attempts` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN `minecraft_link_locked_until` DATETIME(3) NULL;
ALTER TABLE `link_codes` ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0;
