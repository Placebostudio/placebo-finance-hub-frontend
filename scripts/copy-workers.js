/**
 * Copies PDF.js worker file from node_modules to public/
 * Run via "postinstall" in package.json.
 */
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const workerSrc = join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
const workerDst = join(root, 'public/pdf.worker.min.mjs');

if (existsSync(workerSrc)) {
  mkdirSync(dirname(workerDst), { recursive: true });
  copyFileSync(workerSrc, workerDst);
  console.log('Copied pdf.worker.min.mjs → public/');
} else {
  console.warn('pdf.worker.min.mjs not found in pdfjs-dist — skipping copy');
}
