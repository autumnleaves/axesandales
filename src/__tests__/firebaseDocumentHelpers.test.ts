import { describe, expect, it } from 'vitest';
import {
  compareFirestoreDocumentIds,
  slugifyFirestoreId,
  sortByOrder,
  sortFirestoreDocumentsById,
} from '../services/firebaseDocumentHelpers';

describe('firebaseDocumentHelpers', () => {
  it('slugifies firestore ids consistently', () => {
    expect(slugifyFirestoreId('Game Systems!')).toBe('game-systems');
    expect(slugifyFirestoreId('  Terrain Box 13  ')).toBe('terrain-box-13');
  });

  it('sorts firestore document ids by prefix and numeric suffix', () => {
    expect(compareFirestoreDocumentIds('L2', 'L10')).toBeLessThan(0);
    expect(compareFirestoreDocumentIds('terrain-2', 'table-1')).toBeGreaterThan(0);

    const docs = sortFirestoreDocumentsById([
      { id: 'L10' },
      { id: 'L2' },
      { id: 'S1' },
      { id: 'L1' },
    ]);

    expect(docs.map(doc => doc.id)).toEqual(['L1', 'L2', 'L10', 'S1']);
  });

  it('sorts by explicit order, overriding id order, so drag-and-drop reordering persists', () => {
    const docs = sortByOrder([
      { id: 'SCIFI-1', order: 2 },
      { id: 'HIST-1', order: 0 },
      { id: 'AOS-1', order: 1 },
    ]);

    expect(docs.map(doc => doc.id)).toEqual(['HIST-1', 'AOS-1', 'SCIFI-1']);
  });

  it('falls back to id order for docs missing an order value, and pushes them after ordered ones', () => {
    const docs = sortByOrder([
      { id: 'S1' },
      { id: 'L2', order: 0 },
      { id: 'L1' },
    ]);

    expect(docs.map(doc => doc.id)).toEqual(['L2', 'L1', 'S1']);
  });
});
