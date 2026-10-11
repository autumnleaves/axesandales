import { describe, it, expect } from 'vitest';
import type { GalleryAward, GalleryEntry } from '../types';
import { countGalleryAwards, filterGalleryEntries, sortGalleryEntries } from '../utils/galleryHelpers';

const entry = (name: string, award: GalleryAward | null): GalleryEntry => ({
  id: name.toLowerCase(),
  name,
  award,
  specialAwards: [],
  image: { src: '', width: 2, height: 3 },
  thumbnail: { src: '', width: 2, height: 3 },
});

const entries = [
  entry('Zara Y.', 'gold'),
  entry('aaron M.', 'gold'),
  entry('Matt B.', 'silver'),
  entry('Craig R.', null),
  entry('Eric V.', 'commended'),
];

describe('sortGalleryEntries', () => {
  it('sorts alphabetically, ignoring case, without mutating the input', () => {
    const original = [...entries];
    expect(sortGalleryEntries(entries).map(e => e.name)).toEqual(['aaron M.', 'Craig R.', 'Eric V.', 'Matt B.', 'Zara Y.']);
    expect(entries).toEqual(original);
  });
});

describe('filterGalleryEntries', () => {
  it('returns everything for "all", including unplaced entries', () => {
    expect(filterGalleryEntries(entries, 'all')).toHaveLength(5);
  });

  it('filters by award and keeps alphabetical order', () => {
    expect(filterGalleryEntries(entries, 'gold').map(e => e.name)).toEqual(['aaron M.', 'Zara Y.']);
    expect(filterGalleryEntries(entries, 'bronze')).toEqual([]);
  });
});

describe('countGalleryAwards', () => {
  it('counts entries per award', () => {
    expect(countGalleryAwards(entries)).toEqual({ all: 5, gold: 2, silver: 1, bronze: 0, commended: 1 });
  });
});
