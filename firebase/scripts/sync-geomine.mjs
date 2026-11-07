import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const defaultSource = '/Users/filipeciscato/Library/CloudStorage/GoogleDrive-ffciscato@ccmeng.net/Drives compartilhados/Gerencia/desensolvimento_software/GeoMine/dist/GeoMine.html';
const source = process.env.GEOMINE_SOURCE || defaultSource;
const privateDirectory = path.join(projectDirectory, 'functions', 'private');
const target = path.join(privateDirectory, 'GeoMine.html');

await mkdir(privateDirectory, { recursive: true });
await copyFile(source, target);

const bytes = await readFile(target);
const digest = createHash('sha256').update(bytes).digest('hex');
const fileStats = await stat(target);
const metadata = {
  source,
  bytes: fileStats.size,
  sha256: digest,
  synchronizedAt: new Date().toISOString(),
};

await writeFile(
  path.join(privateDirectory, 'GeoMine.metadata.json'),
  `${JSON.stringify(metadata, null, 2)}\n`,
  'utf8',
);

console.log(`GeoMine protegido sincronizado: ${fileStats.size} bytes · sha256 ${digest}`);
