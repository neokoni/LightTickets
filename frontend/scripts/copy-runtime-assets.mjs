import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 将静态服务器与运行时配置复制进 dist，使 dist 成为可直接部署的完整目录
// （部署布局下 server.mjs 与静态资源同级，按自身目录解析静态资源）。
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(projectDir, 'dist');

for (const file of ['server.mjs', 'runtime-config.mjs']) {
  fs.copyFileSync(path.join(projectDir, file), path.join(distDir, file));
}
