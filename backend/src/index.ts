import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';

const configPath = path.resolve('data/config.yml');
const defaultConfigPath = path.resolve('src/config.default.yml');

// Ensure data/config.yml exists by copying from source template
if (!fs.existsSync(configPath)) {
  const dataDir = path.dirname(configPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.copyFileSync(defaultConfigPath, configPath);
}

let raw: Record<string, any> = {};
try {
  raw = (yaml.load(fs.readFileSync(configPath, 'utf-8')) as Record<string, any>) ?? {};
} catch {
  // config.yml malformed — start in setup-only mode
}
const port = parseInt(raw?.port || '3000', 10);
const dbConfigured = raw.db?.databaseUrl && raw.db?.provider;

if (dbConfigured) {
  startFullApp();
} else {
  startSetupServer();
}

async function startFullApp() {
  const { loadConfig } = await import('./config.js');
  const config = loadConfig();

  const { runMigrations } = await import('./migrate.js');
  runMigrations(raw.db.provider);

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

  server.listen(port, () => {
    console.log(`LightTickets API running on port ${port}`);
  });
}

async function startSetupServer() {
  const express = (await import('express')).default;
  const cors = (await import('cors')).default;
  const { AppError } = await import('./utils/errors.js');

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/setup/site-config', (_req, res) => {
    res.json({ isSetup: false, requireLogin: false, siteName: 'LightTickets' });
  });

  const { createServer } = await import('http');
  const server = createServer(app);

  const createSetupRoutes = (await import('./routes/setup.js')).default;
  app.use('/api/setup', createSetupRoutes(server));

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  server.listen(port, () => {
    console.log(`LightTickets setup server running on port ${port}`);
    console.log('Complete setup at the web interface to initialize the database.');
  });
}
