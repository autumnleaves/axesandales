import { INITIAL_TERRAIN_BOXES } from '../constants';
import type { Booking } from '../types';

export const mapBookingSnapshotData = (id: string, data: Record<string, unknown>): Booking => {
  const bookingData = data as Partial<Booking>;
  return {
    ...(bookingData as Booking),
    id,
    terrainBoxId: bookingData.terrainBoxId ?? null,
    secondaryTerrainId: bookingData.secondaryTerrainId ?? null,
    taggedPlayerIds: bookingData.taggedPlayerIds ?? [],
    markedUnavailable: bookingData.markedUnavailable ?? false,
  };
};

export const getBookingSaveConflicts = (
  booking: Booking,
  activeBookings: Booking[]
): string[] => {
  const conflicts: string[] = [];
  const tableConflict = activeBookings.find(
    existing =>
      existing.id !== booking.id &&
      existing.date === booking.date &&
      existing.status === 'active' &&
      existing.tableId === booking.tableId
  );
  if (tableConflict) {
    const name = tableConflict.memberName || 'another member';
    conflicts.push(`That table has just been booked by ${name}.`);
  }

  if (booking.terrainBoxId) {
    const conflict = findTerrainCapacityConflict(booking.terrainBoxId, booking, activeBookings);
    if (conflict) conflicts.push(conflict);
  }

  if (booking.secondaryTerrainId) {
    const conflict = findTerrainCapacityConflict(booking.secondaryTerrainId, booking, activeBookings);
    if (conflict) conflicts.push(conflict);
  }

  return conflicts;
};

// A terrain box may be booked as one booking's primary terrain and another's
// secondary/extra item, so both slots draw from the same box's capacity.
const findTerrainCapacityConflict = (
  terrainBoxId: string,
  booking: Booking,
  activeBookings: Booking[]
): string | undefined => {
  const box = INITIAL_TERRAIN_BOXES.find(b => b.id === terrainBoxId);
  const capacity = box?.maxBookingsPerNight ?? 1;

  const usingBookings = activeBookings.filter(
    existing =>
      existing.id !== booking.id &&
      existing.date === booking.date &&
      existing.status === 'active' &&
      (existing.terrainBoxId === terrainBoxId || existing.secondaryTerrainId === terrainBoxId)
  );

  if (usingBookings.length < capacity) return undefined;

  if (capacity > 1) {
    return 'That terrain set is fully booked for this date.';
  }
  const name = usingBookings[0].memberName || 'another member';
  return `That terrain set has just been reserved by ${name}.`;
};
