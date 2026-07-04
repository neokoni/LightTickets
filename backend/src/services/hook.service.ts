import { getPrisma } from '../db.js';
import { NotFoundError } from '../utils/errors.js';

const prisma = () => getPrisma();

export async function reportResult(input: {
  hookId: string;
  ticketId: number;
  event?: string;
  type?: string;
  success: boolean;
  errorMessage?: string;
}) {
  const ticket = await prisma().ticket.findUnique({
    where: { id: input.ticketId },
    include: { permissionRequest: true },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  if (ticket.permissionRequest) {
    await prisma().permissionRequest.update({
      where: { ticketId: input.ticketId },
      data: {
        executionStatus: input.success ? 'executed' : 'failed',
        executedAt: new Date(),
        errorMessage: input.success ? null : input.errorMessage ?? null,
      },
    });
  }

  return { ok: true, hookId: input.hookId };
}
