import { describe, expect, it } from 'vitest';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  cancelSwapMeetBooking,
  deleteSwapMeet,
  fetchSwapMeetBookings,
  markSwapMeetBookingInvoiced,
  markSwapMeetBookingPaid,
  saveSwapMeet,
  saveSwapMeetBooking,
  subscribeSwapMeetBookings,
  subscribeSwapMeets,
} from '../services/firebaseService';
import { waitFor } from './emulatorTestUtils';
import type { SwapMeet, SwapMeetBooking, User } from '../types';

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  email: 'user1@example.com',
  name: 'User One',
  isMember: false,
  ...overrides,
});

const makeSwapMeet = (overrides: Partial<SwapMeet> = {}): SwapMeet => ({
  id: 'swap-meet-1',
  date: '2026-06-01',
  stallCount: 30,
  bookedStallCount: 0,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('firebaseService swap meet (Firestore emulator)', () => {
  it('books stalls in a transaction and updates the swap meet state atomically', async () => {
    const user = makeUser({ id: 'user-1', name: 'Alice' });
    await saveSwapMeetBooking(user, 2, makeSwapMeet());

    const bookingSnap = await getDoc(doc(db, 'swapMeetBookings', 'swap-meet-1_user-1'));
    expect(bookingSnap.data()).toMatchObject({
      userId: 'user-1',
      stallCount: 2,
      amountOwed: 20,
      paid: false,
      status: 'pending',
    });

    const stateSnap = await getDoc(doc(db, 'swapMeetState', 'swap-meet-1'));
    expect(stateSnap.data()).toMatchObject({ bookedStallCount: 2 });
  });

  it('rejects a booking that would exceed remaining capacity', async () => {
    await saveSwapMeetBooking(makeUser({ id: 'user-1' }), 4, makeSwapMeet({ stallCount: 4 }));

    await expect(
      saveSwapMeetBooking(makeUser({ id: 'user-2' }), 1, makeSwapMeet({ stallCount: 4 }))
    ).rejects.toThrow(/half-tables are still available/);
  });

  it('marks a booking paid, invoiced, and then cancelled, adjusting booked stall counts', async () => {
    const admin = makeUser({ id: 'admin-1', name: 'Admin One', isAdmin: true });
    await saveSwapMeetBooking(makeUser({ id: 'user-1' }), 2, makeSwapMeet());
    const bookingId = 'swap-meet-1_user-1';

    await markSwapMeetBookingPaid(bookingId, admin);
    let bookingSnap = await getDoc(doc(db, 'swapMeetBookings', bookingId));
    expect(bookingSnap.data()).toMatchObject({ paid: true, status: 'confirmed', paidBy: 'admin-1' });

    await markSwapMeetBookingInvoiced(bookingId, admin);
    bookingSnap = await getDoc(doc(db, 'swapMeetBookings', bookingId));
    expect(bookingSnap.data()).toMatchObject({ invoiced: true, invoicedBy: 'admin-1' });

    await cancelSwapMeetBooking(bookingId, admin);
    bookingSnap = await getDoc(doc(db, 'swapMeetBookings', bookingId));
    expect(bookingSnap.data()).toMatchObject({ status: 'cancelled' });

    const stateSnap = await getDoc(doc(db, 'swapMeetState', 'swap-meet-1'));
    expect(stateSnap.data()).toMatchObject({ bookedStallCount: 0 });
  });

  it('fetches and subscribes to swap meet bookings sorted by user name', async () => {
    await saveSwapMeetBooking(makeUser({ id: 'user-1', name: 'Zed' }), 1, makeSwapMeet());
    await saveSwapMeetBooking(makeUser({ id: 'user-2', name: 'Alice' }), 1, makeSwapMeet());

    const fetched = await fetchSwapMeetBookings();
    expect(fetched.map((b) => b.userName)).toEqual(['Alice', 'Zed']);

    let latest: SwapMeetBooking[] | undefined;
    const unsubscribe = subscribeSwapMeetBookings((bookings) => { latest = bookings; });
    await waitFor(() => latest !== undefined && latest.length === 2);
    expect(latest!.map((b) => b.userName)).toEqual(['Alice', 'Zed']);
    unsubscribe();
  });

  it('schedules a swap meet and rejects a duplicate date', async () => {
    await saveSwapMeet({ id: 'swap-meet-1', date: '2026-06-01', stallCount: 30 });

    await expect(
      saveSwapMeet({ id: 'swap-meet-2', date: '2026-06-01', stallCount: 20 })
    ).rejects.toThrow(/already scheduled/);

    let latest: SwapMeet[] | undefined;
    const unsubscribe = subscribeSwapMeets((meets) => { latest = meets; });
    await waitFor(() => latest !== undefined && latest.length === 1);
    expect(latest![0]).toMatchObject({ id: 'swap-meet-1', date: '2026-06-01' });
    unsubscribe();
  });

  it('deletes a swap meet with no active bookings but refuses one with active bookings', async () => {
    await saveSwapMeet({ id: 'swap-meet-1', date: '2026-06-01', stallCount: 30 });
    await saveSwapMeetBooking(makeUser({ id: 'user-1' }), 2, makeSwapMeet());

    await expect(deleteSwapMeet('swap-meet-1')).rejects.toThrow(/active bookings/);

    await cancelSwapMeetBooking('swap-meet-1_user-1', makeUser({ id: 'admin-1', isAdmin: true }));
    await deleteSwapMeet('swap-meet-1');

    const stateSnap = await getDoc(doc(db, 'swapMeetState', 'swap-meet-1'));
    expect(stateSnap.exists()).toBe(false);
  });
});
