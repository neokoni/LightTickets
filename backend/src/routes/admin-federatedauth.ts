import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ROLE } from '../constants/roles.js';
import { validate } from '../utils/validate.js';
import {
  federatedAuthProviderCreateSchema,
  federatedAuthProviderUpdateSchema,
} from '../schemas/federatedauth.js';
import * as federatedAuthProviderService from '../services/federatedauth-provider.service.js';

const router = Router();
const idSchema = z.object({ id: z.string().uuid() });

router.use(authMiddleware, requireRole(ROLE.ADMIN));

router.get('/providers', async (_req: Request, res: Response) => {
  res.json(await federatedAuthProviderService.listProviders());
});

router.post('/providers', async (req: Request, res: Response) => {
  const data = validate(federatedAuthProviderCreateSchema, req.body);
  res.status(201).json(await federatedAuthProviderService.createProvider(data));
});

router.patch('/providers/:id', async (req: Request, res: Response) => {
  const { id } = validate(idSchema, req.params);
  const data = validate(federatedAuthProviderUpdateSchema, req.body);
  res.json(await federatedAuthProviderService.updateProvider(id, data));
});

router.delete('/providers/:id', async (req: Request, res: Response) => {
  const { id } = validate(idSchema, req.params);
  await federatedAuthProviderService.deleteProvider(id);
  res.status(204).end();
});

router.delete('/providers/:id/identities', async (req: Request, res: Response) => {
  const { id } = validate(idSchema, req.params);
  res.json(await federatedAuthProviderService.unlinkProviderIdentities(id));
});

router.post('/providers/:id/test', async (req: Request, res: Response) => {
  const { id } = validate(idSchema, req.params);
  res.json(await federatedAuthProviderService.testProvider(id));
});

export default router;
