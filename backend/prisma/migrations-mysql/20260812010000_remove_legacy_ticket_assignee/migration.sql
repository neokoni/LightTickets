INSERT IGNORE INTO `ticket_assignees` (`ticket_id`, `user_id`)
SELECT `id`, `assignee_id`
FROM `tickets`
WHERE `assignee_id` IS NOT NULL;

ALTER TABLE `tickets`
    DROP FOREIGN KEY `tickets_assignee_id_fkey`,
    DROP COLUMN `assignee_id`;
