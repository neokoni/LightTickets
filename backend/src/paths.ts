import path from 'path';

// Root directory for all runtime-generated data (config, sqlite db, uploads,
// templates, generated prisma client). Defaults to 'data' relative to cwd, but
// can be overridden via LT_SERVER_DATA_DIR so tests and deployments use an
// isolated folder and never clobber production/dev data.
export const DATA_DIR = path.resolve(process.env.LT_SERVER_DATA_DIR || 'data');

export function dataPath(...segments: string[]): string {
  return path.resolve(DATA_DIR, ...segments);
}

// Resolve a stored uploadDir (e.g. "data/uploads") to an absolute filesystem
// path rooted at DATA_DIR. Absolute values are used verbatim; a relative value
// has any leading "data/" segment stripped so it nests under DATA_DIR instead
// of cwd — this keeps test uploads out of the production data directory.
export function resolveUploadDir(uploadDir: string): string {
  if (path.isAbsolute(uploadDir)) return uploadDir;
  const relative = uploadDir.replace(/^data[\\/]/, '');
  return path.resolve(DATA_DIR, relative);
}
