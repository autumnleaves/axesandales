import { Booking, TerrainBox, User } from '../types';
import { INITIAL_TERRAIN_BOXES } from '../constants';
import { generateUUID } from '../utils';

export interface BookingInput {
  date: string;
  tableId: string;
  terrainBoxId?: string;
  secondaryTerrainId?: string;
  gameSystem: string;
  playerCount: number;
  taggedPlayerIds: string[];
  markedUnavailable?: boolean;
}

export interface BookingValidationContext {
  cancelledDates: string[];
  user: User;
  existingBookings: Booking[];
  terrainBoxes?: TerrainBox[];
  editingBookingId?: string;
}

export interface BookingValidationResult {
  valid: boolean;
  error?: string;
}

export interface TerrainBoxStatus {
  capacity: number;
  availableCount: number;
  isCapacityLimited: boolean;
  isFull: boolean;
  isBookedByUser: boolean;
  booking?: Booking;
}

/**
 * Status of a terrain box's booked capacity for a given set of bookings.
 * A box may be used as either a booking's primary terrain or its secondary
 * (extra) item — both count against the same physical box's capacity.
 */
export function getTerrainBoxStatus(
  box: TerrainBox,
  bookings: Booking[],
  currentUserId?: string
): TerrainBoxStatus {
  const capacity = box.maxBookingsPerNight ?? 1;
  const activeBookings = bookings.filter(
    booking => booking.status === 'active' && (booking.terrainBoxId === box.id || booking.secondaryTerrainId === box.id)
  );
  const availableCount = Math.max(0, capacity - activeBookings.length);
  const booking = currentUserId
    ? activeBookings.find(booking => booking.memberId === currentUserId || booking.taggedPlayerIds.includes(currentUserId))
    : undefined;

  return {
    capacity,
    availableCount,
    isCapacityLimited: capacity > 1,
    isFull: availableCount <= 0,
    isBookedByUser: Boolean(booking),
    booking,
  };
}

/**
 * Validate booking input before persisting.
 */
export function validateBooking(
  input: BookingInput,
  context: BookingValidationContext
): BookingValidationResult {
  if (context.cancelledDates.includes(input.date)) {
    return { valid: false, error: 'This date has been cancelled. Bookings are not allowed.' };
  }

  if (!context.user.isMember) {
    return { valid: false, error: 'Your membership is not active. Please contact an admin.' };
  }

  const isMarkedUnavailable = Boolean(input.markedUnavailable);
  if (!input.tableId) {
    return { valid: false, error: 'Please select a table and enter a game system.' };
  }

  if (!isMarkedUnavailable && !input.gameSystem) {
    return { valid: false, error: 'Please select a table and enter a game system.' };
  }

  // Check table availability for the given date
  if (input.tableId) {
    const conflicting = context.existingBookings.find(
      b => b.date === input.date &&
           b.tableId === input.tableId &&
           b.status === 'active' &&
           b.id !== context.editingBookingId
    );
    if (conflicting) {
      return { valid: false, error: `Table is already booked by ${conflicting.memberName}.` };
    }
  }

  // Check terrain capacity (if selected) — a terrain box may be booked as one
  // booking's primary terrain and another's secondary/extra item, so both slots
  // draw from the same box's capacity and must be checked the same way.
  if (input.terrainBoxId) {
    const error = findTerrainCapacityError(input.terrainBoxId, input, context);
    if (error) return { valid: false, error };
  }

  if (input.secondaryTerrainId) {
    const error = findTerrainCapacityError(input.secondaryTerrainId, input, context);
    if (error) return { valid: false, error };
  }

  return { valid: true };
}

function findTerrainCapacityError(
  terrainBoxId: string,
  input: BookingInput,
  context: BookingValidationContext
): string | undefined {
  const box = (context.terrainBoxes ?? INITIAL_TERRAIN_BOXES).find(b => b.id === terrainBoxId);
  const capacity = box?.maxBookingsPerNight ?? 1;

  const usingBookings = context.existingBookings.filter(
    b => b.date === input.date &&
      b.status === 'active' &&
      b.id !== context.editingBookingId &&
      (b.terrainBoxId === terrainBoxId || b.secondaryTerrainId === terrainBoxId)
  );

  if (usingBookings.length < capacity) return undefined;

  if (capacity > 1) {
    return 'That terrain set is fully booked for this date.';
  }
  return `Terrain is already reserved by ${usingBookings[0].memberName}.`;
}

/**
 * Build a Booking object from validated input.
 * All fields are set to Firestore-safe values (no undefined).
 */
export function createBookingFromInput(
  input: BookingInput,
  user: User,
  editingBooking?: Booking | null
): Booking {
  return {
    id: editingBooking ? editingBooking.id : generateUUID(),
    date: input.date,
    tableId: input.tableId,
    terrainBoxId: input.terrainBoxId || null,
    secondaryTerrainId: input.secondaryTerrainId || null,
    memberName: user.name,
    memberId: user.id,
    gameSystem: input.markedUnavailable ? 'Unavailable' : input.gameSystem,
    playerCount: input.markedUnavailable ? 0 : input.playerCount,
    taggedPlayerIds: input.markedUnavailable ? [] : input.taggedPlayerIds,
    markedUnavailable: Boolean(input.markedUnavailable),
    timestamp: Date.now(),
    status: editingBooking ? editingBooking.status : 'active',
  };
}

/**
 * Ensure a booking object contains no undefined values (Firestore rejects them).
 */
export function sanitizeBookingForFirestore(booking: Booking): Booking {
  return {
    id: booking.id,
    date: booking.date,
    tableId: booking.tableId,
    terrainBoxId: booking.terrainBoxId ?? null,
    secondaryTerrainId: booking.secondaryTerrainId ?? null,
    memberName: booking.memberName,
    memberId: booking.memberId,
    gameSystem: booking.gameSystem,
    playerCount: booking.playerCount,
    taggedPlayerIds: booking.taggedPlayerIds ?? [],
    markedUnavailable: booking.markedUnavailable ?? false,
    timestamp: booking.timestamp,
    status: booking.status,
    ...(booking.cancelledAt !== undefined ? { cancelledAt: booking.cancelledAt } : {}),
    ...(booking.cancelledBy !== undefined ? { cancelledBy: booking.cancelledBy } : {}),
  };
}

/**
 * Check whether a user is allowed to cancel/edit a booking.
 */
export function canModifyBooking(booking: Booking, user: User | null): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  return booking.memberId === user.id;
}

/**
 * Build the cancellation update payload (mirrors firebaseService.cancelBooking).
 */
export function buildCancellationUpdate(cancelledByUserId: string): {
  status: 'cancelled';
  cancelledAt: number;
  cancelledBy: string;
} {
  return {
    status: 'cancelled',
    cancelledAt: Date.now(),
    cancelledBy: cancelledByUserId,
  };
}
