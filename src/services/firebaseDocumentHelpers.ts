export const compareFirestoreDocumentIds = (leftId: string, rightId: string): number => {
  const numA = parseInt(leftId.replace(/\D/g, ''), 10) || 0;
  const numB = parseInt(rightId.replace(/\D/g, ''), 10) || 0;
  const prefixA = leftId.replace(/\d/g, '');
  const prefixB = rightId.replace(/\d/g, '');
  if (prefixA !== prefixB) return prefixA.localeCompare(prefixB);
  return numA - numB;
};

export const sortFirestoreDocumentsById = <T extends { id: string }>(docs: T[]): T[] => {
  return [...docs].sort((left, right) => compareFirestoreDocumentIds(left.id, right.id));
};

// Sorts by an explicit `order` field so admin-configured ordering (e.g. drag-and-drop
// reordering) survives Firestore's unordered collection storage. Docs without an `order`
// value sort after ones that have it, falling back to id comparison as a tiebreaker.
export const sortByOrder = <T extends { id: string; order?: number }>(docs: T[]): T[] => {
  return [...docs].sort((left, right) => {
    const hasLeft = typeof left.order === 'number';
    const hasRight = typeof right.order === 'number';
    if (hasLeft && hasRight && left.order !== right.order) return left.order! - right.order!;
    if (hasLeft !== hasRight) return hasLeft ? -1 : 1;
    return compareFirestoreDocumentIds(left.id, right.id);
  });
};

export const slugifyFirestoreId = (name: string): string => {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
};
