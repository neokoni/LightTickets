/*
  Warnings:

  - You are about to drop the column `type` on the `tickets` table. All the data in the column will be lost.
  - Added the required column `template` to the `tickets` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `tickets` DROP COLUMN `type`;
ALTER TABLE `tickets` ADD COLUMN `template` VARCHAR(191) NOT NULL;
