#!/usr/bin/env node
/**
 * Sync the "Alex Runs Far" album in Apple Photos into the site.
 *
 *   npm run photos:sync
 *
 * Add photos to that album in Photos, run this, done. It is incremental and
 * safe to re-run:
 *
 *   - Filenames are derived from capture date + original name, so they are
 *     STABLE. (The old importer numbered by sort order, so adding one photo
 *     renumbered everything after it.)
 *   - Only photos missing from src/assets/photos are exported and processed.
 *   - stream.md is rewritten, but any alt / caption / hero you typed by hand is
 *     carried across. Photos removed from the album are dropped.
 *   - Location comes from Photos and is rounded to ~1km. EXIF (including GPS)
 *     is stripped from the image files themselves.
 */
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { readdir, mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALBUM = process.argv[2] ?? 'Alex Runs Far';
const MAX_EDGE = 1800;
const QUALITY = 80;
const CHUNK = 20;                       // AppleEvents time out on long batches

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const dest = path.join(root, 'src/assets/photos');
const streamFile = path.join(root, 'src/content/albums/stream.md');

const osa = (script) =>
  execFileSync('osascript', ['-e', script], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** Ask Photos for the album contents: filename, capture date, coordinates. */
function readAlbum() {
  const count = Number(
    osa(`tell application "Photos" to return count of media items of album "${ALBUM}"`).trim(),
  );
  const rows = [];
  for (let start = 1; start <= count; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, count);
    const out = osa(`
      with timeout of 600 seconds
        tell application "Photos"
          set xs to media items of album "${ALBUM}"
          set acc to ""
          repeat with i from ${start} to ${end}
            set m to item i of xs
            set d to (date of m)
            set stamp to (year of d as text) & "-" & text -2 thru -1 of ("0" & ((month of d as integer) as text)) & "-" & text -2 thru -1 of ("0" & (day of d as text))
            try
              set loc to location of m
              if loc is missing value then
                set ll to "|"
              else
                set ll to (item 1 of loc as text) & "|" & (item 2 of loc as text)
              end if
            on error
              set ll to "|"
            end try
            set acc to acc & (filename of m) & "\\t" & stamp & "\\t" & ll & linefeed
          end repeat
          return acc
        end tell
      end timeout`);
    for (const line of out.split('\n')) {
      const [file, date, lat, lon] = line.split('\t').flatMap((s, i) => (i === 2 ? s.split('|') : s));
      if (!file || !date) continue;
      rows.push({
        file, date, index: rows.length + 1,
        lat: lat && Math.abs(+lat) > 0.01 ? Math.round(+lat * 100) / 100 : undefined,
        lon: lon && Math.abs(+lon) > 0.01 ? Math.round(+lon * 100) / 100 : undefined,
      });
    }
  }
  // Recompute indices against the real album order.
  rows.forEach((r, i) => (r.index = i + 1));
  return rows;
}

/** arf-20260714-img_7627.jpg — stable across re-runs. */
const targetName = (r) =>
  `arf-${r.date.replace(/-/g, '')}-${path.parse(r.file).name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.jpg`;

async function main() {
  await mkdir(dest, { recursive: true });
  const rows = readAlbum();
  console.log(`album "${ALBUM}": ${rows.length} items`);

  const missing = rows.filter((r) => !existsSync(path.join(dest, targetName(r))));
  console.log(`${rows.length - missing.length} already imported, ${missing.length} to fetch`);

  if (missing.length) {
    const work = await mkdtemp(path.join(tmpdir(), 'arf-sync-'));
    for (let i = 0; i < missing.length; i += CHUNK) {
      const batch = missing.slice(i, i + CHUNK);
      const idx = batch.map((r) => `item ${r.index} of xs`).join(', ');
      osa(`
        with timeout of 900 seconds
          tell application "Photos"
            set xs to media items of album "${ALBUM}"
            export {${idx}} to (POSIX file "${work}") with using originals
          end tell
        end timeout`);
      process.stdout.write(`  exported ${Math.min(i + CHUNK, missing.length)}/${missing.length}\r`);
    }
    console.log();

    const onDisk = await readdir(work);
    for (const r of missing) {
      const src = onDisk.find((f) => path.parse(f).name === path.parse(r.file).name);
      if (!src) { console.warn(`  !! no export for ${r.file}`); continue; }
      let input = path.join(work, src);
      if (/\.hei[cf]$/i.test(src)) {
        // sharp's libheif has no HEVC decoder; sips does the decode and leaves
        // EXIF attached so .rotate() below can read the orientation flag.
        const jpg = path.join(work, `${path.parse(src).name}-dec.jpg`);
        execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '100', input, '--out', jpg], { stdio: 'ignore' });
        input = jpg;
      }
      await sharp(input)
        .rotate()                                   // bake EXIF orientation into pixels
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: QUALITY, mozjpeg: true })  // metadata dropped by default
        .toFile(path.join(dest, targetName(r)));
    }
    await rm(work, { recursive: true, force: true });
  }

  // Preserve anything hand-written against each photo.
  const prev = new Map();
  if (existsSync(streamFile)) {
    const text = await readFile(streamFile, 'utf8');
    for (const block of text.split('  - src:').slice(1)) {
      const file = block.match(/photos\/([^\s]+)/)?.[1];
      if (!file) continue;
      const keep = {};
      const alt = block.match(/\n\s{4}alt:\s*(.*)/)?.[1]?.trim();
      const cap = block.match(/\n\s{4}caption:\s*(.*)/)?.[1]?.trim();
      if (alt && alt !== '""') keep.alt = alt;
      if (cap) keep.caption = cap;
      if (/\n\s{4}hero:\s*true/.test(block)) keep.hero = true;
      prev.set(file, keep);
    }
  }

  const entries = rows
    .map((r) => ({ ...r, name: targetName(r) }))
    .filter((r) => existsSync(path.join(dest, r.name)))
    .sort((a, b) => b.date.localeCompare(a.date));

  const lines = ['---', 'title: Trail', `date: ${entries[0].date}`, 'kind: other',
                 `cover: ../../assets/photos/${entries[0].name}`, 'photos:'];
  for (const e of entries) {
    const k = prev.get(e.name) ?? {};
    lines.push(`  - src: ../../assets/photos/${e.name}`);
    lines.push(`    date: ${e.date}`);
    if (e.lat !== undefined) { lines.push(`    lat: ${e.lat}`); lines.push(`    lon: ${e.lon}`); }
    lines.push(`    alt: ${k.alt ?? '""'}`);
    if (k.caption) lines.push(`    caption: ${k.caption}`);
    if (k.hero) lines.push('    hero: true');
  }
  await writeFile(streamFile, lines.join('\n') + '\n---\n');

  const located = entries.filter((e) => e.lat !== undefined).length;
  console.log(`stream.md: ${entries.length} photos (${located} geotagged), ${entries.at(-1).date} .. ${entries[0].date}`);
  if (prev.size) console.log(`carried over ${[...prev.values()].filter((v) => Object.keys(v).length).length} hand-edited entries`);
}

main();
