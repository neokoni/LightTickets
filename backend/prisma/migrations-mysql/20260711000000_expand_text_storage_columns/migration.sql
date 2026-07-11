ALTER TABLE `users`
  MODIFY `avatar_url` TEXT NULL;

ALTER TABLE `servers`
  MODIFY `address` VARCHAR(255) NULL,
  MODIFY `description` TEXT NULL;

ALTER TABLE `tickets`
  MODIFY `title` VARCHAR(200) NOT NULL,
  MODIFY `body` TEXT NOT NULL,
  MODIFY `form_data` TEXT NULL,
  MODIFY `game_context` TEXT NULL;

ALTER TABLE `labels`
  MODIFY `description` TEXT NULL;

ALTER TABLE `comments`
  MODIFY `body` TEXT NOT NULL;

ALTER TABLE `attachments`
  MODIFY `filename` VARCHAR(255) NOT NULL,
  MODIFY `path` VARCHAR(512) NOT NULL;

ALTER TABLE `setup_status`
  MODIFY `site_url` TEXT NULL,
  MODIFY `footer_content` TEXT NULL;

ALTER TABLE `app_config`
  MODIFY `upload_dir` TEXT NOT NULL,
  MODIFY `s3_config` TEXT NULL;

ALTER TABLE `audit_logs`
  MODIFY `old_value` TEXT NULL,
  MODIFY `new_value` TEXT NULL;
