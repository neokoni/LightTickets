import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as i18nService from '../services/i18n.service.js';
import { validate } from '../utils/validate.js';

const router = Router();

const languageParamsSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/, '无效的语言 ID'),
});

router.get('/languages', (_req: Request, res: Response) => {
  res.json(i18nService.listLanguages());
});

router.get('/languages/:id', (req: Request, res: Response) => {
  const params = validate(languageParamsSchema, req.params);
  res.json(i18nService.getLanguage(params.id));
});

export default router;
