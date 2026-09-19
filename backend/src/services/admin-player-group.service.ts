import { AppError } from '../utils/errors.js';
import { prisma } from '../db.js';
import * as completionHookService from './completion-hook.service.js';
import * as playerGroupService from './player-group.service.js';
import * as templateService from './template.service.js';

export async function deleteGroup(id: string): Promise<void> {
  return templateService.withTemplateMutationLock(async () => {
    const normalizedId = id.trim();
    await prisma().$transaction(async (tx) => {
      await playerGroupService.lockGroups(tx, [normalizedId]);
      if (
        templateService.usesPlayerGroup(normalizedId) ||
        (await completionHookService.pendingUsesPlayerGroup(normalizedId, tx))
      ) {
        throw new AppError(409, 'group 正被模板或待处理完成钩子引用，无法删除');
      }
      await tx.playerGroup.delete({ where: { id: normalizedId } });
    });
  });
}
