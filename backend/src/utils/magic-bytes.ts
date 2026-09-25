import { UPLOAD_TYPE_BY_MIME } from '../constants/upload.js';
import { ValidationError } from './errors.js';

export function validateMagicBytes(buffer: Buffer, mimeType: string): void {
  const definition = UPLOAD_TYPE_BY_MIME.get(mimeType);
  if (!definition) throw new ValidationError('不支持的文件类型');
  if (definition.magicBytes.length === 0) return;
  const matches = definition.magicBytes.some((signature) =>
    signature.every((byte, index) => buffer[index] === byte),
  );
  if (!matches) {
    throw new ValidationError('文件内容与声明类型不匹配');
  }
}
