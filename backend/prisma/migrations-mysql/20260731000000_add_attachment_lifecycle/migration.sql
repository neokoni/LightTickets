ALTER TABLE `attachments`
    ADD COLUMN `status` ENUM('pending', 'attached', 'deleting') NOT NULL DEFAULT 'pending',
    ADD COLUMN `expires_at` DATETIME(3) NULL;
ALTER TABLE `app_config` ADD COLUMN `attachment_config` TEXT NULL;

UPDATE `attachments`
SET `status` = 'attached'
WHERE `ticket_id` IS NOT NULL OR `comment_id` IS NOT NULL;

UPDATE `attachments`
SET `expires_at` = DATE_ADD(`created_at`, INTERVAL 7 DAY)
WHERE `ticket_id` IS NULL AND `comment_id` IS NULL;

CREATE INDEX `attachments_status_expires_at_idx` ON `attachments`(`status`, `expires_at`);
CREATE INDEX `attachments_uploaded_by_status_idx` ON `attachments`(`uploaded_by`, `status`);
