#!/usr/bin/env node
/**
 * Import photos for the site.
 *
 *   node scripts/prep-photos.mjs <source-folder> <prefix>
 *
 * sips decodes HEIC (sharp's bundled libheif has no HEVC decoder), then sharp —
 * the same library Astro uses — does everything else:
 *
 *   .rotate()  with no argument bakes EXIF orientation into the pixels. Roughly
 *              half of iPhone photos are stored sideways with an orientation
 *              flag; without this they render rotated once metadata is dropped.
 *   metadata   is dropped by default, so GPS coordinates never reach the public
 *              repo. (Do NOT "fix" this by calling .withMetadata().)
 *
 * The long edge is capped at MAX_EDGE because the largest size the photo grid
 * ever requests is 1100px; anything bigger is bytes committed for nothing.
 */
import sharp from 'sharp';
import { readdir, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_EDGE = 1800;
const QUALITY = 80;
const EXTS = new Set(['.heic', '.heif', '.jpg', '.jpeg', '.png', '.tif', '.tiff']);

const [src, prefix = 'photo'] = process.argv.slice(2);
if (!src) {
  console.error('usage: node scripts/prep-photos.mjs <source-folder> <prefix>');
  process.exit(1);
}

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const dest = path.join(root, 'src/assets/photos');
await mkdir(dest, { recursive: true });

const files = (await readdir(src))
  .filter((f) => EXTS.has(path.extname(f).toLowerCase()))
  .sort();

if (!files.length) {
  console.error(`No images found in ${src}`);
  process.exit(1);
}

const work = await mkdtemp(path.join(tmpdir(), 'arf-'));
let n = 0, land = 0, port = 0;
for (const f of files) {
  n++;
  let input = path.join(src, f);
  if (/\.hei[cf]$/i.test(f)) {
    // sharp cannot decode HEIC; hand it a JPEG with the EXIF still attached so
    // .rotate() below can read the orientation flag.
    const jpg = path.join(work, `${n}.jpg`);
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '100', input, '--out', jpg],
      { stdio: 'ignore' });
    input = jpg;
  }
  const out = path.join(dest, `${prefix}-${String(n).padStart(3, '0')}.jpg`);
  const info = await sharp(input)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toFile(out);
  info.width >= info.height ? land++ : port++;
}

await rm(work, { recursive: true, force: true });

console.log(`${n} photo(s) -> src/assets/photos/  (${land} landscape, ${port} portrait)`);
console.log('EXIF dropped, orientation baked in. Next: list them under src/content/albums/.');
