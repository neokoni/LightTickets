import { defineConfig, env } from 'prisma/config';

// DATABASE_URL is injected at runtime by src/config.ts (resolveDatabaseUrl) and
// forwarded into the Prisma CLI subprocess by src/migrate.ts. In Prisma 7 the
// datasource url lives here instead of in the schema's datasource block.
export default defineConfig({
  datasource: {
    url: env('DATABASE_URL'),
  },
});
