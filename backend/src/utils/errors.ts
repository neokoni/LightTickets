import multer from 'multer';
import { Prisma } from '@prisma/client';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = '资源不存在') {
    super(404, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = '未登录或登录已过期') {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = '权限不足') {
    super(403, message);
  }
}

export class ValidationError extends AppError {
  constructor(message = '参数校验失败') {
    super(400, message);
  }
}

function isSqliteTriggerConstraint(error: Prisma.PrismaClientKnownRequestError): boolean {
  const driverAdapterError = error.meta?.driverAdapterError;
  if (!driverAdapterError || typeof driverAdapterError !== 'object') return false;
  const cause = 'cause' in driverAdapterError ? driverAdapterError.cause : undefined;
  if (!cause || typeof cause !== 'object') return false;
  return 'originalCode' in cause && cause.originalCode === 'SQLITE_CONSTRAINT_TRIGGER';
}

export function normalizeError(err: unknown): Error {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return new AppError(409, '资源已存在');
    if (err.code === 'P2003' && !isSqliteTriggerConstraint(err)) return new NotFoundError();
    if (err.code === 'P2025') return new NotFoundError();
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return new ValidationError('数据库请求参数无效');
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new ValidationError('文件大小超过限制 (10MB)');
    }
    return new ValidationError(err.message);
  }
  return err as Error;
}
