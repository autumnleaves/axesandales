/**
 * Builds the painting competition gallery from local source data.
 *
 * Run with: npm run gallery:build
 *
 * For each event in gallery.config.json this reads, from <sourceDir>/<sourceFolder>/:
 *   - the results CSV export (auto-detected: the CSV with NAME and PLACING columns,
 *     or set "resultsFile" on the event)
 *   - one photo per entrant in <photosFolder>/, named after the entrant,
 *     e.g. GA2026_Jason.jpg, GA2026_Michael_McK.jpg
 *
 * and writes to <outputDir>/:
 *   - <event id>/event.json  display names + awards only (no contact details)
 *   - <event id>/*.jpg       images cropped to "aspectRatio" (keeping the whole model in
 *                            frame), resized, with metadata stripped, plus thumbnails
 *   - index.json             list of events for the gallery tabs
 *
 * An event with "photosOnly": true has no results CSV: every photo in <photosFolder>/
 * is shown, named after its filename ("Matt B.jpg" -> "Matt B."; camera filenames
 * like PXL_20260816_025615099.jpg are shown without a name), with no placings.
 * Give its entries special awards with "specialAwards": { "<photo file>": ["..."] }.
 *
 * It also writes reports/gallery/<event id>-crops.jpg, a contact sheet showing
 * each crop on the original photo. Check it after adding an event; if a crop is
 * wrong, set "crops": { "<photo file>": <pixels from the top> } on the event.
 *
 * The source folder (docs/) is gitignored because the exports contain contact
 * details. Events whose source folder isn't present locally are skipped and
 * their previously generated output is kept, so anyone can add a new event
 * without having every past event's source files.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import type { GalleryEntry, GalleryEvent, GalleryImage, GalleryIndex } from '../types';
import {
  buildEventEntries,
  buildPhotoOnlyEntries,
  isResultsCsv,
  parseResultsCsv,
  type EventBuildOptions,
  type PhotoOnlyBuildOptions,
} from './galleryBuild.logic';
import { computeCrop, parseAspectRatio, type CropRect } from './galleryCrop.logic';

interface GalleryEventConfig extends EventBuildOptions, PhotoOnlyBuildOptions {
  id: string;
  title: string;
  /** When the event was held, "YYYY-MM" or "YYYY-MM-DD". Tabs are ordered newest first. */
  date: string;
  sourceFolder: string;
  /** Relative to sourceFolder. Defaults to "Photos"; use "." for photos directly in sourceFolder. */
  photosFolder?: string;
  /** No results CSV: show every photo, named from its filename, with no placings. */
  photosOnly?: boolean;
  /** Overrides the gallery-wide aspectRatio, e.g. "4:3" for landscape army shots. */
  aspectRatio?: string;
  resultsFile?: string;
  /** Manual crop offsets (source pixels from the top, or left for landscape photos) by photo file. */
  crops?: Record<string, number>;
}

interface GalleryConfig {
  sourceDir: string;
  outputDir: string;
  /** Width:height of every gallery image, e.g. "4:5". */
  aspectRatio: string;
  events: GalleryEventConfig[];
}

interface PreparedPhoto {
  file: string;
  label: string;
  oriented: Buffer;
  width: number;
  height: number;
  crop: CropRect;
  warnings: string[];
}

const FULL_SIZE = 1600; // Longest edge, px
const THUMB_SIZE = 720;
const ANALYSIS_WIDTH = 600; // Photos are analysed for cropping at this width
const SHEET_TILE_WIDTH = 240;
const SHEET_COLUMNS = 6;
const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const config = JSON.parse(readFileSync(join(repoRoot, 'gallery.config.json'), 'utf8')) as GalleryConfig;
const sourceRoot = resolve(repoRoot, config.sourceDir);
const outputRoot = resolve(repoRoot, config.outputDir);
const publicRoot = resolve(repoRoot, 'public');
const reportsRoot = resolve(repoRoot, 'reports/gallery');

const toSitePath = (absolutePath: string) =>
  absolutePath.slice(publicRoot.length + 1).split(/[\\/]/).join('/');

const findResultsFile = (eventDir: string, event: GalleryEventConfig): string => {
  if (event.resultsFile) return join(eventDir, event.resultsFile);
  const candidates = readdirSync(eventDir)
    .filter(file => extname(file).toLowerCase() === '.csv')
    .filter(file => isResultsCsv(readFileSync(join(eventDir, file), 'utf8')));
  if (candidates.length !== 1) {
    throw new Error(
      `${event.title}: expected exactly one results CSV (with NAME and PLACING columns) in "${eventDir}", found ${candidates.length}` +
      (candidates.length ? ` (${candidates.join(', ')})` : '') +
      '. Set "resultsFile" in gallery.config.json to pick one.',
    );
  }
  return join(eventDir, candidates[0]);
};

/** Applies EXIF orientation, then works out the crop that keeps the model whole. */
const preparePhoto = async (
  source: string,
  file: string,
  label: string,
  aspectRatio: number,
  override?: number,
): Promise<PreparedPhoto> => {
  const oriented = await sharp(source).rotate().toBuffer();
  const { width = 0, height = 0 } = await sharp(oriented).metadata();
  const { data, info } = await sharp(oriented)
    .greyscale()
    .resize({ width: ANALYSIS_WIDTH })
    .blur(1)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { rect, warnings } = computeCrop(width, height, aspectRatio, { data, width: info.width, height: info.height }, override);
  return { file, label, oriented, width, height, crop: rect, warnings };
};

// sharp strips EXIF/GPS metadata from its output by default.
const writeImage = async (photo: PreparedPhoto, destination: string, size: number, quality: number): Promise<GalleryImage> => {
  const info = await sharp(photo.oriented)
    .extract(photo.crop)
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toFile(destination);
  return { src: toSitePath(destination), width: info.width, height: info.height };
};

const XML_ESCAPES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };
const escapeXml = (value: string) => value.replace(/[<>&'"]/g, char => XML_ESCAPES[char]);

/** Contact sheet of the original photos with each crop outlined and the cut-away areas dimmed. */
const writeContactSheet = async (eventId: string, photos: PreparedPhoto[]) => {
  if (photos.length === 0) return;
  const caption = 20;
  const pad = 8;
  const tiles = await Promise.all(photos.map(async photo => {
    const scale = SHEET_TILE_WIDTH / photo.width;
    const tileHeight = Math.round(photo.height * scale);
    const c = {
      left: photo.crop.left * scale,
      top: photo.crop.top * scale,
      width: photo.crop.width * scale,
      height: photo.crop.height * scale,
    };
    const colour = photo.warnings.length > 0 ? '#f43' : '#3d3';
    const svg = `<svg width="${SHEET_TILE_WIDTH}" height="${tileHeight + caption}" xmlns="http://www.w3.org/2000/svg">
      <path fill="#000" fill-opacity="0.6" fill-rule="evenodd"
        d="M0 0H${SHEET_TILE_WIDTH}V${tileHeight}H0Z M${c.left} ${c.top}h${c.width}v${c.height}h${-c.width}Z"/>
      <rect x="${c.left + 1}" y="${c.top + 1}" width="${c.width - 2}" height="${c.height - 2}" fill="none" stroke="${colour}" stroke-width="2"/>
      <text x="4" y="${tileHeight + 14}" font-size="12" font-family="sans-serif" fill="#fff">${escapeXml(photo.label)}</text>
    </svg>`;
    return sharp(photo.oriented)
      .resize({ width: SHEET_TILE_WIDTH })
      .extend({ bottom: caption, background: '#222' })
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png()
      .toBuffer({ resolveWithObject: true });
  }));

  const rowHeights: number[] = [];
  tiles.forEach((tile, i) => {
    const row = Math.floor(i / SHEET_COLUMNS);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, tile.info.height);
  });
  const rowTops = rowHeights.map((_, row) => pad + rowHeights.slice(0, row).reduce((sum, h) => sum + h + pad, 0));
  const columns = Math.min(SHEET_COLUMNS, tiles.length);

  mkdirSync(reportsRoot, { recursive: true });
  const sheetPath = join(reportsRoot, `${eventId}-crops.jpg`);
  await sharp({
    create: {
      width: pad + columns * (SHEET_TILE_WIDTH + pad),
      height: rowTops[rowTops.length - 1] + rowHeights[rowHeights.length - 1] + pad,
      channels: 3,
      background: '#111',
    },
  })
    .composite(tiles.map((tile, i) => ({
      input: tile.data,
      left: pad + (i % SHEET_COLUMNS) * (SHEET_TILE_WIDTH + pad),
      top: rowTops[Math.floor(i / SHEET_COLUMNS)],
    })))
    .jpeg({ quality: 85 })
    .toFile(sheetPath);
  console.log(`  Crop review sheet: ${sheetPath}`);
};

const buildEvent = async (event: GalleryEventConfig): Promise<GalleryEvent | null> => {
  const eventDir = join(sourceRoot, event.sourceFolder);
  if (!existsSync(eventDir)) {
    console.warn(`⚠ ${event.title}: source folder "${eventDir}" not found; keeping existing output.`);
    return null;
  }

  const photosDir = join(eventDir, event.photosFolder ?? 'Photos');
  const photoFiles = readdirSync(photosDir).filter(file => PHOTO_EXTENSIONS.has(extname(file).toLowerCase()));

  const rows = event.photosOnly ? null : parseResultsCsv(readFileSync(findResultsFile(eventDir, event), 'utf8'));
  const { entries, warnings } = rows ? buildEventEntries(rows, photoFiles, event) : buildPhotoOnlyEntries(photoFiles, event);
  warnings.forEach(warning => console.warn(`⚠ ${event.title}: ${warning}`));

  const outDir = join(outputRoot, event.id);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const file of Object.keys(event.crops ?? {})) {
    if (!entries.some(entry => entry.photoFile === file)) {
      console.warn(`⚠ ${event.title}: crop override for "${file}" doesn't match any photo in use`);
    }
  }

  const aspectRatio = parseAspectRatio(event.aspectRatio ?? config.aspectRatio);
  const galleryEntries: GalleryEntry[] = [];
  const prepared: PreparedPhoto[] = [];
  for (const entry of entries) {
    const override = event.crops?.[entry.photoFile];
    const photo = await preparePhoto(join(photosDir, entry.photoFile), entry.photoFile, entry.displayName ?? '(no name)', aspectRatio, override);
    prepared.push(photo);
    galleryEntries.push({
      id: entry.slug,
      name: entry.displayName,
      award: entry.award,
      specialAwards: entry.specialAwards,
      image: await writeImage(photo, join(outDir, `${entry.slug}.jpg`), FULL_SIZE, 82),
      thumbnail: await writeImage(photo, join(outDir, `${entry.slug}-thumb.jpg`), THUMB_SIZE, 78),
    });
    const landscape = photo.crop.left > 0;
    const cropNote = `crop ${landscape ? 'left' : 'top'} ${landscape ? photo.crop.left : photo.crop.top}px${override !== undefined ? ' (manual)' : ''}`;
    console.log(`  ${entry.photoFile} -> ${entry.displayName ?? '(no name)'} (${entry.award ?? 'no placing'}), ${cropNote}`);
    photo.warnings.forEach(warning => console.warn(`⚠ ${event.title}: ${entry.photoFile}: ${warning}; check the crop review sheet`));
  }
  await writeContactSheet(event.id, prepared);

  const galleryEvent: GalleryEvent = { id: event.id, title: event.title, date: event.date, entries: galleryEntries };
  writeFileSync(join(outDir, 'event.json'), `${JSON.stringify(galleryEvent, null, 2)}\n`, 'utf8');

  const skipped = rows ? ` (${rows.length - entries.length} entrants without a photo skipped)` : '';
  console.log(`✓ ${event.title}: ${entries.length} entries with photos${skipped}`);
  return galleryEvent;
};

const writeIndex = () => {
  const events: GalleryIndex['events'] = [];
  for (const event of config.events) {
    const eventFile = join(outputRoot, event.id, 'event.json');
    if (!existsSync(eventFile)) {
      console.warn(`⚠ ${event.title}: no generated output; leaving it out of the index.`);
      continue;
    }
    const built = JSON.parse(readFileSync(eventFile, 'utf8')) as GalleryEvent;
    events.push({ id: event.id, title: event.title, date: event.date, entryCount: built.entries.length });
  }
  // Newest event first so it's the default tab.
  events.sort((a, b) => b.date.localeCompare(a.date));
  writeFileSync(join(outputRoot, 'index.json'), `${JSON.stringify({ events }, null, 2)}\n`, 'utf8');
  console.log(`✓ Wrote index with ${events.length} event(s)`);
};

const main = async () => {
  const ids = config.events.map(event => event.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) throw new Error(`Duplicate event id "${duplicate}" in gallery.config.json`);
  const undated = config.events.find(event => !/^\d{4}-\d{2}(-\d{2})?$/.test(event.date ?? ''));
  if (undated) throw new Error(`${undated.title}: "date" must be "YYYY-MM" or "YYYY-MM-DD" in gallery.config.json`);

  mkdirSync(outputRoot, { recursive: true });
  for (const event of config.events) {
    console.log(`Building ${event.title}...`);
    await buildEvent(event);
  }
  writeIndex();
};

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
