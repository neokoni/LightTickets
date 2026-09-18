import { Router } from 'express';
import * as groupService from '../services/player-group.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ROLE } from '../constants/roles.js';
import { validate } from '../utils/validate.js';
import * as adminGroupService from '../services/admin-player-group.service.js';
import {
  playerGroupCreateSchema,
  playerGroupItemsQuerySchema,
  playerGroupItemsSchema,
  playerGroupItemUpdateSchema,
  playerGroupUpdateSchema,
} from '../schemas/player-groups.js';

const router = Router();
router.use(authMiddleware, requireRole(ROLE.ADMIN));

router.get('/', async (_req, res) => res.json(await groupService.listGroups()));
router.get('/:id', async (req, res) =>
  res.json(
    await groupService.listGroupItems(
      String(req.params.id),
      validate(playerGroupItemsQuerySchema, req.query),
    ),
  ),
);
router.post('/', async (req, res) =>
  res.status(201).json(await groupService.createGroup(validate(playerGroupCreateSchema, req.body))),
);
router.patch('/:id', async (req, res) =>
  res.json(
    await groupService.updateGroup(
      String(req.params.id),
      validate(playerGroupUpdateSchema, req.body),
    ),
  ),
);
router.delete('/:id', async (req, res) => {
  await adminGroupService.deleteGroup(String(req.params.id));
  res.status(204).end();
});
router.post('/:id/items', async (req, res) =>
  res
    .status(201)
    .json(
      await groupService.addItems(
        String(req.params.id),
        validate(playerGroupItemsSchema, req.body).values,
      ),
    ),
);
router.patch('/:id/items/:itemId', async (req, res) =>
  res.json(
    await groupService.updateItem(
      String(req.params.id),
      String(req.params.itemId),
      validate(playerGroupItemUpdateSchema, req.body).value,
    ),
  ),
);
router.delete('/:id/items/:itemId', async (req, res) => {
  await groupService.deleteItem(String(req.params.id), String(req.params.itemId));
  res.status(204).end();
});

export default router;
