import fs from 'fs';
import { beforeEach } from 'vitest';

import { DATA_DIR, dataPath } from '../src/paths.js';

// Tests run against an isolated data directory (LT_SERVER_DATA_DIR, set in
// vitest.config.ts) so a run can never touch the real data/ folder — no more
// clobbering production config.yml, uploads, or the sqlite db.
const configPath = dataPath('config.yml');

const testConfig = `server:
  port: 3000
  corsOrigins:
    - http://localhost:5173
database:
  provider: sqlite
security:
  jwtSecret: "test-jwt-secret"
  jwtRefreshSecret: "test-refresh-secret"
`;

// Wipe the entire test data dir so every run starts from a clean slate.
fs.rmSync(DATA_DIR, { recursive: true, force: true });

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(configPath, testConfig, 'utf-8');

// Load config to resolve DATABASE_URL consistently with production (absolute path)
const { getConfig } = await import('../src/config.js');
getConfig();

const { runMigrations } = await import('../src/migrate.js');
runMigrations('sqlite');

const { initPrisma, getPrisma } = await import('../src/db.js');

initPrisma();
const prisma = () => getPrisma();

beforeEach(async () => {
  await prisma().setupStatus.deleteMany();
  await prisma().appConfig.deleteMany();
  await prisma().auditLog.deleteMany();
  await prisma().ticketLabel.deleteMany();
  await prisma().attachment.deleteMany();
  await prisma().comment.deleteMany();
  await prisma().linkCode.deleteMany();
  await prisma().passwordResetToken.deleteMany();
  await prisma().ticket.deleteMany();
  await prisma().label.deleteMany();
  await prisma().user.deleteMany();
  await prisma().server.deleteMany();
});

export { prisma };
