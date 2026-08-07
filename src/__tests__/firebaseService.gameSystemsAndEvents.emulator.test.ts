import { describe, expect, it } from 'vitest';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  addEventTag,
  addGameSystem,
  deleteEvent,
  deleteEventTag,
  deleteGameSystem,
  fetchGameSystems,
  renameGameSystem,
  saveEvent,
  subscribeEventTags,
  subscribeEvents,
  subscribeGameSystems,
} from '../services/firebaseService';
import { waitFor } from './emulatorTestUtils';
import type { ClubEvent } from '../types';

describe('firebaseService game systems (Firestore emulator)', () => {
  it('adds a game system once, ignoring a duplicate add', async () => {
    await addGameSystem('Warhammer 40k');
    await addGameSystem('Warhammer 40k');

    const names = await fetchGameSystems();
    expect(names).toEqual(['Warhammer 40k']);

    let latest: string[] | undefined;
    const unsubscribe = subscribeGameSystems((systems) => { latest = systems; });
    await waitFor(() => latest !== undefined && latest.length === 1);
    expect(latest).toEqual(['Warhammer 40k']);
    unsubscribe();
  });

  it('renames a game system, updating both the metadata doc and matching bookings', async () => {
    await addGameSystem('Old Hammer');
    await setDoc(doc(db, 'bookings', 'booking-1'), { gameSystem: 'Old Hammer' });
    await setDoc(doc(db, 'bookings', 'booking-2'), { gameSystem: 'Other Game' });

    await renameGameSystem('Old Hammer', 'New Hammer');

    const names = await fetchGameSystems();
    expect(names).toEqual(['New Hammer']);

    const renamedBooking = await getDoc(doc(db, 'bookings', 'booking-1'));
    const untouchedBooking = await getDoc(doc(db, 'bookings', 'booking-2'));
    expect(renamedBooking.data()?.gameSystem).toBe('New Hammer');
    expect(untouchedBooking.data()?.gameSystem).toBe('Other Game');
  });

  it('deletes a game system', async () => {
    await addGameSystem('Temporary Game');
    await deleteGameSystem('Temporary Game');

    const names = await fetchGameSystems();
    expect(names).toEqual([]);
  });
});

describe('firebaseService events (Firestore emulator)', () => {
  const makeEvent = (overrides: Partial<ClubEvent> = {}): ClubEvent => ({
    id: 'event-1',
    title: 'Painting Night',
    description: 'Bring your models',
    startDate: '2026-07-01',
    endDate: '2026-07-01',
    tags: ['Social'],
    createdBy: 'admin-1',
    createdByName: 'Admin One',
    createdAt: Date.now(),
    ...overrides,
  });

  it('saves and subscribes to events ordered by start date', async () => {
    await saveEvent(makeEvent({ id: 'event-2', startDate: '2026-08-01' }));
    await saveEvent(makeEvent({ id: 'event-1', startDate: '2026-07-01' }));

    let latest: ClubEvent[] | undefined;
    const unsubscribe = subscribeEvents((events) => { latest = events; });
    await waitFor(() => latest !== undefined && latest.length === 2);
    expect(latest!.map((e) => e.id)).toEqual(['event-1', 'event-2']);
    unsubscribe();
  });

  it('deletes an event', async () => {
    await saveEvent(makeEvent());
    await deleteEvent('event-1');

    let latest: ClubEvent[] | undefined;
    const unsubscribe = subscribeEvents((events) => { latest = events; });
    await waitFor(() => latest !== undefined);
    expect(latest).toEqual([]);
    unsubscribe();
  });

  it('adds and deletes event tags', async () => {
    await addEventTag('Tournament');
    await addEventTag('Tournament');

    let latest: string[] | undefined;
    const unsubscribe = subscribeEventTags((tags) => { latest = tags; });
    await waitFor(() => latest !== undefined && latest.length === 1);
    expect(latest).toEqual(['Tournament']);

    await deleteEventTag('Tournament');
    await waitFor(() => latest !== undefined && latest.length === 0);
    unsubscribe();
  });
});
