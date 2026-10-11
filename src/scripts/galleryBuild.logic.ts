/**
 * Pure helpers for the gallery build script (buildGallery.ts).
 *
 * Kept free of filesystem / image-processing code so the parsing, name
 * formatting and photo matching rules can be unit tested.
 */
import type { GalleryAward } from '../types';

export interface ResultRow {
  entryId: string;
  fullName: string;
  placing: string;
  specialAward: string;
}

export interface GalleryEntrant {
  entryId: string;
  fullName: string;
  displayName: string;
  award: GalleryAward | null;
  specialAwards: string[];
}

export interface MatchedEntrant extends GalleryEntrant {
  photoFile: string;
  slug: string;
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF, BOM). */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
};

const normaliseHeader = (header: string) => header.trim().toUpperCase().replace(/\s+/g, ' ');

const RESULT_COLUMNS = {
  entryId: 'ENTRY ID',
  fullName: 'NAME',
  placing: 'PLACING',
} as const;
const SPECIAL_AWARD_COLUMN = 'PC';

/** True if the CSV header row looks like a results export (has NAME and PLACING). */
export const isResultsCsv = (text: string): boolean => {
  const [header] = parseCsv(text);
  if (!header) return false;
  const headers = header.map(normaliseHeader);
  return headers.includes(RESULT_COLUMNS.fullName) && headers.includes(RESULT_COLUMNS.placing);
};

/**
 * Reads only the columns the gallery needs from the results export. Contact
 * details (email, phone, socials) are never read, so they can't leak into the
 * generated output.
 */
export const parseResultsCsv = (text: string): ResultRow[] => {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error('Results CSV is empty');
  const headers = header.map(normaliseHeader);

  const columnIndex = (name: string, required: boolean): number => {
    const index = headers.indexOf(name);
    if (index === -1 && required) {
      throw new Error(`Results CSV is missing the "${name}" column (found: ${headers.join(', ')})`);
    }
    return index;
  };
  const idCol = columnIndex(RESULT_COLUMNS.entryId, true);
  const nameCol = columnIndex(RESULT_COLUMNS.fullName, true);
  const placingCol = columnIndex(RESULT_COLUMNS.placing, true);
  const specialCol = columnIndex(SPECIAL_AWARD_COLUMN, false);

  return rows
    .map(cells => ({
      entryId: (cells[idCol] ?? '').trim(),
      fullName: (cells[nameCol] ?? '').trim().replace(/\s+/g, ' '),
      placing: (cells[placingCol] ?? '').trim(),
      specialAward: specialCol === -1 ? '' : (cells[specialCol] ?? '').trim(),
    }))
    .filter(row => row.fullName !== '');
};

const AWARD_CODES: Record<string, GalleryAward | null | 'dne'> = {
  '': null,
  GOLD: 'gold',
  SILVER: 'silver',
  BRONZE: 'bronze',
  CMND: 'commended',
  COMMENDED: 'commended',
  DNE: 'dne', // Did not enter
};

/** Maps a PLACING cell to an award. Blank = entered but unplaced; 'dne' = did not enter. */
export const parsePlacing = (placing: string): GalleryAward | null | 'dne' => {
  const code = placing.trim().toUpperCase();
  if (!(code in AWARD_CODES)) {
    throw new Error(`Unknown placing "${placing}". Expected one of: ${Object.keys(AWARD_CODES).filter(Boolean).join(', ')}, or blank`);
  }
  return AWARD_CODES[code];
};

const SPECIAL_AWARD_LABELS: Record<string, string> = {
  'PEOPLES CHAMPION': "People's Champion",
  "PEOPLE'S CHAMPION": "People's Champion",
};

const toTitleCase = (value: string) =>
  value.toLowerCase().replace(/(^|\s)\S/g, letter => letter.toUpperCase());

export const parseSpecialAwards = (value: string): string[] =>
  value
    .split(/[;\n]/)
    .map(award => award.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .map(award => SPECIAL_AWARD_LABELS[award.toUpperCase()] ?? toTitleCase(award));

/** "Jason Berman" -> "Jason B.", "Enrique Amaya Pimentel" -> "Enrique P.", "Cher" -> "Cher". */
export const formatDisplayName = (fullName: string): string => {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const [first] = words;
  if (words.length === 1) return first;
  const initial = words[words.length - 1].match(/\p{L}/u)?.[0];
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
};

export const slugify = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const lettersOnly = (value: string) => value.toLowerCase().replace(/[^\p{L}]/gu, '');

/**
 * Name hints from a photo filename. Tokens containing digits (event prefixes
 * like "GA2026", take numbers like "02") are ignored.
 * "GA2026_Michael_McK_02.jpg" -> ["michael", "mck"]
 */
export const photoNameTokens = (fileName: string): string[] =>
  fileName
    .replace(/\.[^.]+$/, '')
    .split(/[\s_-]+/)
    .filter(token => token && !/\d/.test(token))
    .map(lettersOnly)
    .filter(Boolean);

/**
 * Finds the entrant a photo belongs to. The first token must be a prefix of the
 * entrant's first name ("Ben" -> "Benjamin") and the optional second token a
 * prefix of one of their other names ("McK" -> "McKane"). An exact first-name
 * match wins over a prefix match ("Rob" -> Rob over Robert).
 */
export const findEntrantForPhoto = <T extends { fullName: string }>(
  fileName: string,
  entrants: T[],
): T[] => {
  const [firstHint, lastHint] = photoNameTokens(fileName);
  if (!firstHint) return [];

  const candidates = entrants.filter(entrant => {
    const [first, ...rest] = entrant.fullName.split(/\s+/).map(lettersOnly);
    if (!first?.startsWith(firstHint)) return false;
    return !lastHint || rest.some(name => name.startsWith(lastHint));
  });
  if (candidates.length <= 1) return candidates;

  const exact = candidates.filter(entrant => lettersOnly(entrant.fullName.split(/\s+/)[0]) === firstHint);
  return exact.length > 0 ? exact : candidates;
};

export interface EventBuildOptions {
  /** Display name overrides keyed by ENTRY ID, e.g. { "5": "Ben I." }. */
  displayNames?: Record<string, string>;
  /** Explicit photo -> ENTRY ID assignments for filenames the matcher can't resolve. */
  photos?: Record<string, string>;
}

export interface EventBuildResult {
  entries: MatchedEntrant[];
  warnings: string[];
}

/**
 * Combines results rows and photo filenames into the gallery entries for one
 * event, sorted alphabetically. Only entrants with a photo are included.
 * Throws if a photo can't be matched to exactly one entrant, or an entrant
 * matches more than one photo.
 */
export const buildEventEntries = (
  rows: ResultRow[],
  photoFiles: string[],
  options: EventBuildOptions = {},
): EventBuildResult => {
  const warnings: string[] = [];
  const errors: string[] = [];

  const entrants: GalleryEntrant[] = [];
  // DNE entrants stay matchable so a stray photo is reported rather than silently dropped.
  const didNotEnter = new Set<string>();
  for (const row of rows) {
    if (!row.entryId || entrants.some(entrant => entrant.entryId === row.entryId)) {
      errors.push(`${row.fullName}: missing or duplicate ENTRY ID "${row.entryId}"`);
      continue;
    }
    let placing: ReturnType<typeof parsePlacing>;
    try {
      placing = parsePlacing(row.placing);
    } catch (error) {
      errors.push(`Entry ${row.entryId} (${row.fullName}): ${(error as Error).message}`);
      continue;
    }
    if (placing === 'dne') didNotEnter.add(row.entryId);
    entrants.push({
      entryId: row.entryId,
      fullName: row.fullName,
      displayName: options.displayNames?.[row.entryId] ?? formatDisplayName(row.fullName),
      award: placing === 'dne' ? null : placing,
      specialAwards: parseSpecialAwards(row.specialAward),
    });
  }

  for (const entryId of Object.keys(options.displayNames ?? {})) {
    if (!entrants.some(entrant => entrant.entryId === entryId)) {
      warnings.push(`Display name override for entry ${entryId} doesn't match any entry`);
    }
  }

  const photoByEntry = new Map<string, string[]>();
  for (const photoFile of [...photoFiles].sort()) {
    const explicitId = options.photos?.[photoFile];
    const matches = explicitId !== undefined
      ? entrants.filter(entrant => entrant.entryId === explicitId)
      : findEntrantForPhoto(photoFile, entrants);

    if (matches.length !== 1) {
      const detail = matches.length === 0
        ? 'no matching entrant'
        : `matches ${matches.map(m => `${m.entryId} (${m.fullName})`).join(', ')}`;
      errors.push(`Photo "${photoFile}": ${detail}. Rename it or add it to "photos" in the gallery config.`);
      continue;
    }
    const [entrant] = matches;
    if (didNotEnter.has(entrant.entryId)) {
      errors.push(`Photo "${photoFile}" matched entry ${entrant.entryId} (${entrant.fullName}), who is marked DNE.`);
      continue;
    }
    photoByEntry.set(entrant.entryId, [...(photoByEntry.get(entrant.entryId) ?? []), photoFile]);
  }

  const entries: MatchedEntrant[] = [];
  const usedSlugs = new Set<string>();
  for (const entrant of entrants) {
    const photos = photoByEntry.get(entrant.entryId);
    if (!photos) continue;
    if (photos.length > 1) {
      errors.push(`Entry ${entrant.entryId} (${entrant.fullName}) has ${photos.length} photos (${photos.join(', ')}); only one is allowed.`);
      continue;
    }
    let slug = slugify(entrant.displayName) || `entry-${entrant.entryId}`;
    if (usedSlugs.has(slug)) slug = `${slug}-${slugify(entrant.entryId)}`;
    usedSlugs.add(slug);

    const { entryId, fullName, displayName, award, specialAwards } = entrant;
    entries.push({ entryId, fullName, displayName, award, specialAwards, photoFile: photos[0], slug });
  }

  if (errors.length > 0) {
    throw new Error(`Gallery build failed:\n  - ${errors.join('\n  - ')}`);
  }

  const nameCounts = new Map<string, number>();
  for (const entry of entries) nameCounts.set(entry.displayName, (nameCounts.get(entry.displayName) ?? 0) + 1);
  for (const [name, count] of nameCounts) {
    if (count > 1) warnings.push(`${count} entries share the display name "${name}"; consider a displayNames override`);
  }

  entries.sort((a, b) => a.displayName.localeCompare(b.displayName, 'en', { sensitivity: 'base' }));
  return { entries, warnings };
};
