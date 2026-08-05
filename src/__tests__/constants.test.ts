import { describe, it, expect, vi, afterEach } from 'vitest';
import { getUpcomingTuesdays, getSelectableDates, getBookableDates } from '../constants';
import { Booking } from '../types';

// ─── Helper ─────────────────────────────────────────────

const makeBooking = (date: string, status: 'active' | 'cancelled' = 'active'): Booking => ({
  id: `booking-${date}`,
  date,
  tableId: 'L1',
  terrainBoxId: null,
  memberName: 'Test',
  memberId: 'user-1',
  gameSystem: 'Test',
  playerCount: 2,
  taggedPlayerIds: [],
  timestamp: 1000,
  status,
});

// ─── getUpcomingTuesdays ────────────────────────────────

describe('getUpcomingTuesdays', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns exactly 8 dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const tuesdays = getUpcomingTuesdays();
    expect(tuesdays).toHaveLength(8);
  });

  it('returns dates that are all Tuesdays', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const tuesdays = getUpcomingTuesdays();
    for (const dateStr of tuesdays) {
      const day = new Date(dateStr + 'T00:00:00Z').getUTCDay();
      expect(day, `${dateStr} should be Tuesday (day 2) but was day ${day}`).toBe(2);
    }
  });

  it('returns dates in ascending order', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const tuesdays = getUpcomingTuesdays();
    for (let i = 1; i < tuesdays.length; i++) {
      expect(tuesdays[i] > tuesdays[i - 1]).toBe(true);
    }
  });

  it('each date is exactly 7 days apart', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const tuesdays = getUpcomingTuesdays();
    for (let i = 1; i < tuesdays.length; i++) {
      const prev = new Date(tuesdays[i - 1] + 'T00:00:00Z').getTime();
      const curr = new Date(tuesdays[i] + 'T00:00:00Z').getTime();
      expect(curr - prev).toBe(7 * 24 * 60 * 60 * 1000);
    }
  });

  it('starts from the next Tuesday when called on a non-Tuesday', () => {
    vi.useFakeTimers();
    // Wednesday March 4, 2026
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const tuesdays = getUpcomingTuesdays();
    expect(tuesdays[0]).toBe('2026-03-10');
  });

  it('includes today when called on a Tuesday', () => {
    vi.useFakeTimers();
    // Tuesday March 10, 2026
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));
    const tuesdays = getUpcomingTuesdays();
    expect(tuesdays[0]).toBe('2026-03-10');
  });

  it('returns YYYY-MM-DD formatted strings', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const tuesdays = getUpcomingTuesdays();
    for (const dateStr of tuesdays) {
      expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('uses local date rather than UTC date for morning AEST times', () => {
    vi.useFakeTimers();
    // AEST is UTC+10. Before 11am local time on 2026-03-04, UTC is still 2026-03-03.
    vi.setSystemTime(new Date('2026-03-04T01:00:00Z'));
    const tuesdays = getUpcomingTuesdays();
    expect(tuesdays[0]).toBe('2026-03-10');
  });
});

// ─── getSelectableDates ─────────────────────────────────

describe('getSelectableDates', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('includes upcoming Tuesdays', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const result = getSelectableDates([], [], []);
    const values = result.map(d => d.value);
    expect(values).toContain('2026-03-10');
  });

  it('includes special event dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const result = getSelectableDates(['2026-03-15'], [], []);
    const values = result.map(d => d.value);
    expect(values).toContain('2026-03-15');
  });

  it('includes dates from existing bookings', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const booking = makeBooking('2026-03-12');
    const result = getSelectableDates([], [booking], []);
    const values = result.map(d => d.value);
    expect(values).toContain('2026-03-12');
  });

  it('marks cancelled dates with isCancelled: true', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const result = getSelectableDates([], [], ['2026-03-10']);
    const march10 = result.find(d => d.value === '2026-03-10');
    expect(march10?.isCancelled).toBe(true);
  });

  it('marks non-cancelled dates with isCancelled: false', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const result = getSelectableDates([], [], []);
    const march10 = result.find(d => d.value === '2026-03-10');
    expect(march10?.isCancelled).toBe(false);
  });

  it('excludes past dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));
    const result = getSelectableDates([], [], []);
    const values = result.map(d => d.value);
    // March 3 is a past Tuesday
    expect(values).not.toContain('2026-03-03');
  });

  it('uses local date rather than UTC date for morning AEST times', () => {
    vi.useFakeTimers();
    // 2026-03-10 06:00 AEST is still 2026-03-09 20:00 UTC, but local date should be 2026-03-10.
    vi.setSystemTime(new Date('2026-03-09T20:00:00Z'));
    const result = getSelectableDates([], [], []);
    expect(result[0]?.value).toBe('2026-03-10');
  });
});

  it('returns dates in ascending order', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const result = getSelectableDates(['2026-03-22', '2026-03-08'], [], []);
    const values = result.map(d => d.value);
    for (let i = 1; i < values.length; i++) {
      expect(values[i] > values[i - 1]).toBe(true);
    }
  });

  it('deduplicates dates from multiple sources', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    // March 10 is both a Tuesday and a special event
    const booking = makeBooking('2026-03-10');
    const result = getSelectableDates(['2026-03-10'], [booking], []);
    const march10Count = result.filter(d => d.value === '2026-03-10').length;
    expect(march10Count).toBe(1);
  });

// ─── getBookableDates ───────────────────────────────────

describe('getBookableDates', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('includes upcoming Tuesdays', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const result = getBookableDates([], []);
    expect(result).toContain('2026-03-10');
  });

  it('includes special event dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const result = getBookableDates(['2026-03-15'], []);
    expect(result).toContain('2026-03-15');
  });

  it('excludes cancelled dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const result = getBookableDates([], ['2026-03-10']);
    expect(result).not.toContain('2026-03-10');
  });

  it('excludes past dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));
    const result = getBookableDates([], []);
    expect(result).not.toContain('2026-03-03');
  });

  it('returns dates in ascending order', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const result = getBookableDates(['2026-03-22', '2026-03-08'], []);
    for (let i = 1; i < result.length; i++) {
      expect(result[i] > result[i - 1]).toBe(true);
    }
  });

  it('deduplicates Tuesdays that are also special events', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    const result = getBookableDates(['2026-03-10'], []);
    const count = result.filter(d => d === '2026-03-10').length;
    expect(count).toBe(1);
  });

  it('does not include existing booking dates (unlike getSelectableDates)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T12:00:00Z'));
    // getBookableDates doesn't take bookings — a non-Tuesday, non-special date won't appear
    const result = getBookableDates([], []);
    expect(result).not.toContain('2026-03-12'); // a Thursday
  });
});
