CREATE TABLE `ticket_assignees` (
    `ticket_id` INT NOT NULL,
    `user_id` INT NOT NULL,
    PRIMARY KEY (`ticket_id`, `user_id`),
    CONSTRAINT `ticket_assignees_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ticket_assignees_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
);
