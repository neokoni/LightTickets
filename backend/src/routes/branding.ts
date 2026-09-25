import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { brandingUpload } from '../middleware/upload.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../utils/validate.js';
import { ValidationError } from '../utils/errors.js';
import { ROLE } from '../constants/roles.js';
import { BRANDING_FILE_FIELD, BRANDING_SLOTS } from '../constants/branding.js';
import * as brandingService from '../services/branding.service.js';

export const brandingSlotParamsSchema = z.object({
  slot: z.enum(BRANDING_SLOTS),
});

const router = Router();

function parseSlot(req: Request) {
  return validate(brandingSlotParamsSchema, req.params).slot;
}

router.get('/:slot', async (req: Request, res: Response) => {
  brandingService.serveBranding(parseSlot(req), res);
});

router.put(
  '/:slot',
  authMiddleware,
  requireRole(ROLE.ADMIN),
  brandingUpload.single(BRANDING_FILE_FIELD),
  async (req: Request, res: Response) => {
    const slot = parseSlot(req);
    if (!req.file) throw new ValidationError('请选择要上传的文件');
    brandingService.saveBranding(slot, req.file);
    res.json(brandingService.getBrandingState());
  },
);

router.delete(
  '/:slot',
  authMiddleware,
  requireRole(ROLE.ADMIN),
  async (req: Request, res: Response) => {
    brandingService.deleteBranding(parseSlot(req));
    res.json(brandingService.getBrandingState());
  },
);

export default router;
