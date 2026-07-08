import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PRISMA_DIR = path.resolve('prisma');
const SCHEMA_PATH = path.join(PRISMA_DIR, 'schema.prisma');

function runPrisma(args: string[]): void {
  execFileSync('npx', ['prisma', ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL,
    },
  });
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function applySqliteMigrations(schemaPath: string, migrationsPath: string): void {
  const migrationNames = fs
    .readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const applied: Array<{ name: string; checksum: string }> = [];
  for (const name of migrationNames) {
    const sqlPath = path.join(migrationsPath, name, 'migration.sql');
    if (!fs.existsSync(sqlPath)) continue;

    const sql = fs.readFileSync(sqlPath, 'utf-8');
    runPrisma(['db', 'execute', '--file', sqlPath, '--schema', schemaPath]);
    applied.push({
      name,
      checksum: crypto.createHash('sha256').update(sql).digest('hex'),
    });
  }

  if (applied.length === 0) return;

  const now = new Date().toISOString();
  const metadata = [
    `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    );`,
    ...applied.map(
      (migration) =>
        `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
         VALUES (${sqlString(crypto.randomUUID())}, ${sqlString(migration.checksum)}, ${sqlString(now)}, ${sqlString(migration.name)}, NULL, NULL, ${sqlString(now)}, 1);`,
    ),
  ].join('\n');

  const metadataPath = path.join(path.dirname(schemaPath), 'migration-metadata.sql');
  fs.writeFileSync(metadataPath, metadata, 'utf-8');
  runPrisma(['db', 'execute', '--file', metadataPath, '--schema', schemaPath]);
}

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

  try {
    runPrisma(['generate']);

    try {
      runPrisma(['migrate', 'deploy', `--schema=${tempSchemaPath}`]);
    } catch (err) {
      if (provider !== 'sqlite') throw err;

      console.warn('[migrate] Prisma migrate deploy failed; applying SQLite SQL directly');
      applySqliteMigrations(tempSchemaPath, path.join(tempDir, 'migrations'));
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log(`[migrate] ${provider} migrations applied`);
}
