import fs from 'fs';
import path from 'path';
import { beforeEach, afterAll } from 'vitest';

// Ensure config.yml has db section before any module imports getConfig()
const configPath = path.resolve('data/config.yml');
// Back up the user's real config so tests never clobber production settings.
const realConfigBackup = fs.existsSync(configPath)
  ? fs.readFileSync(configPath, 'utf-8')
  : null;

const testConfig = `port: 3000
jwtSecret: ""
jwtRefreshSecret: ""
db:
  provider: "sqlite"
  databaseUrl: "file:./dev.db"
`;

// Delete stale test DBs so migrations always start fresh.
// loadConfig resolves file:./dev.db to data/dev.db (relative to data/ dir),
// matching the path completeSetup and startFullApp use in production.
for (const p of [path.resolve('data', 'dev.db'), path.resolve('prisma', 'dev.db')]) {
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

fs.writeFileSync(configPath, testConfig, 'utf-8');

// Load config to resolve DATABASE_URL consistently with production (absolute path)
const { loadConfig } = await import('../src/config.js');
loadConfig();

const { runMigrations } = await import('../src/migrate.js');
runMigrations('sqlite');

const { initPrisma, getPrisma } = await import('../src/db.js');

initPrisma();
const prisma = () => getPrisma();

beforeEach(async () => {
  await prisma().ticketTemplate.deleteMany();
  await prisma().setupStatus.deleteMany();
  await prisma().auditLog.deleteMany();
  await prisma().ticketLabel.deleteMany();
  await prisma().attachment.deleteMany();
  await prisma().comment.deleteMany();
  await prisma().permissionRequest.deleteMany();
  await prisma().linkCode.deleteMany();
  await prisma().ticket.deleteMany();
  await prisma().label.deleteMany();
  await prisma().user.deleteMany();
  await prisma().server.deleteMany();
});

// Restore the user's real config after all tests (never write a hardcoded
// clean config — that wipes the production db section and forces re-setup).
afterAll(() => {
  if (realConfigBackup !== null) {
    fs.writeFileSync(configPath, realConfigBackup, 'utf-8');
  } else {
    fs.rmSync(configPath, { force: true });
  }
});

export { prisma };
