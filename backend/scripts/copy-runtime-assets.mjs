import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 组装 dist 为完整部署目录：tsc 编译产物 + 语言资源 + 运行时静态资产，
// 使容器运行时阶段只需复制 dist 一个目录。
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(projectDir, 'dist');

function copyAsset(relativePath) {
  const source = path.join(projectDir, relativePath);
  const target = path.join(distDir, relativePath);
  fs.rmSync(target, { recursive: true, force: true });
  if (!fs.existsSync(source)) {
    throw new Error(`[build] missing asset ${relativePath}`);
  }
  fs.cpSync(source, target, { recursive: true });
}

// 语言资源在 src/locales 下，其余运行时资产在项目根目录。
fs.rmSync(path.join(distDir, 'locales'), { recursive: true, force: true });
fs.cpSync(path.join(projectDir, 'src', 'locales'), path.join(distDir, 'locales'), {
  recursive: true,
});

for (const asset of [
  'templates',
  'prisma',
  'scripts',
  'openapi.json',
  'prisma.config.ts',
  'package.json',
]) {
  copyAsset(asset);
}
