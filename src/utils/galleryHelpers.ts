import type { GalleryAward, GalleryEntry } from '../types';

export type GalleryAwardFilter = GalleryAward | 'all';

export const GALLERY_AWARDS: GalleryAward[] = ['gold', 'silver', 'bronze', 'commended'];

export const GALLERY_AWARD_LABELS: Record<GalleryAward, string> = {
  gold: 'Gold',
  silver: 'Silver',
  bronze: 'Bronze',
  commended: 'Commended',
};

/** Alphabetical, with unnamed entries last in their original order. */
export const sortGalleryEntries = (entries: GalleryEntry[]): GalleryEntry[] =>
  [...entries].sort((a, b) => {
    if (a.name === null || b.name === null) return (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0);
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  });

/** Entries matching the award filter, in alphabetical order. */
export const filterGalleryEntries = (entries: GalleryEntry[], filter: GalleryAwardFilter): GalleryEntry[] =>
  sortGalleryEntries(filter === 'all' ? entries : entries.filter(entry => entry.award === filter));

export const countGalleryAwards = (entries: GalleryEntry[]): Record<GalleryAwardFilter, number> => {
  const counts: Record<GalleryAwardFilter, number> = { all: entries.length, gold: 0, silver: 0, bronze: 0, commended: 0 };
  for (const entry of entries) {
    if (entry.award) counts[entry.award]++;
  }
  return counts;
};

/** False for events without placings (e.g. ABR), which don't get the award filter. */
export const hasGalleryAwards = (entries: GalleryEntry[]): boolean => entries.some(entry => entry.award !== null);

export const galleryAssetUrl = (src: string): string => `${import.meta.env.BASE_URL}${src}`;
