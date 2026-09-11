import type { Request, Response } from 'express';
import { Router } from 'express';
import * as serverService from '../services/server.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ROLE } from '../constants/roles.js';
import { validate } from '../utils/validate.js';
import {
  serverApiKeyCreateSchema,
  serverApiKeyUpdateSchema,
  serverCreateSchema,
  serverUpdateSchema,
} from '../schemas/server.js';

const router = Router();

router.use(authMiddleware, requireRole(ROLE.ADMIN));

export {
  serverApiKeyCreateSchema,
  serverApiKeyUpdateSchema,
  serverCreateSchema,
  serverUpdateSchema,
};

router.get('/', async (_req: Request, res: Response) => {
  const servers = await serverService.list();
  res.json(servers);
});

router.post('/', async (req: Request, res: Response) => {
  const data = validate(serverCreateSchema, req.body);

  const server = await serverService.create(data);
  res.status(201).json(server);
});

router.get('/api-keys', async (_req: Request, res: Response) => {
  res.json(await serverService.listApiKeys());
});

router.post('/api-keys', async (req: Request, res: Response) => {
  const data = validate(serverApiKeyCreateSchema, req.body);
  res.status(201).json(await serverService.createApiKey(data));
});

router.patch('/api-keys/:id', async (req: Request, res: Response) => {
  const data = validate(serverApiKeyUpdateSchema, req.body);
  res.json(await serverService.updateApiKey(String(req.params.id), data));
});

router.post('/api-keys/:id/regenerate', async (req: Request, res: Response) => {
  res.json(await serverService.regenerateApiKey(String(req.params.id)));
});

router.delete('/api-keys/:id', async (req: Request, res: Response) => {
  await serverService.removeApiKey(String(req.params.id));
  res.status(204).end();
});

router.patch('/:id', async (req: Request, res: Response) => {
  const data = validate(serverUpdateSchema, req.body);

  const server = await serverService.update(String(req.params.id), data);
  res.json(server);
});

router.delete('/:id', async (req: Request, res: Response) => {
  await serverService.remove(String(req.params.id));
  res.status(204).end();
});

export default router;
