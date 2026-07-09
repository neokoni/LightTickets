import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// The base schema has no datasource block (it is composed at runtime by
// src/migrate.ts from config.yml). For build-time client generation the field
// types are identical across providers, so we compose a temporary schema with
// a placeholder datasource purely so `prisma generate` produces the TS types.
const PRISMA_DIR = path.resolve('prisma');
const BASE_SCHEMA = path.join(PRISMA_DIR, 'schema.prisma');
const TMP_SCHEMA = path.join(PRISMA_DIR, '_generate_schema.prisma');

const datasource = `datasource db {\n  provider = "sqlite"\n}\n\n`;
fs.writeFileSync(TMP_SCHEMA, datasource + fs.readFileSync(BASE_SCHEMA, 'utf-8').trimStart());

try {
  execFileSync('npx', ['prisma', 'generate', `--schema=${TMP_SCHEMA}`], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'file:./_generate.db' },
  });
} finally {
  fs.rmSync(TMP_SCHEMA, { force: true });
}
