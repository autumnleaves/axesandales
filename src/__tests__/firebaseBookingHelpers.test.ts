import { describe, expect, it } from 'vitest';
import { getBookingSaveConflicts, mapBookingSnapshotData } from '../services/firebaseBookingHelpers';
import type { Booking } from '../types';

const makeBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-1',
  date: '2026-03-10',
  tableId: 'L1',
  terrainBoxId: null,
  secondaryTerrainId: null,
  memberName: 'Test User',
  memberId: 'user-1',
  gameSystem: 'Warhammer 40k',
  playerCount: 2,
  taggedPlayerIds: [],
  markedUnavailable: false,
  timestamp: 1000,
  status: 'active',
  ...overrides,
});

describe('mapBookingSnapshotData', () => {
  it('normalizes legacy Firestore bookings', () => {
    const booking = mapBookingSnapshotData('booking-1', {
      date: '2026-03-10',
      tableId: 'L1',
      memberName: 'Test User',
      memberId: 'user-1',
      gameSystem: 'Warhammer 40k',
      playerCount: 2,
      timestamp: 1000,
      status: 'active',
    });

    expect(booking).toMatchObject({
      id: 'booking-1',
      terrainBoxId: null,
      secondaryTerrainId: null,
      taggedPlayerIds: [],
      markedUnavailable: false,
    });
  });

  it('preserves marked unavailable bookings', () => {
    const booking = mapBookingSnapshotData('booking-2', {
      date: '2026-03-10',
      tableId: 'L2',
      memberName: 'Committee',
      memberId: 'admin-1',
      gameSystem: 'Unavailable',
      playerCount: 0,
      taggedPlayerIds: [],
      markedUnavailable: true,
      timestamp: 1000,
      status: 'active',
    });

    expect(booking.markedUnavailable).toBe(true);
  });
});

describe('getBookingSaveConflicts', () => {
  it('returns no conflicts for the same booking id', () => {
    const booking = makeBooking({ id: 'booking-1' });
    const conflicts = getBookingSaveConflicts(booking, [makeBooking({ id: 'booking-1' })]);

    expect(conflicts).toEqual([]);
  });

  it('detects table conflicts', () => {
    const booking = makeBooking({ id: 'booking-2', tableId: 'L1' });
    const conflicts = getBookingSaveConflicts(booking, [makeBooking({ id: 'other', tableId: 'L1', memberName: 'Other User' })]);

    expect(conflicts).toEqual(['That table has just been booked by Other User.']);
  });

  it('detects terrain conflicts', () => {
    const booking = makeBooking({ id: 'booking-2', tableId: 'L2', terrainBoxId: 'terrain-1' });
    const conflicts = getBookingSaveConflicts(booking, [makeBooking({ id: 'other', tableId: 'L1', terrainBoxId: 'terrain-1', memberName: 'Other User' })]);

    expect(conflicts).toEqual(['That terrain set has just been reserved by Other User.']);
  });

  it('detects fully booked secondary terrain sets', () => {
    const booking = makeBooking({ id: 'booking-2', tableId: 'L2', secondaryTerrainId: '40K-FOOTPRINTS' });
    const conflicts = getBookingSaveConflicts(booking, [
      makeBooking({ id: 'other-1', tableId: 'L3', secondaryTerrainId: '40K-FOOTPRINTS' }),
      makeBooking({ id: 'other-2', tableId: 'L4', secondaryTerrainId: '40K-FOOTPRINTS' }),
      makeBooking({ id: 'other-3', tableId: 'L5', secondaryTerrainId: '40K-FOOTPRINTS' }),
      makeBooking({ id: 'other-4', tableId: 'L6', secondaryTerrainId: '40K-FOOTPRINTS' }),
      makeBooking({ id: 'other-5', tableId: 'L7', secondaryTerrainId: '40K-FOOTPRINTS' }),
    ]);

    expect(conflicts).toContain('That terrain set is fully booked for this date.');
  });

  it('ignores cancelled bookings when checking conflicts', () => {
    const booking = makeBooking({ id: 'booking-2', tableId: 'L1', terrainBoxId: 'terrain-1' });
    const conflicts = getBookingSaveConflicts(booking, [
      makeBooking({ id: 'other', tableId: 'L1', terrainBoxId: 'terrain-1', status: 'cancelled' }),
    ]);

    expect(conflicts).toEqual([]);
  });

  it('counts primary and secondary usage of the same box against one shared capacity', () => {
    // 40K-FOOTPRINTS has maxBookingsPerNight: 5 — 1 primary + 4 secondary usages already fill it.
    const booking = makeBooking({ id: 'booking-2', tableId: 'L2', secondaryTerrainId: '40K-FOOTPRINTS' });
    const conflicts = getBookingSaveConflicts(booking, [
      makeBooking({ id: 'as-primary', tableId: 'L3', terrainBoxId: '40K-FOOTPRINTS' }),
      makeBooking({ id: 'as-secondary-1', tableId: 'L4', secondaryTerrainId: '40K-FOOTPRINTS' }),
      makeBooking({ id: 'as-secondary-2', tableId: 'L5', secondaryTerrainId: '40K-FOOTPRINTS' }),
      makeBooking({ id: 'as-secondary-3', tableId: 'L6', secondaryTerrainId: '40K-FOOTPRINTS' }),
      makeBooking({ id: 'as-secondary-4', tableId: 'L7', secondaryTerrainId: '40K-FOOTPRINTS' }),
    ]);

    expect(conflicts).toContain('That terrain set is fully booked for this date.');
  });
});
