ALTER TABLE `minecraft_hook_deliveries`
  ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  ADD COLUMN `failed_at` DATETIME(3) NULL;

CREATE INDEX `minecraft_hook_deliveries_server_id_status_idx`
  ON `minecraft_hook_deliveries`(`server_id`, `status`);
