import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(projectDir, 'src/locales');
const outputDir = path.join(projectDir, 'dist/locales');

fs.rmSync(outputDir, { recursive: true, force: true });
fs.cpSync(sourceDir, outputDir, { recursive: true });
