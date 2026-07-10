import fs from 'fs';
import yaml from 'js-yaml';
import type { Server } from 'http';

import { CONFIG_PATH, isDatabaseConfigured, getConfig } from './config.js';
import { DEFAULT_SITE_TITLE } from './services/site.js';

function loadSetupServerConfig(): { port?: number } {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  const setupConfig = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf-8')) as {
    server?: { port?: number };
  } | null;
  return setupConfig?.server || {};
}

if (isDatabaseConfigured()) {
  startFullApp();
} else {
  startSetupServer();
}

async function startFullApp() {
  const config = getConfig();

  const { runMigrations } = await import('./migrate.js');
  runMigrations(config.database.provider);

  const { initPrisma } = await import('./db.js');
  initPrisma();

  const { initTemplates } = await import('./services/template.service.js');
  await initTemplates();

  const { createApp } = await import('./app.js');
  const { createServer } = await import('http');
  const { initSocket } = await import('./socket/index.js');

  const app = createApp();
  const server = createServer(app);
  initSocket(server);

  server.listen(config.port, () => {
    console.log(`LightTickets API running on port ${config.port}`);
  });
}

async function startSetupServer() {
  const express = (await import('express')).default;
  const cors = (await import('cors')).default;
  const helmet = (await import('helmet')).default;
  const { errorHandler } = await import('./middleware/error-handler.js');
  const { globalLimiter } = await import('./middleware/rate-limit.js');
  const { responseEnvelope } = await import('./middleware/response-envelope.js');

  const app = express();
  app.use(globalLimiter);
  app.use(helmet());
  const setupConfig = loadSetupServerConfig();
  // Setup mode has no config yet, so the real access origin is unknown until
  // the user submits. Reflect any origin here (one-time bootstrap, no data to
  // protect); completeSetup persists the real origin and the full app then
  // enforces the proper allowlist.
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(responseEnvelope);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/setup/site-config', (_req, res) => {
    res.json({ isSetup: false, requireLogin: false, siteName: DEFAULT_SITE_TITLE });
  });

  const { createServer } = await import('http');
  const server = createServer(app);

  const createSetupRoutes = (await import('./routes/setup.js')).default;
  app.use(
    '/api/setup',
    createSetupRoutes({ onSetupComplete: () => startFullAppAfterSetup(server) }),
  );

  app.use(errorHandler);

  const port = parseInt(String(setupConfig.port ?? '3000'), 10);

  server.listen(port, () => {
    console.log(`LightTickets setup server running on port ${port}`);
    console.log('Complete setup at the web interface to initialize the database.');
  });
}

async function startFullAppAfterSetup(setupServer: Server): Promise<void> {
  const config = getConfig();

  const { initPrisma } = await import('./db.js');
  initPrisma();

  const { initTemplates } = await import('./services/template.service.js');
  await initTemplates();

  const { createApp } = await import('./app.js');
  const { createServer } = await import('http');
  const { initSocket } = await import('./socket/index.js');

  const app = createApp();
  const server = createServer(app);
  initSocket(server);

  setupServer.close(() => {
    server.listen(config.port, () => {
      console.log(`LightTickets API running on port ${config.port}`);
    });
  });
}
