import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const CSS_FILES = [
  'kit.css',
  'lieflat-charts.css',
  'lieflat-threads.css',
  'diagram-canvas.css',
  'dag-canvas.css',
  'code-blocks.css',
  'content-blocks.css',
  'drill-sheet.css',
  'semantic-slides.css',
];

await mkdir(DIST, { recursive: true });
const chunks = await Promise.all(
  CSS_FILES.map(async (file) => `/* === ${file} === */\n${await readFile(path.join(SRC, file), 'utf8')}`),
);
await writeFile(path.join(DIST, 'styles.css'), `${chunks.join('\n\n')}\n`, 'utf8');
console.log(`Bundled ${CSS_FILES.length} stylesheets into dist/styles.css`);
