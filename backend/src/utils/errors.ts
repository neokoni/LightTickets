import multer from 'multer';

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

export function normalizeError(err: unknown): Error {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new ValidationError('文件大小超过限制 (10MB)');
    }
    return new ValidationError(err.message);
  }
  return err as Error;
}
