export enum TableSize {
  LARGE = '6x4',
  SMALL = '3x4'
}

export interface Table {
  id: string;
  name: string;
  size: TableSize;
  order?: number;
}

export enum TerrainCategory {
  SCIFI = 'Sci-Fi',
  HISTORICAL = 'Historical',
  FANTASY = 'Fantasy',
  AOS = 'Age of Sigmar',
  WARHAMMER_40K = 'Warhammer 40k'
}

export interface TerrainBox {
  id: string;
  // Freeform: admins can type a new category directly in the admin UI,
  // so this is no longer constrained to the TerrainCategory enum.
  category: string;
  name: string;
  imageUrl: string;
  uploadedImageUrl?: string;
  disabled?: boolean;
  maxBookingsPerNight?: number;
  allowAsSecondItem?: boolean;
  order?: number;
}

export interface Booking {
  id: string;
  date: string; // YYYY-MM-DD
  tableId: string;
  terrainBoxId?: string | null; // Optional
  secondaryTerrainId?: string | null; // Optional
  memberName: string;
  memberId: string; // To link to logged in user
  gameSystem: string;
  playerCount: number;
  taggedPlayerIds: string[]; // List of other user IDs playing at this table
  markedUnavailable?: boolean;
  timestamp: number;
  status: 'active' | 'cancelled';
  cancelledAt?: number; // Timestamp of when the booking was cancelled
  cancelledBy?: string; // User ID of who cancelled the booking
}

export interface User {
  id: string; // Firebase UID
  email: string;
  name: string;
  isMember: boolean;
  isAdmin?: boolean;
  membershipPaidDate?: string; // ISO date string (YYYY-MM-DD) of when membership was last paid
  membershipExpiryDate?: string; // ISO date string (YYYY-MM-DD) of when membership expires
}

export interface MembershipAuditEntry {
  id: string;
  userId: string;
  action: 'activated' | 'renewed' | 'cancelled';
  performedBy: string; // UID of admin who did it
  performedByName: string;
  timestamp: number;
}

export interface SwapMeetBooking {
  id: string;
  swapMeetId?: string;
  userId: string;
  userName: string;
  stallCount: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  isMemberAtBooking: boolean;
  amountOwed: number;
  paid: boolean;
  invoiced: boolean;
  createdAt: number;
  updatedAt: number;
  paidAt?: number;
  paidBy?: string;
  invoicedAt?: number;
  invoicedBy?: string;
  cancelledAt?: number;
  cancelledBy?: string;
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  entityType: 'terrain';
  entityId: string;
  entityName: string;
  performedBy: string;
  performedByName: string;
  timestamp: number;
  details?: string;
}

export interface SwapMeet {
  id: string;
  date: string;
  stallCount: number;
  bookedStallCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SwapMeetAuditEntry {
  id: string;
  bookingId: string;
  userId: string;
  action: 'booked' | 'marked_paid' | 'marked_invoiced' | 'cancelled';
  performedBy: string;
  performedByName: string;
  timestamp: number;
  previousStallCount?: number;
  newStallCount?: number;
}

export interface DateStat {
  date: string;
  game: string;
}

export interface ClubEvent {
  id: string;
  title: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD (same as startDate for single-day events)
  tags: string[];    // e.g. ['Tournament', 'Campaign']
  createdBy: string; // User ID
  createdByName: string;
  createdAt: number; // Timestamp
}
