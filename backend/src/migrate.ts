import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const PRISMA_DIR = path.resolve('prisma');
const SCHEMA_PATH = path.join(PRISMA_DIR, 'schema.prisma');

export function runMigrations(provider: 'sqlite' | 'mysql'): void {
  const templateFile = provider === 'mysql'
    ? 'schema-mysql.prisma'
    : 'schema-sqlite.prisma';
  const templatePath = path.join(PRISMA_DIR, templateFile);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Schema 模板不存在: ${templatePath}`);
  }

  // Copy template to schema.prisma
  fs.copyFileSync(templatePath, SCHEMA_PATH);

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  // Prisma always looks for migrations/ relative to the schema file.
  // We keep provider-specific dirs (migrations-sqlite/, migrations-mysql/) and
  // swap them into place so Prisma picks up the correct set.
  const currentDir = path.join(PRISMA_DIR, 'migrations');
  const targetDir = path.join(PRISMA_DIR, `migrations-${provider}`);

  // Recovery: if migrations/ is missing (crash between rename-away and rename-in),
  // but the target provider dir exists, just rename it into place and skip the swap.
  if (!fs.existsSync(currentDir) && fs.existsSync(targetDir)) {
    fs.renameSync(targetDir, currentDir);
  }

  // Step 1: If a different provider's migrations are currently active, save them
  const lockPath = path.join(currentDir, 'migration_lock.toml');
  let currentProviderSuffix: string | null = null;

  if (fs.existsSync(lockPath)) {
    const lockContent = fs.readFileSync(lockPath, 'utf-8');
    const activeProvider = lockContent.includes('provider = "mysql"') ? 'mysql' : 'sqlite';
    if (activeProvider !== provider) {
      currentProviderSuffix = activeProvider;
    }
  }

  // Step 2: Save current migrations under provider-specific name
  if (currentProviderSuffix) {
    fs.renameSync(currentDir, path.join(PRISMA_DIR, `migrations-${currentProviderSuffix}`));
  }

  // Step 3: Rename target migrations to migrations/
  if (fs.existsSync(targetDir)) {
    fs.renameSync(targetDir, currentDir);
  }

  // Generate Prisma Client
  execSync('npx prisma generate', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env },
  });

  // Run migrations
  execSync(`npx prisma migrate deploy --schema=${SCHEMA_PATH}`, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL,
    },
  });

  console.log(`[migrate] ${provider} migrations applied`);
}
