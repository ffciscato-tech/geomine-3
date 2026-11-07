import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cloudRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultSource = resolve(cloudRoot, '..', 'dist', 'GeoMine.html');
const source = resolve(process.env.GEOMINE_SOURCE || defaultSource);
const targetDir = resolve(cloudRoot, 'public', 'geomine');
const target = resolve(targetDir, 'GeoMine.html');

const info = await stat(source).catch(() => null);
if (!info?.isFile()) {
  throw new Error(`GeoMine oficial não encontrado em: ${source}`);
}

const bytes = await readFile(source);
const sha256 = createHash('sha256').update(bytes).digest('hex');

await mkdir(targetDir, { recursive: true });
await copyFile(source, target);
await writeFile(
  resolve(targetDir, 'version.json'),
  `${JSON.stringify({ file: 'GeoMine.html', bytes: info.size, sha256 }, null, 2)}\n`,
  'utf8',
);

console.log(`GeoMine sincronizado: ${info.size} bytes · sha256 ${sha256}`);
