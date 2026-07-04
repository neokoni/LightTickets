import { Router, Request, Response } from 'express';
import { list, get } from '../services/template.service.js';
import { NotFoundError } from '../utils/errors.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(list());
});

router.get('/:name', (req: Request, res: Response) => {
  const template = get(String(req.params.name));
  if (!template) throw new NotFoundError('模板不存在');
  res.json(template);
});

export default router;
