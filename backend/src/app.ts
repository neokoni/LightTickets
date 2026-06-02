import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { AppError } from './utils/errors.js';
import { getConfig } from './config.js';
import createSetupRoutes from './routes/setup.js';
import authRoutes from './routes/auth.js';
import ticketRoutes from './routes/tickets.js';
import commentRoutes from './routes/comments.js';
import labelRoutes from './routes/labels.js';
import attachmentRoutes from './routes/attachments.js';
import serverRoutes from './routes/servers.js';
import mcRoutes from './routes/mc.js';
import auditRoutes from './routes/audit.js';
import templateRoutes from './routes/templates.js';
import adminTemplateRoutes from './routes/admin-templates.js';
import userRoutes from './routes/users.js';
import { initTemplates } from './services/template.service.js';

export function createApp() {
  const app = express();

  initTemplates();

  app.use(cors());
  app.use(express.json());

  if (!fs.existsSync(getConfig().uploadDir)) {
    fs.mkdirSync(getConfig().uploadDir, { recursive: true });
  }

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/setup', createSetupRoutes());
  app.use('/api/auth', authRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/admin/templates', adminTemplateRoutes);
  app.use('/api/tickets', ticketRoutes);
  app.use('/api/tickets/:id/comments', commentRoutes);
  app.use('/api/tickets/:ticketId/audit', auditRoutes);
  app.use('/api/labels', labelRoutes);
  app.use('/api/attachments', attachmentRoutes);
  app.use('/api/servers', serverRoutes);
  app.use('/api/mc', mcRoutes);
  app.use('/api/users', userRoutes);

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
