import { describe, expect, it } from 'vitest';
import { cancelBooking, fetchBookings, saveBooking, subscribeBookings } from '../services/firebaseService';
import { waitFor } from './emulatorTestUtils';
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

describe('firebaseService bookings (Firestore emulator)', () => {
  it('saves a booking and it is retrievable via fetchBookings', async () => {
    await saveBooking(makeBooking());

    const bookings = await fetchBookings();
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({ id: 'booking-1', tableId: 'L1', gameSystem: 'Warhammer 40k' });
  });

  it('allows two bookings on the same date for different tables', async () => {
    await saveBooking(makeBooking({ id: 'booking-1', tableId: 'L1' }));
    await saveBooking(makeBooking({ id: 'booking-2', tableId: 'L2' }));

    const bookings = await fetchBookings();
    expect(bookings.map((b) => b.id).sort()).toEqual(['booking-1', 'booking-2']);
  });

  it('rejects a booking that conflicts with an existing active booking on the same table', async () => {
    await saveBooking(makeBooking({ id: 'booking-1', memberName: 'First User' }));

    await expect(
      saveBooking(makeBooking({ id: 'booking-2', memberName: 'Second User' }))
    ).rejects.toMatchObject({
      name: 'BookingConflictError',
      message: expect.stringContaining('That table has just been booked by First User.'),
    });

    const bookings = await fetchBookings();
    expect(bookings.map((b) => b.id)).toEqual(['booking-1']);
  });

  it('cancels a booking', async () => {
    await saveBooking(makeBooking());
    await cancelBooking('booking-1', 'admin-1');

    const [booking] = await fetchBookings();
    expect(booking.status).toBe('cancelled');
    expect(booking.cancelledBy).toBe('admin-1');
  });

  it('subscribes to live booking updates', async () => {
    let latest: Booking[] | undefined;
    const unsubscribe = subscribeBookings((bookings) => { latest = bookings; });

    await saveBooking(makeBooking());
    await waitFor(() => latest !== undefined && latest.length === 1);

    expect(latest![0].id).toBe('booking-1');
    unsubscribe();
  });
});
