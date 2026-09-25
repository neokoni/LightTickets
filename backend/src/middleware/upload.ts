import multer from 'multer';
import { ValidationError } from '../utils/errors.js';
import { UPLOAD_TYPE_BY_MIME } from '../constants/upload.js';
import { BRANDING_MAX_FILE_BYTES, BRANDING_MIME_TYPES } from '../constants/branding.js';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (UPLOAD_TYPE_BY_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError('不支持的文件类型'));
    }
  },
});

export const brandingUpload = multer({
  storage,
  limits: { fileSize: BRANDING_MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (BRANDING_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError('不支持的文件类型'));
    }
  },
});
