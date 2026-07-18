import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
    sequence: { concurrent: false },
    env: {
      // Isolate all runtime data under a test-only directory so test runs can
      // never clobber the real data/ folder (config.yml, uploads, sqlite db).
      // DATABASE_URL is derived from this by loadConfig() -> data-test/data.db.
      LT_SERVER_DATA_DIR: 'data-test',
    },
  },
});
