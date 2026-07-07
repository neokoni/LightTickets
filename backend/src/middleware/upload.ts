import multer from 'multer';
import { ValidationError } from '../utils/errors.js';
import { ALLOWED_MIME_TYPES } from '../constants/upload.js';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype as (typeof ALLOWED_MIME_TYPES)[number])) {
      cb(null, true);
    } else {
      cb(new ValidationError('不支持的文件类型'));
    }
  },
});
