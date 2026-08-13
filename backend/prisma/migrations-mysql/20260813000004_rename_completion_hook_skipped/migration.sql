ALTER TABLE `ticket_completion_hooks`
    MODIFY `status` ENUM('pending', 'completed', 'cancelled', 'skipped') NOT NULL DEFAULT 'pending';

UPDATE `ticket_completion_hooks`
SET `status` = 'skipped'
WHERE `status` = 'cancelled';

ALTER TABLE `ticket_completion_hooks`
    MODIFY `status` ENUM('pending', 'completed', 'skipped') NOT NULL DEFAULT 'pending';

UPDATE `audit_logs`
SET `action` = 'completion_hook_skipped'
WHERE `action` = 'completion_hook_cancelled';
