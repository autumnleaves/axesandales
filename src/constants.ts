import { Booking } from './types';
import { Table, TableSize, TerrainBox, TerrainCategory } from './types';

export const DISCORD_INVITE_URL = 'https://discord.gg/gSQgpPVNKy';

// Inventory is now managed in localStorage. These are the default first-time values.
export const INITIAL_TABLES: Table[] = [
  ...Array.from({ length: 16 }, (_, i) => ({
    id: `L${i + 1}`,
    name: `Large Table ${i + 1}`,
    size: TableSize.LARGE
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `S${i + 1}`,
    name: `Small Table ${i + 1}`,
    size: TableSize.SMALL
  }))
];

const BASE_IMG = '/images/terrain';

export const INITIAL_TERRAIN_BOXES: TerrainBox[] = [
  { id: 'SCIFI-1', category: TerrainCategory.SCIFI, name: 'Sci-Fi Box 1', imageUrl: `${BASE_IMG}/SciFi1.jpg` },
  { id: 'SCIFI-2', category: TerrainCategory.SCIFI, name: 'Sci-Fi Box 2', imageUrl: `${BASE_IMG}/SciFi2.jpg` },
  { id: 'SCIFI-3', category: TerrainCategory.SCIFI, name: 'Sci-Fi Box 3', imageUrl: `${BASE_IMG}/SciFi3.jpg` },
  { id: 'SCIFI-4', category: TerrainCategory.SCIFI, name: 'Sci-Fi Box 4', imageUrl: `${BASE_IMG}/Scifi4.jpg` },
  { id: 'SCIFI-5', category: TerrainCategory.SCIFI, name: 'Sci-Fi Box 5', imageUrl: `${BASE_IMG}/SciFi5.jpg` },
  { id: 'SCIFI-6', category: TerrainCategory.SCIFI, name: 'Sci-Fi Box 6', imageUrl: `${BASE_IMG}/SciFi6.jpg` },
  { id: 'SCIFI-7', category: TerrainCategory.SCIFI, name: 'Sci-Fi Box 7', imageUrl: `${BASE_IMG}/SciFi7.jpg` },
  { id: 'SCIFI-8', category: TerrainCategory.SCIFI, name: 'Sci-Fi Box 8', imageUrl: `${BASE_IMG}/SciFi8.jpg` },
  { id: 'SCIFI-9', category: TerrainCategory.SCIFI, name: 'Sci-Fi Box 9', imageUrl: `${BASE_IMG}/SciFi9.jpg` },
  { id: 'SCIFI-10', category: TerrainCategory.SCIFI, name: 'Sci-Fi Box 10', imageUrl: `${BASE_IMG}/SciFi10.jpg` },
  { id: 'HIST-1', category: TerrainCategory.HISTORICAL, name: 'Historical Box 1', imageUrl: `${BASE_IMG}/Historical1.jpg` },
  { id: 'HIST-2', category: TerrainCategory.HISTORICAL, name: 'Historical Box 2', imageUrl: `${BASE_IMG}/Historical2.jpg` },
  { id: 'HIST-3', category: TerrainCategory.HISTORICAL, name: 'Historical Box 3', imageUrl: `${BASE_IMG}/Historical3.jpg` },
  { id: 'HIST-4', category: TerrainCategory.HISTORICAL, name: 'Historical Box 4', imageUrl: `${BASE_IMG}/Historical4.jpg` },
  { id: 'FANT-1', category: TerrainCategory.FANTASY, name: 'Fantasy Box 1', imageUrl: `${BASE_IMG}/Fantasy1.jpg` },
  { id: 'FANT-2', category: TerrainCategory.FANTASY, name: 'Fantasy Box 2', imageUrl: `${BASE_IMG}/Fantasy2.jpg` },
  { id: 'AOS-1', category: TerrainCategory.AOS, name: 'AoS Box 1', imageUrl: `${BASE_IMG}/AoS_01.jpg` },
  { id: 'AOS-2', category: TerrainCategory.AOS, name: 'AoS Box 2', imageUrl: `${BASE_IMG}/AoS_02.jpg` },
  { id: '40K-1', category: TerrainCategory.WARHAMMER_40K, name: '40k Comp Box 1', imageUrl: `${BASE_IMG}/40kComp1.jpg` },
  { id: '40K-2', category: TerrainCategory.WARHAMMER_40K, name: '40k Comp Box 2', imageUrl: `${BASE_IMG}/40kComp2.jpg` },
  { id: '40K-FOOTPRINTS', category: TerrainCategory.WARHAMMER_40K, name: '40k Footprints', imageUrl: `${BASE_IMG}/40k_footprint.jpg`, maxBookingsPerNight: 5, allowAsSecondItem: true },
  { id: 'HILLS-1', category: TerrainCategory.FANTASY, name: 'Hills Box 1', imageUrl: `${BASE_IMG}/Hills.jpg` },
  { id: 'POSTAPOC-1', category: TerrainCategory.SCIFI, name: 'Post-Apoc Box 1', imageUrl: `${BASE_IMG}/PostApoc1.jpg` },
];

const getLocalIsoDateString = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getUpcomingTuesdays = (): string[] => {
  const dates: string[] = [];
  const local = new Date();
  let d = new Date(local.getFullYear(), local.getMonth(), local.getDate());

  // hacky workaround - we want to open up the new website from march 2026
  if (d < new Date('2026-03-01')) {
    d = new Date(2026, 2, 3); // March 3, 2026 is the first Tuesday after March 1. Month is 0-indexed
  }

  while (d.getDay() !== 2) {
    d.setDate(d.getDate() + 1);
  }
  for (let i = 0; i < 8; i++) {
    dates.push(getLocalIsoDateString(d));
    d.setDate(d.getDate() + 7);
  }
  return dates;
};

/**
 * Get dates available for new bookings: upcoming Tuesdays + special event dates,
 * excluding cancelled dates and past dates.
 */
export const getBookableDates = (specialEventDates: string[], cancelledDates: string[]): string[] => {
    const today = getLocalIsoDateString();

    return [...new Set([...getUpcomingTuesdays(), ...specialEventDates])]
      .filter(d => !cancelledDates.includes(d) && d >= today)
      .sort();
};

export const getSelectableDates = (specialEventDates: string[], allBookings: Booking[], cancelledDates: string[]): {value: string, isCancelled: boolean}[] => {
    const tuesdays = new Set(getUpcomingTuesdays());
    const specialDays = new Set(specialEventDates);
    const bookingDays = new Set(allBookings.map(b => b.date));

    const combinedDates = Array.from(new Set([...tuesdays, ...specialDays, ...bookingDays])).sort();
    
    const today = getLocalIsoDateString();

    return combinedDates
      .filter(date => date >= today)
      .map(date => ({
        value: date,
        isCancelled: cancelledDates.includes(date)
      }));
};
