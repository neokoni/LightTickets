import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { LT_DEFAULT_SERVER_URL, LT_DEFAULT_WEB_PORT } from './runtime-config.mjs';

const UNKNOWN_COMMIT = 'unknow';

function resolveAppVersion(): string {
  try {
    const packageJson: unknown = JSON.parse(
      readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
    );

    if (typeof packageJson === 'object' && packageJson !== null && 'version' in packageJson) {
      const version = packageJson.version;
      if (typeof version === 'string' && version.trim()) return version.trim();
    }
  } catch {
    // The About view uses the same fallback as unavailable build metadata.
  }

  return UNKNOWN_COMMIT;
}

function hasUncommittedChanges(): boolean {
  try {
    return (
      execFileSync('git', ['status', '--porcelain'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim().length > 0
    );
  } catch {
    return false;
  }
}

function resolveBuildCommit(configuredCommit?: string): string {
  let commit = configuredCommit?.trim();

  if (!commit) {
    try {
      commit = execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return UNKNOWN_COMMIT;
    }
  }

  if (!/^[0-9a-f]{7,40}$/i.test(commit)) return UNKNOWN_COMMIT;

  const shortCommit = commit.slice(0, 7).toLowerCase();
  return hasUncommittedChanges() ? `${shortCommit}-dirty` : shortCommit;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const webPort = Number(env.LT_WEB_PORT || LT_DEFAULT_WEB_PORT);
  const buildCommit = resolveBuildCommit(env.LT_GIT_COMMIT || process.env.GITHUB_SHA);
  const appVersion = resolveAppVersion();

  return {
    envPrefix: 'LT_',
    define: {
      'import.meta.env.LT_BUILD_COMMIT': JSON.stringify(buildCommit),
      'import.meta.env.LT_APP_VERSION': JSON.stringify(appVersion),
    },
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: webPort,
      proxy: {
        '/api': {
          target: env.LT_SERVER_URL || LT_DEFAULT_SERVER_URL,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: webPort,
    },
  };
});
