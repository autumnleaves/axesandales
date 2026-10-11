import { describe, it, expect } from 'vitest';
import {
  buildEventEntries,
  findEntrantForPhoto,
  formatDisplayName,
  isResultsCsv,
  parseCsv,
  parsePlacing,
  parseResultsCsv,
  parseSpecialAwards,
  photoNameTokens,
  slugify,
  type ResultRow,
} from '../scripts/galleryBuild.logic';

const row = (entryId: string, fullName: string, placing = '', specialAward = ''): ResultRow =>
  ({ entryId, fullName, placing, specialAward });

describe('parseCsv', () => {
  it('handles quoted fields, escaped quotes, CRLF and a BOM', () => {
    const csv = '\uFEFFA,B\r\n"x, y","say ""hi"""\r\n\r\nplain,\n';
    expect(parseCsv(csv)).toEqual([['A', 'B'], ['x, y', 'say "hi"'], ['plain', '']]);
  });

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('A\n"line 1\nline 2"')).toEqual([['A'], ['line 1\nline 2']]);
  });
});

describe('parseResultsCsv', () => {
  const csv = [
    'ENTRY ID,NAME,EMAIL,PHONE NUMBER,PLACING,PC,ENTRY PHOTO',
    '1,Aaron McNaughton ,a@example.com,0400 000 000,GOLD,,https://drive.example/1',
    '3,Andrew  Curtis,b@example.com,0400 000 001,SILVER,PEOPLES CHAMPION,',
    ',,,,,,',
  ].join('\n');

  it('reads only the gallery columns and trims names', () => {
    expect(parseResultsCsv(csv)).toEqual([
      row('1', 'Aaron McNaughton', 'GOLD'),
      row('3', 'Andrew Curtis', 'SILVER', 'PEOPLES CHAMPION'),
    ]);
  });

  it('never returns contact details', () => {
    const output = JSON.stringify(parseResultsCsv(csv));
    expect(output).not.toContain('@');
    expect(output).not.toContain('0400');
    expect(output).not.toContain('drive');
  });

  it('throws when a required column is missing', () => {
    expect(() => parseResultsCsv('ENTRY ID,NAME\n1,Someone')).toThrow(/PLACING/);
  });

  it('treats the special award column as optional', () => {
    expect(parseResultsCsv('ENTRY ID,NAME,PLACING\n1,Someone,BRONZE')).toEqual([row('1', 'Someone', 'BRONZE')]);
  });
});

describe('isResultsCsv', () => {
  it('distinguishes the results sheet from the sign-up responses', () => {
    expect(isResultsCsv('ENTRY ID,NAME,PLACING\n1,A,GOLD')).toBe(true);
    expect(isResultsCsv('Timestamp,Email address,What is your full name?\n')).toBe(false);
    expect(isResultsCsv('')).toBe(false);
  });
});

describe('parsePlacing', () => {
  it('maps placing codes to awards', () => {
    expect(parsePlacing('GOLD')).toBe('gold');
    expect(parsePlacing('silver')).toBe('silver');
    expect(parsePlacing(' BRONZE ')).toBe('bronze');
    expect(parsePlacing('CMND')).toBe('commended');
    expect(parsePlacing('Commended')).toBe('commended');
    expect(parsePlacing('')).toBeNull();
    expect(parsePlacing('DNE')).toBe('dne');
  });

  it('rejects unknown codes', () => {
    expect(() => parsePlacing('PLATINUM')).toThrow(/Unknown placing/);
  });
});

describe('parseSpecialAwards', () => {
  it('labels known awards and title-cases others', () => {
    expect(parseSpecialAwards('PEOPLES CHAMPION')).toEqual(["People's Champion"]);
    expect(parseSpecialAwards('BEST  IN SHOW; peoples champion')).toEqual(['Best In Show', "People's Champion"]);
    expect(parseSpecialAwards('  ')).toEqual([]);
  });
});

describe('formatDisplayName', () => {
  it('shows first name and last initial', () => {
    expect(formatDisplayName('Jason Berman')).toBe('Jason B.');
    expect(formatDisplayName('Enrique Amaya Pimentel')).toBe('Enrique P.');
    expect(formatDisplayName("Benjamin In'tHout")).toBe('Benjamin I.');
    expect(formatDisplayName('michael mcKane')).toBe('michael M.');
  });

  it('shows just the first name when no last name is given', () => {
    expect(formatDisplayName('Cher')).toBe('Cher');
    expect(formatDisplayName('  Cher  ')).toBe('Cher');
  });
});

describe('slugify', () => {
  it('produces URL-safe file names', () => {
    expect(slugify('Jason B.')).toBe('jason-b');
    expect(slugify("Zoë O'Neil")).toBe('zoe-oneil');
  });
});

describe('photoNameTokens', () => {
  it('drops the event prefix and take numbers', () => {
    expect(photoNameTokens('GA2026_Michael_McK_02.jpg')).toEqual(['michael', 'mck']);
    expect(photoNameTokens('GA2026_Aaron_02.jpg')).toEqual(['aaron']);
    expect(photoNameTokens('GA2027 Jason-B.jpeg')).toEqual(['jason', 'b']);
  });
});

describe('findEntrantForPhoto', () => {
  const entrants = [
    { fullName: "Benjamin In'tHout" },
    { fullName: 'Benjamin Rizzuto' },
    { fullName: 'Matt Bohea' },
    { fullName: 'Matthew Milan' },
    { fullName: 'Rob Deakin' },
    { fullName: 'Robert Tilt' },
    { fullName: 'Enrique Amaya Pimentel' },
  ];

  it('matches shortened first names and partial surnames', () => {
    expect(findEntrantForPhoto('GA2026_Ben_I.jpg', entrants)).toEqual([entrants[0]]);
    expect(findEntrantForPhoto('GA2026_Ben_R.jpg', entrants)).toEqual([entrants[1]]);
    expect(findEntrantForPhoto('GA2026_Matt_M.jpg', entrants)).toEqual([entrants[3]]);
    expect(findEntrantForPhoto('GA2026_Matt_B_02.jpg', entrants)).toEqual([entrants[2]]);
  });

  it('matches a middle name as well as the last name', () => {
    expect(findEntrantForPhoto('GA2026_Enrique_A.jpg', entrants)).toEqual([entrants[6]]);
    expect(findEntrantForPhoto('GA2026_Enrique.jpg', entrants)).toEqual([entrants[6]]);
  });

  it('prefers an exact first-name match over a prefix match', () => {
    expect(findEntrantForPhoto('GA2026_Rob.jpg', entrants)).toEqual([entrants[4]]);
  });

  it('returns every candidate when ambiguous, and none when unknown', () => {
    expect(findEntrantForPhoto('GA2026_Ben.jpg', entrants)).toHaveLength(2);
    expect(findEntrantForPhoto('GA2026_Zed.jpg', entrants)).toEqual([]);
    expect(findEntrantForPhoto('GA2026_02.jpg', entrants)).toEqual([]);
  });
});

describe('buildEventEntries', () => {
  const rows = [
    row('1', 'Zara Young', 'GOLD'),
    row('2', 'Andrew Curtis', 'SILVER', 'PEOPLES CHAMPION'),
    row('3', 'Benjamin Rizzuto', 'CMND'),
    row('4', 'Glyn Dalton', 'DNE'),
    row('5', 'Craig Ramadge', ''),
  ];

  it('includes only entrants with a photo, sorted by display name', () => {
    const { entries } = buildEventEntries(rows, ['GA2026_Zara.jpg', 'GA2026_Ben.jpg', 'GA2026_Andrew.jpg', 'GA2026_Craig.jpg']);
    expect(entries.map(e => e.displayName)).toEqual(['Andrew C.', 'Benjamin R.', 'Craig R.', 'Zara Y.']);
    expect(entries.map(e => e.award)).toEqual(['silver', 'commended', null, 'gold']);
    expect(entries[0]).toMatchObject({ specialAwards: ["People's Champion"], photoFile: 'GA2026_Andrew.jpg', slug: 'andrew-c' });
  });

  it('applies display name overrides by entry ID', () => {
    const { entries } = buildEventEntries(rows, ['GA2026_Ben.jpg'], { displayNames: { '3': 'Ben R.' } });
    expect(entries[0]).toMatchObject({ displayName: 'Ben R.', slug: 'ben-r' });
  });

  it('warns about overrides for unknown entries and duplicate display names', () => {
    const { warnings } = buildEventEntries(
      [row('1', 'Sam Smith', 'GOLD'), row('2', 'Sam Stone', 'GOLD')],
      ['GA2026_Sam_Sm.jpg', 'GA2026_Sam_St.jpg'],
      { displayNames: { '99': 'Nobody' } },
    );
    expect(warnings).toHaveLength(2);
    expect(warnings.join()).toMatch(/entry 99/);
    expect(warnings.join()).toMatch(/"Sam S\."/);
  });

  it('gives duplicate display names distinct slugs', () => {
    const { entries } = buildEventEntries(
      [row('1', 'Sam Smith', 'GOLD'), row('2', 'Sam Stone', 'GOLD')],
      ['GA2026_Sam_Sm.jpg', 'GA2026_Sam_St.jpg'],
    );
    expect(new Set(entries.map(e => e.slug)).size).toBe(2);
  });

  it('uses explicit photo assignments from the config', () => {
    const { entries } = buildEventEntries(rows, ['IMG_1234.jpg'], { photos: { 'IMG_1234.jpg': '1' } });
    expect(entries[0]).toMatchObject({ displayName: 'Zara Y.', photoFile: 'IMG_1234.jpg' });
  });

  it('fails on unmatched, ambiguous, DNE or duplicate photos', () => {
    expect(() => buildEventEntries(rows, ['GA2026_Nobody.jpg'])).toThrow(/no matching entrant/);
    expect(() => buildEventEntries([...rows, row('6', 'Benjamin In\'tHout', 'GOLD')], ['GA2026_Ben.jpg'])).toThrow(/matches 3/);
    expect(() => buildEventEntries(rows, ['GA2026_Glyn.jpg'])).toThrow(/DNE/);
    expect(() => buildEventEntries(rows, ['GA2026_Zara.jpg', 'GA2026_Zara_02.jpg'])).toThrow(/only one is allowed/);
  });

  it('fails on unknown placings and missing or duplicate entry IDs', () => {
    expect(() => buildEventEntries([row('1', 'Zara Young', 'PLATINUM')], [])).toThrow(/Unknown placing/);
    expect(() => buildEventEntries([row('', 'Zara Young', 'GOLD')], [])).toThrow(/ENTRY ID/);
    expect(() => buildEventEntries([row('1', 'Zara Young'), row('1', 'Andrew Curtis')], [])).toThrow(/duplicate ENTRY ID/);
  });
});
