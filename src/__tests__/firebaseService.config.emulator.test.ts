import { describe, expect, it } from 'vitest';
import {
  saveCancelledDatesToDb,
  saveShowSwapMeetTabToDb,
  saveSpecialEventDatesToDb,
  subscribeScheduleConfig,
  subscribeSiteConfig,
} from '../services/firebaseService';
import { waitFor } from './emulatorTestUtils';

describe('firebaseService schedule & site config (Firestore emulator)', () => {
  it('defaults to empty cancelled/special-event dates when the config doc does not exist', async () => {
    let cancelled: string[] | undefined;
    let specialEvents: string[] | undefined;
    const unsubscribe = subscribeScheduleConfig((c, s) => { cancelled = c; specialEvents = s; });
    await waitFor(() => cancelled !== undefined);

    expect(cancelled).toEqual([]);
    expect(specialEvents).toEqual([]);
    unsubscribe();
  });

  it('saves cancelled dates then special event dates without clobbering each other', async () => {
    await saveCancelledDatesToDb(['2026-04-01']);
    await saveSpecialEventDatesToDb(['2026-05-01']);

    let cancelled: string[] | undefined;
    let specialEvents: string[] | undefined;
    const unsubscribe = subscribeScheduleConfig((c, s) => { cancelled = c; specialEvents = s; });
    await waitFor(() => cancelled !== undefined && cancelled.length === 1 && specialEvents !== undefined && specialEvents.length === 1);

    expect(cancelled).toEqual(['2026-04-01']);
    expect(specialEvents).toEqual(['2026-05-01']);
    unsubscribe();
  });

  it('defaults showSwapMeetTab to false when the site config doc does not exist', async () => {
    let showSwapMeetTab: boolean | undefined;
    const unsubscribe = subscribeSiteConfig((value) => { showSwapMeetTab = value; });
    await waitFor(() => showSwapMeetTab !== undefined);

    expect(showSwapMeetTab).toBe(false);
    unsubscribe();
  });

  it('saves the showSwapMeetTab flag', async () => {
    await saveShowSwapMeetTabToDb(true);

    let showSwapMeetTab: boolean | undefined;
    const unsubscribe = subscribeSiteConfig((value) => { showSwapMeetTab = value; });
    await waitFor(() => showSwapMeetTab === true);

    expect(showSwapMeetTab).toBe(true);
    unsubscribe();
  });
});
