import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { getConfig } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { globalLimiter } from './middleware/rate-limit.js';
import { responseEnvelope } from './middleware/response-envelope.js';
import createSetupRoutes from './routes/setup.js';
import authRoutes from './routes/auth.js';
import ticketRoutes from './routes/tickets.js';
import commentRoutes from './routes/comments.js';
import labelRoutes from './routes/labels.js';
import attachmentRoutes from './routes/attachments.js';
import serverRoutes from './routes/servers.js';
import mcRoutes from './routes/mc.js';
import auditRoutes from './routes/audit.js';
import i18nRoutes from './routes/i18n.js';
import templateRoutes from './routes/templates.js';
import adminTemplateRoutes from './routes/admin-templates.js';
import adminStorageRoutes from './routes/admin-storage.js';
import userRoutes from './routes/users.js';
import { initTemplates } from './services/template.service.js';

export function createApp() {
  const app = express();

  initTemplates();

  const config = getConfig();
  app.use(globalLimiter);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || config.corsOrigins.includes(origin)) {
          cb(null, true);
        } else {
          cb(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(responseEnvelope);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/docs/openapi.json', (_req, res) => {
    const openapiPath = path.resolve('openapi.json');
    if (fs.existsSync(openapiPath)) {
      res.json(JSON.parse(fs.readFileSync(openapiPath, 'utf-8')));
    } else {
      res
        .status(404)
        .json({ success: false, statusCode: 404, message: 'OpenAPI spec not generated' });
    }
  });

  app.use('/api/setup', createSetupRoutes());
  app.use('/api/auth', authRoutes);
  app.use('/api/i18n', i18nRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/admin/templates', adminTemplateRoutes);
  app.use('/api/admin/storage', adminStorageRoutes);
  app.use('/api/tickets', ticketRoutes);
  app.use('/api/tickets/:id/comments', commentRoutes);
  app.use('/api/tickets/:ticketId/audit', auditRoutes);
  app.use('/api/labels', labelRoutes);
  app.use('/api/attachments', attachmentRoutes);
  app.use('/api/servers', serverRoutes);
  app.use('/api/mc', mcRoutes);
  app.use('/api/users', userRoutes);

  // Error handler
  app.use(errorHandler);

  return app;
}
