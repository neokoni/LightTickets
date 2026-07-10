import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { dataPath } from './paths.js';
import { DatabaseProvider } from './constants/database-provider.js';

const PRISMA_DIR = path.resolve('prisma');
const SCHEMA_PATH = path.join(PRISMA_DIR, 'schema.prisma');
const GENERATED_PRISMA_DIR = dataPath('prisma');
const GENERATED_SCHEMA_PATH = path.join(GENERATED_PRISMA_DIR, 'schema.prisma');
const GENERATED_MIGRATIONS_PATH = path.join(GENERATED_PRISMA_DIR, 'migrations');

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

function buildGeneratedSchema(provider: DatabaseProvider): string {
  const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  // Prisma 7 no longer allows `url` in the datasource block; the connection URL
  // is supplied via prisma.config.ts (which reads env DATABASE_URL).
  const datasource = `datasource db {
  provider = "${provider}"
}

`;

  return datasource + schemaContent.trimStart();
}

function writeGeneratedPrisma(provider: DatabaseProvider): void {
  const migrationsDir = provider === DatabaseProvider.MYSQL ? 'migrations-mysql' : 'migrations';

  fs.mkdirSync(GENERATED_PRISMA_DIR, { recursive: true });
  fs.writeFileSync(GENERATED_SCHEMA_PATH, buildGeneratedSchema(provider), 'utf-8');
  fs.rmSync(GENERATED_MIGRATIONS_PATH, { recursive: true, force: true });
  fs.cpSync(path.join(PRISMA_DIR, migrationsDir), GENERATED_MIGRATIONS_PATH, {
    recursive: true,
  });
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
    runPrisma(['db', 'execute', '--file', sqlPath]);
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
  runPrisma(['db', 'execute', '--file', metadataPath]);
}

export function runMigrations(provider: DatabaseProvider): void {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  writeGeneratedPrisma(provider);

  runPrisma(['generate', `--schema=${GENERATED_SCHEMA_PATH}`]);

  try {
    runPrisma(['migrate', 'deploy', `--schema=${GENERATED_SCHEMA_PATH}`]);
  } catch (err) {
    if (provider !== DatabaseProvider.SQLITE) throw err;

    console.warn('[migrate] Prisma migrate deploy failed; applying SQLite SQL directly');
    applySqliteMigrations(GENERATED_SCHEMA_PATH, GENERATED_MIGRATIONS_PATH);
  }

  console.log(`[migrate] ${provider} migrations applied`);
}
