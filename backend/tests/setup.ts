import fs from 'fs';
import path from 'path';
import { beforeEach, afterAll } from 'vitest';

// Ensure config.yml has db section before any module imports getConfig()
const configPath = path.resolve('data/config.yml');
const cleanConfig = `port: 3000
jwtSecret: ""
jwtRefreshSecret: ""
`;
const testConfig = `port: 3000
jwtSecret: ""
jwtRefreshSecret: ""
db:
  provider: "sqlite"
  databaseUrl: "file:./dev.db"
`;

// Delete stale test DB so migrations always start fresh.
// Prisma resolves file: URLs relative to the schema directory (prisma/).
const testDbPath = path.resolve('prisma', 'dev.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

fs.writeFileSync(configPath, testConfig, 'utf-8');
process.env.DATABASE_URL = 'file:./dev.db';

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

// Restore clean config (without db section) after all tests
afterAll(() => {
  fs.writeFileSync(configPath, cleanConfig, 'utf-8');
});

export { prisma };
