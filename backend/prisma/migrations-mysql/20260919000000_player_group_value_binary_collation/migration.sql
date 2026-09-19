-- Player names are matched case-sensitively in the application layer: a case-sensitive
-- JS Set in player-group.service.ts plus SQLite's default BINARY collation. MySQL created
-- this column as utf8mb4_unicode_ci, so membership checks (findInvalidValues, the unique
-- index, upserts) diverged between providers and let wrong-cased input (e.g. `ADMIN` for
-- member `Admin`) pass validation and reach completion-hook commands. Align the value
-- column to a binary collation so both providers match names case-sensitively.
ALTER TABLE `player_group_items`
  MODIFY `value` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
