import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { getConfig } from '../config.js';
import { DatabaseProvider } from '../constants/database-provider.js';
import { PLAYER_GROUP_ID_PATTERN, PLAYER_NAME_PATTERN } from '../constants/player-group.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';

function assertGroupId(id: string): string {
  const value = id.trim();
  if (!PLAYER_GROUP_ID_PATTERN.test(value))
    throw new ValidationError('group id 只能包含字母、数字、下划线和短横线');
  return value;
}

// Split a comma-separated player_select submission into a deduplicated, trimmed list.
export function parseSelectionValues(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeValues(values: string[]): string[] {
  const result = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  if (result.some((value) => !PLAYER_NAME_PATTERN.test(value))) {
    throw new ValidationError('group item 必须是有效的 Minecraft 玩家名');
  }
  return result;
}

async function assertGroupExists(id: string): Promise<void> {
  const group = await prisma().playerGroup.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!group || group.id !== id) throw new NotFoundError('group 不存在');
}

export async function lockGroups(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
  const groupIds = [...new Set(ids.map((id) => assertGroupId(id)))].sort();
  if (groupIds.length === 0) return;

  // Both paths acquire a write lock without changing the group's metadata.
  if (getConfig().database.provider === DatabaseProvider.MYSQL) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM player_groups WHERE id IN (${Prisma.join(groupIds)}) ORDER BY id FOR UPDATE`,
    );
    if (locked.length !== groupIds.length) throw new NotFoundError('group 不存在');
    return;
  }

  const locked = await tx.$executeRaw(
    Prisma.sql`UPDATE player_groups SET updated_at = updated_at WHERE id IN (${Prisma.join(groupIds)})`,
  );
  if (locked !== groupIds.length) throw new NotFoundError('group 不存在');
}

async function upsertItems(groupId: string, values: string[]): Promise<string> {
  const id = assertGroupId(groupId);
  const normalized = normalizeValues(values);
  if (normalized.length === 0) throw new ValidationError('至少需要一个 group item');
  // createMany({ skipDuplicates }) is unsupported on the SQLite adapter, so upsert each
  // value. A missing group surfaces as an FK violation (P2003) which we map to a clean
  // 404 instead of doing a separate existence pre-check.
  try {
    await prisma().$transaction(
      normalized.map((value) =>
        prisma().playerGroupItem.upsert({
          where: { groupId_value: { groupId: id, value } },
          create: { groupId: id, value },
          update: {},
        }),
      ),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new NotFoundError('group 不存在');
    }
    throw error;
  }
  return id;
}

export async function listGroups() {
  return prisma().playerGroup.findMany({
    orderBy: { id: 'asc' },
    include: { _count: { select: { items: true } } },
  });
}

export async function listGroupItems(
  id: string,
  input: { page: number; pageSize: number; q: string },
) {
  const groupId = assertGroupId(id);
  const where = {
    groupId,
    ...(input.q ? { value: { contains: input.q } } : {}),
  };
  const [group, items] = await prisma().$transaction([
    prisma().playerGroup.findUnique({
      where: { id: groupId },
      include: { _count: { select: { items: true } } },
    }),
    prisma().playerGroupItem.findMany({
      where,
      orderBy: { value: 'asc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ]);
  if (!group || group.id !== groupId) throw new NotFoundError('group 不存在');
  // Without a filter the total is the group's item count already fetched above; only a
  // filtered listing needs a separate count query.
  const total = input.q ? await prisma().playerGroupItem.count({ where }) : group._count.items;
  return { group, items, total, page: input.page, pageSize: input.pageSize };
}

export async function createGroup(input: { id: string; name?: string; note?: string }) {
  const id = assertGroupId(input.id);
  try {
    return await prisma().playerGroup.create({
      data: { id, name: input.name?.trim() || null, note: input.note?.trim() || null },
      include: { _count: { select: { items: true } } },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'group id 已存在');
    }
    throw error;
  }
}

export async function updateGroup(
  id: string,
  input: { name?: string | null; note?: string | null },
) {
  const groupId = assertGroupId(id);
  await assertGroupExists(groupId);
  return prisma().playerGroup.update({
    where: { id: groupId },
    data: {
      ...(input.name !== undefined ? { name: input.name?.trim() || null } : {}),
      ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
    },
    include: { _count: { select: { items: true } } },
  });
}

export async function addItems(groupId: string, values: string[]) {
  const id = await upsertItems(groupId, values);
  return prisma().playerGroup.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { items: true } } },
  });
}

export async function uploadItem(groupId: string, value: string): Promise<void> {
  await upsertItems(groupId, [value]);
}

export async function updateItem(groupId: string, itemId: string, value: string) {
  const id = assertGroupId(groupId);
  const normalized = normalizeValues([value]);
  if (normalized.length !== 1) throw new ValidationError('item 不能为空');
  const item = await prisma().playerGroupItem.findUnique({ where: { id: itemId } });
  if (!item || item.groupId !== id) throw new NotFoundError('group item 不存在');
  try {
    return await prisma().playerGroupItem.update({
      where: { id: itemId },
      data: { value: normalized[0] },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'group item 已存在');
    }
    throw error;
  }
}

export async function deleteItem(groupId: string, itemId: string) {
  const id = assertGroupId(groupId);
  const item = await prisma().playerGroupItem.findUnique({ where: { id: itemId } });
  if (!item || item.groupId !== id) throw new NotFoundError('group item 不存在');
  await prisma().playerGroupItem.delete({ where: { id: itemId } });
}

export async function searchValues(
  groupIds: string[],
  query: string,
  limit = 50,
): Promise<string[]> {
  const ids = Array.from(new Set(groupIds.map(assertGroupId)));
  if (!ids.length) throw new ValidationError('至少需要一个 group');
  if (!(await groupsExist(ids))) throw new NotFoundError('group 不存在');
  const trimmed = query.trim();
  if (!trimmed) return [];
  const rows = await prisma().playerGroupItem.groupBy({
    by: ['value'],
    where: { groupId: { in: ids }, value: { contains: trimmed } },
    orderBy: { value: 'asc' },
    take: Math.min(Math.max(limit, 1), 100),
  });
  return rows.map((row) => row.value);
}

export async function findInvalidValues(
  groupIds: string[],
  values: string[],
  allowUnknown = false,
): Promise<string[]> {
  const ids = Array.from(new Set(groupIds.map(assertGroupId)));
  const normalizedValues = Array.from(new Set(values.map((value) => value.trim())));
  const malformed = normalizedValues.filter((value) => !PLAYER_NAME_PATTERN.test(value));
  if (allowUnknown) return malformed;
  if (!ids.length) return normalizedValues;
  if (!normalizedValues.length) return [];
  const rows = await prisma().playerGroupItem.findMany({
    where: { groupId: { in: ids }, value: { in: normalizedValues } },
    select: { value: true },
    distinct: ['value'],
  });
  const existing = new Set(rows.map((row) => row.value));
  const malformedValues = new Set(malformed);
  return normalizedValues.filter((value) => malformedValues.has(value) || !existing.has(value));
}

export async function groupsExist(groupIds: string[]): Promise<boolean> {
  const ids = Array.from(new Set(groupIds.map(assertGroupId)));
  if (!ids.length) return false;
  const rows = await prisma().playerGroup.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const existing = new Set(rows.map((row) => row.id));
  return ids.every((id) => existing.has(id));
}
