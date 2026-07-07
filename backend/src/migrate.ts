import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PRISMA_DIR = path.resolve('prisma');
const SCHEMA_PATH = path.join(PRISMA_DIR, 'schema.prisma');

export function runMigrations(provider: 'sqlite' | 'mysql'): void {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  const updated = schemaContent.replace(/provider = "(sqlite|mysql)"/, `provider = "${provider}"`);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighttickets-prisma-'));
  const tempSchemaPath = path.join(tempDir, 'schema.prisma');
  fs.writeFileSync(tempSchemaPath, updated, 'utf-8');
  const migrationsDir = provider === 'mysql' ? 'migrations-mysql' : 'migrations';
  fs.cpSync(path.join(PRISMA_DIR, migrationsDir), path.join(tempDir, 'migrations'), {
    recursive: true,
  });

  execSync('npx prisma generate', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env },
  });

  execSync(`npx prisma migrate deploy --schema=${tempSchemaPath}`, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL,
    },
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log(`[migrate] ${provider} migrations applied`);
}
