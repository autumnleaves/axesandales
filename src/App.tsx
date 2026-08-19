import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { Layout } from './components/Layout';
import { BookingModal } from './components/BookingModal';
import { LoginModal } from './components/LoginModal';
import { StatsView } from './components/StatsView';
import { AdminView } from './components/AdminView';
import { ProfileView } from './components/ProfileView';
import { AboutView } from './components/AboutView';
import { MembershipView } from './components/MembershipView';
import { ClubLayoutView } from './components/ClubLayoutView';
import { WelcomeView } from './components/WelcomeView';
import { EventsView } from './components/EventsView';
import { SwapMeetView } from './components/SwapMeetView';
import { auth } from './firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import * as firebaseService from './services/firebaseService';
import { getSelectableDates, getBookableDates } from './constants';
import { canModifyBooking, getSecondaryTerrainStatus } from './services/bookingService';
import { sanitizeBookingGameSystem, shouldAutoAddGameSystem } from './utils/bookingFlowHelpers';
import { resolveSelectedBookingDate } from './utils/bookingDateSelection';
import { AdminAuditEntry, Booking, User, Table, TableSize, TerrainBox, ClubEvent, SwapMeet, SwapMeetBooking } from './types';

type PageKey = 'home' | 'about' | 'membership' | 'layout' | 'stats' | 'profile' | 'admin' | 'welcome' | 'events' | 'swapMeet';

const DEV_USER: User = {
  id: 'dev-local',
  email: 'dev@local',
  name: 'Dev User',
  isMember: true,
  isAdmin: true,
  membershipExpiryDate: '2026-04-15', // Dev testing: set within 7 days to see expiry banner
};
const isDev = import.meta.env.DEV;

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, ''); // e.g. "/axesandales"

const PATH_TO_PAGE: Record<string, PageKey> = {
  '': 'about',
  '/': 'about',
  '/booking': 'home',
  '/about': 'about',
  '/location': 'about',
  '/membership': 'membership',
  '/layout': 'layout',
  '/stats': 'stats',
  '/profile': 'profile',
  '/admin': 'admin',
  '/welcome': 'welcome',
  '/events': 'events',
  '/swap-meet': 'swapMeet',
};

const PAGE_TO_PATH: Record<PageKey, string> = {
  home: '/booking',
  about: '/about',
  membership: '/membership',
  layout: '/layout',
  stats: '/stats',
  profile: '/profile',
  admin: '/admin',
  welcome: '/welcome',
  events: '/events',
  swapMeet: '/swap-meet',
};

const getPageFromUrl = (): PageKey => {
  const path = window.location.pathname.replace(BASE_PATH, '') || '/';
  return PATH_TO_PAGE[path] || 'about';
};

const DATE_QUERY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const getBookingDateFromUrl = (): string | null => {
  const path = window.location.pathname.replace(BASE_PATH, '') || '/';
  if (PATH_TO_PAGE[path] !== 'home') return null;

  const date = new URLSearchParams(window.location.search).get('date');
  if (!date || !DATE_QUERY_PATTERN.test(date)) return null;

  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
};

const App: React.FC = () => {
const [currentPage, setCurrentPage] = useState<PageKey>(getPageFromUrl);
const [locationSearch, setLocationSearch] = useState(window.location.search);
const [user, setUser] = useState<User | null>(null);
const [loading, setLoading] = useState(true);

// App-level state for local data
const [allBookings, setAllBookings] = useState<Booking[]>([]);
const activeBookings = allBookings.filter(b => b.status !== 'cancelled');
const [tables, setTables] = useState<Table[]>([]);
const [terrainBoxes, setTerrainBoxes] = useState<TerrainBox[]>([]);
const [terrainAudit, setTerrainAudit] = useState<AdminAuditEntry[]>([]);

// Users state (Fetched from Firebase for Admins)
const [users, setUsers] = useState<User[]>([]);

const [cancelledDates, setCancelledDates] = useState<string[]>([]);
const [specialEventDates, setSpecialEventDates] = useState<string[]>([]);
const [scheduleLoaded, setScheduleLoaded] = useState(false);
const [gameSystems, setGameSystems] = useState<string[]>([]);
const [events, setEvents] = useState<ClubEvent[]>([]);
const [eventTags, setEventTags] = useState<string[]>([]);
const [swapMeetBookings, setSwapMeetBookings] = useState<SwapMeetBooking[]>([]);
const [swapMeets, setSwapMeets] = useState<SwapMeet[]>([]);
const [showSwapMeetTab, setShowSwapMeetTab] = useState(false);
const [siteConfigLoaded, setSiteConfigLoaded] = useState(false);

const selectableDates = getSelectableDates(specialEventDates, activeBookings, cancelledDates);
const displayedSwapMeet = useMemo(() => {
  const today = new Date().toISOString().slice(0, 10);
  const ordered = [...swapMeets].sort((left, right) => left.date.localeCompare(right.date));
  return ordered.find(swapMeet => swapMeet.date >= today) ?? ordered[ordered.length - 1] ?? null;
}, [swapMeets]);
const [selectedDate, setSelectedDate] = useState('');

// Modal State
const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
const [editingBooking, setEditingBooking] = useState<Booking | null>(null);

// Toast state
const [toast, setToast] = useState<{ message: string; key: number } | null>(null);
const toastTimer = useRef<ReturnType<typeof setTimeout>>();
const appliedLinkedBookingDate = useRef<string | null>(null);
const showToast = useCallback((message: string) => {
  clearTimeout(toastTimer.current);
  setToast({ message, key: Date.now() });
  toastTimer.current = setTimeout(() => setToast(null), 3000);
}, []);

// URL-based routing: push state on page change and listen for back/forward
const navigateTo = useCallback((page: PageKey) => {
  setCurrentPage(page);
  const newPath = BASE_PATH + PAGE_TO_PATH[page];
  if (window.location.pathname !== newPath || window.location.search) {
    window.history.pushState(null, '', newPath);
    setLocationSearch('');
  }
}, []);

useEffect(() => {
  const onPopState = () => {
    setCurrentPage(getPageFromUrl());
    setLocationSearch(window.location.search);
  };
  window.addEventListener('popstate', onPopState);
  return () => window.removeEventListener('popstate', onPopState);
}, []);

// Popover state for booked items and terrain preview
const [popover, setPopover] = useState<{ booking?: Booking; terrainBox?: TerrainBox; type: 'table' | 'terrain'; rect: DOMRect } | null>(null);
const popoverRef = useRef<HTMLDivElement>(null);
const popoverTimeout = useRef<ReturnType<typeof setTimeout>>();
const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

// Reposition popover after render to flip above if it would overflow
useLayoutEffect(() => {
  if (!popover || !popoverRef.current) return;
  const el = popoverRef.current;
  const popoverHeight = el.offsetHeight;
  const spaceBelow = window.innerHeight - popover.rect.bottom - 8;
  const fitsBelow = spaceBelow >= popoverHeight;
  const top = fitsBelow
    ? popover.rect.bottom + 8
    : Math.max(8, popover.rect.top - popoverHeight - 8);
  const left = Math.min(popover.rect.left, window.innerWidth - 300);
  setPopoverStyle({ top, left });
}, [popover]);

const showPopover = useCallback((booking: Booking, type: 'table' | 'terrain', el: HTMLElement) => {
  clearTimeout(popoverTimeout.current);
  const terrainBox = type === 'terrain' && booking.terrainBoxId ? terrainBoxes.find(t => t.id === booking.terrainBoxId) : undefined;
  setPopover({ booking, terrainBox, type, rect: el.getBoundingClientRect() });
}, [terrainBoxes]);

const showTerrainPopover = useCallback((box: TerrainBox, booking: Booking | undefined, el: HTMLElement) => {
  clearTimeout(popoverTimeout.current);
  setPopover({ booking, terrainBox: box, type: 'terrain', rect: el.getBoundingClientRect() });
}, []);

const hidePopover = useCallback(() => {
  popoverTimeout.current = setTimeout(() => setPopover(null), 150);
}, []);

const keepPopover = useCallback(() => {
  clearTimeout(popoverTimeout.current);
}, []);

useEffect(() => {
// Subscribe to real-time Firestore data
const unsubBookings = firebaseService.subscribeBookings(setAllBookings);
const unsubTables = firebaseService.subscribeTables(setTables);
const unsubTerrain = firebaseService.subscribeTerrainBoxes(setTerrainBoxes);
const unsubTerrainAudit = firebaseService.subscribeTerrainAudit(setTerrainAudit);
const unsubSchedule = firebaseService.subscribeScheduleConfig((cancelled, special) => {
    setCancelledDates(cancelled);
    setSpecialEventDates(special);
    setScheduleLoaded(true);
});
const unsubSiteConfig = firebaseService.subscribeSiteConfig((showSwapMeet) => {
    setShowSwapMeetTab(showSwapMeet);
    setSiteConfigLoaded(true);
});
const unsubGameSystems = firebaseService.subscribeGameSystems(setGameSystems);
const unsubEvents = firebaseService.subscribeEvents(setEvents);
const unsubEventTags = firebaseService.subscribeEventTags(setEventTags);
const unsubSwapMeetBookings = firebaseService.subscribeSwapMeetBookings(setSwapMeetBookings);
const unsubSwapMeets = firebaseService.subscribeSwapMeets(setSwapMeets);
const unsubUsers = firebaseService.subscribeUsers((allUsers) => {
    setUsers(allUsers);
    // Keep current user profile in sync with real-time updates
    setUser(prev => {
        if (!prev) return prev;
        const updated = allUsers.find(u => u.id === prev.id);
        return updated ?? prev;
    });
});

// Listen for Firebase Auth changes
const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
try {
if (firebaseUser) {
// Get rich profile from Firestore
let userProfile = await firebaseService.getUserProfile(firebaseUser.uid);
if (!userProfile) {
// Auto-create pending profile (e.g. first-time Google sign-in handled elsewhere,
// but cover edge cases where auth exists without a profile)
userProfile = await firebaseService.createPendingProfile(
  firebaseUser.uid,
  firebaseUser.email || '',
  firebaseUser.displayName || firebaseUser.email || 'New User'
);
}
setUser(userProfile);
// If Admin, fetch all users
if(userProfile.isAdmin) {
try {
const allUsers = await firebaseService.getAllUsers();
setUsers(allUsers);
} catch (e) {
console.error("Could not fetch users list:", e);
}
}
} else {
setUser(null);
}
} catch (error) {
console.error("Authentication Error:", error);
// Even if DB fails, we must stop loading so the user isn't stuck
setUser(null);
} finally {
setLoading(false);
}
});
return () => {
    unsubscribe();
    unsubBookings();
    unsubTables();
    unsubTerrain();
    unsubTerrainAudit();
    unsubSchedule();
    unsubSiteConfig();
    unsubGameSystems();
    unsubEvents();
    unsubEventTags();
    unsubSwapMeetBookings();
    unsubSwapMeets();
    unsubUsers();
};
}, []);

useEffect(() => {
  if (siteConfigLoaded && !showSwapMeetTab && currentPage === 'swapMeet') {
    navigateTo('about');
  }
}, [currentPage, navigateTo, showSwapMeetTab, siteConfigLoaded]);

useEffect(() => {
if (!scheduleLoaded) return;
const linkedBookingDate = currentPage === 'home' ? getBookingDateFromUrl() : null;
const linkedSelectableDate = linkedBookingDate
  ? selectableDates.find(d => d.value === linkedBookingDate && !d.isCancelled)
  : undefined;

if (
  linkedBookingDate &&
  linkedSelectableDate &&
  appliedLinkedBookingDate.current !== linkedBookingDate
) {
  appliedLinkedBookingDate.current = linkedBookingDate;
  setSelectedDate(linkedBookingDate);
  return;
}

const nextSelectedDate = resolveSelectedBookingDate(selectableDates, selectedDate, linkedBookingDate);
if (nextSelectedDate !== selectedDate) {
setSelectedDate(nextSelectedDate);
}
}, [currentPage, locationSearch, scheduleLoaded, selectableDates, selectedDate]);

const handleBookingSave = async (booking: Booking) => {
const isNew = !editingBooking;
const bookingWithStatus: Booking = { ...booking, status: booking.status || 'active' };
try {
  const [latestGameSystems, latestBookings] = await Promise.all([
    firebaseService.fetchGameSystems(),
    firebaseService.fetchBookings(),
  ]);
  const sanitizedGameSystem = sanitizeBookingGameSystem(
    bookingWithStatus,
    latestGameSystems,
    latestBookings
  );
  const bookingToSave = sanitizedGameSystem === bookingWithStatus.gameSystem
    ? bookingWithStatus
    : { ...bookingWithStatus, gameSystem: sanitizedGameSystem };
  await firebaseService.saveBooking(bookingToSave);
  if (shouldAutoAddGameSystem(bookingToSave, latestGameSystems)) {
    await firebaseService.addGameSystem(bookingToSave.gameSystem);
  }
} catch (err: unknown) {
  if (err instanceof Error && err.name === 'BookingConflictError') {
    // Force resync so the UI reflects latest availability
    const fresh = await firebaseService.fetchBookings();
    setAllBookings(fresh);
  }
  throw err;
}
showToast(isNew ? 'Booking confirmed!' : 'Booking updated!');
};

const handleLogout = async () => {
await firebaseService.logout();
setUser(null);
navigateTo('home');
};

const handleEdit = (booking: Booking) => {
setEditingBooking(booking);
setIsBookingModalOpen(true);
};

const handleDelete = async (id: string) => {
if (confirm('Are you sure you want to cancel this booking?')) {
try {
await firebaseService.cancelBooking(id, user?.id || 'unknown');
showToast('Booking cancelled.');
} catch (err) {
console.error('Failed to cancel booking:', err);
showToast('Failed to cancel booking. Please try again.');
}
}
};

const openNewBooking = () => {
setEditingBooking(null);
setIsBookingModalOpen(true);
};

const handleTablesUpdate = async (updatedTables: Table[]) => { await firebaseService.saveTablesToDb(updatedTables); };
const handleTerrainUpdate = async (updatedTerrain: TerrainBox[]) => { await firebaseService.saveTerrainBoxesToDb(updatedTerrain); };
const handleCancelledDatesUpdate = async (dates: string[]) => { await firebaseService.saveCancelledDatesToDb(dates); };
const handleSpecialEventDatesUpdate = async (dates: string[]) => { await firebaseService.saveSpecialEventDatesToDb(dates); };
const handleShowSwapMeetTabChange = async (showSwapMeet: boolean) => {
  await firebaseService.saveShowSwapMeetTabToDb(showSwapMeet);
};
const handleSwapMeetBookingSave = async (stallCount: number, swapMeet: SwapMeet) => {
  const effectiveUser = user || (isDev ? DEV_USER : null);
  if (!effectiveUser) {
    setIsLoginModalOpen(true);
    return;
  }
  await firebaseService.saveSwapMeetBooking(effectiveUser, stallCount, swapMeet);
  showToast('Swap meet booking saved!');
};
const handleSwapMeetSave = async (swapMeet: Pick<SwapMeet, 'id' | 'date' | 'stallCount'>) => {
  await firebaseService.saveSwapMeet(swapMeet);
};
const handleSwapMeetDelete = async (swapMeetId: string) => {
  await firebaseService.deleteSwapMeet(swapMeetId);
};
const refreshSwapMeetBookings = async () => {
  setSwapMeetBookings(await firebaseService.fetchSwapMeetBookings());
};
const handleSwapMeetPaid = async (bookingId: string) => {
  const effectiveUser = user || (isDev ? DEV_USER : null);
  if (!effectiveUser?.isAdmin) return;
  await firebaseService.markSwapMeetBookingPaid(bookingId, effectiveUser);
  showToast('Swap meet booking marked as paid.');
};
const handleSwapMeetInvoiced = async (bookingId: string) => {
  const effectiveUser = user || (isDev ? DEV_USER : null);
  if (!effectiveUser?.isAdmin) return;
  await firebaseService.markSwapMeetBookingInvoiced(bookingId, effectiveUser);
  showToast('Swap meet booking marked as invoiced.');
};
const handleSwapMeetCancelled = async (bookingId: string) => {
  const effectiveUser = user || (isDev ? DEV_USER : null);
  if (!effectiveUser) return;
  await firebaseService.cancelSwapMeetBooking(bookingId, effectiveUser);
  showToast('Swap meet booking cancelled.');
};

// Function to refresh the user list from Firebase (passed to AdminView)
const refreshUsers = async () => {
if(user?.isAdmin) {
setUsers(await firebaseService.getAllUsers());
}
}

const bookingsForSelectedDate = [
  ...activeBookings.filter(b => b.date === selectedDate),
  // Permanent "Painting Table" reservation for Large Table 13
  {
    id: 'permanent-painting-table',
    date: selectedDate,
    tableId: 'L13',
    terrainBoxId: null,
    memberName: 'Painting Table',
    memberId: 'system-painting-table',
    gameSystem: 'Painting / Hobby',
    playerCount: 0,
    taggedPlayerIds: [],
    timestamp: 0,
    status: 'active' as const,
  },
];
const isDateCancelled = cancelledDates.includes(selectedDate);

const bookableDates = getBookableDates(specialEventDates, cancelledDates);

// Inject permanent painting table booking for every bookable date
const paintingTableBookings: Booking[] = bookableDates.map(d => ({
  id: `permanent-painting-table-${d}`,
  date: d,
  tableId: 'L13',
  terrainBoxId: null,
  memberName: 'Painting Table',
  memberId: 'system-painting-table',
  gameSystem: 'Painting / Hobby',
  playerCount: 0,
  taggedPlayerIds: [],
  timestamp: 0,
  status: 'active' as const,
}));
const allBookingsWithPainting = [...activeBookings, ...paintingTableBookings];

if (loading) {
return (
<div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white space-y-4">
<div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
<div>Loading Axes & Ales...</div>
</div>
);
}

const renderPendingBanner = () => {
if (!user || user.isMember || user.isAdmin) return null;
return (
<div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-4 flex items-start gap-3">
  <div className="mt-0.5">
    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
  </div>
  <div>
    <h3 className="text-amber-300 font-semibold">Unpaid Membership</h3>
    <p className="text-neutral-400 text-sm mt-1">Your membership is not yet active. You can browse the dashboard but cannot book tables until your payment has been confirmed.</p>
    <p className="text-neutral-400 text-sm mt-1">
      To pay for your membership, head to the{' '}
      <button onClick={() => navigateTo('membership')} className="text-amber-400 hover:text-amber-300 underline font-medium">Membership &amp; Payment</button>{' '}
      page for details and to pay. Be sure to include your sign-up email (<span className="text-white font-medium">{user.email}</span>) with your payment.
    </p>
    <p className="text-neutral-400 text-sm mt-1">If you have any questions, please email <a href="mailto:axesandalescommittee@gmail.com" className="text-amber-400 hover:text-amber-300 underline">axesandalescommittee@gmail.com</a>.</p>
  </div>
</div>
);
};

const renderExpiryWarningBanner = () => {
  const effectiveUser = user || (isDev ? DEV_USER : null);
  if (!effectiveUser || (!effectiveUser.isMember && !effectiveUser.isAdmin)) return null;
  if (!effectiveUser.membershipExpiryDate) return null;
  const expiry = new Date(effectiveUser.membershipExpiryDate + 'T00:00:00');
  const today = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00');
  const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntilExpiry > 7 || daysUntilExpiry < 0) return null;
  const expiryText = daysUntilExpiry === 0 ? 'today' : daysUntilExpiry === 1 ? 'tomorrow' : `in ${daysUntilExpiry} days`;
  return (
    <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-4 flex items-start gap-3">
      <div className="mt-0.5">
        <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      </div>
      <div>
        <h3 className="text-amber-300 font-semibold">Membership Expiring Soon</h3>
        <p className="text-neutral-400 text-sm mt-1">Your membership expires {expiryText} ({new Date(effectiveUser.membershipExpiryDate + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}). Head to the{' '}
          <button onClick={() => navigateTo('membership')} className="text-amber-400 hover:text-amber-300 underline font-medium">Membership &amp; Payment</button>{' '}
          page to renew.</p>
        <p className="text-neutral-500 text-xs mt-2">Already paid? Don't worry! The committee will update your membership soon.</p>
      </div>
    </div>
  );
};

const renderDashboard = () => {
const bookedTerrainIds = new Set(
  bookingsForSelectedDate
    .map(b => b.terrainBoxId)
    .filter((terrainBoxId): terrainBoxId is string => Boolean(terrainBoxId))
);
const secondaryTerrainBoxes = terrainBoxes.filter(tb => !tb.disabled && ((tb.maxBookingsPerNight ?? 1) > 1 || tb.allowAsSecondItem));
const regularTerrainBoxes = terrainBoxes.filter(tb =>
  (tb.maxBookingsPerNight ?? 1) <= 1 && (!tb.disabled || bookedTerrainIds.has(tb.id))
);
const regularTerrainCategories = Array.from(new Set(regularTerrainBoxes.map(tb => tb.category)));

return (
<div className="space-y-8">
{renderPendingBanner()}
{renderExpiryWarningBanner()}
<div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-neutral-800 p-4 rounded-xl border border-neutral-700 shadow-lg">
<div className="flex items-center gap-3 w-full md:w-auto">
<label className="text-neutral-400 font-medium whitespace-nowrap">Viewing Date:</label>
<select
value={selectedDate}
onChange={(e) => setSelectedDate(e.target.value)}
className="bg-neutral-900 border border-neutral-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-amber-500 outline-none w-full md:w-auto"
>
{selectableDates.map(d => (
<option key={d.value} value={d.value} disabled={d.isCancelled}>
{new Date(d.value + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
{d.isCancelled ? ' (Closed)' : ''}
</option>
))}
</select>
</div>
{(user && user.isMember || isDev) && (
<button onClick={openNewBooking} className="w-full md:w-auto bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg shadow-amber-900/40 transform transition hover:-translate-y-0.5">
+ New Booking
</button>
)}
</div>
<div>
<h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
<span className="w-2 h-8 bg-amber-600 rounded-full inline-block"></span>
Table Status
</h2>
{isDateCancelled ? (
<div className="bg-neutral-800 border-2 border-red-900/50 rounded-xl p-8 text-center">
<h3 className="text-2xl font-bold text-red-400">Club Closed</h3>
<p className="text-neutral-400 mt-2">The club is closed on this date. Bookings are not available.</p>
</div>
) : (
<div className="space-y-3">
{Object.values(TableSize).map(size => {
    const tablesInGroup = tables.filter(t => t.size === size);
    if (tablesInGroup.length === 0) return null;
    const availableCount = tablesInGroup.filter(t => !bookingsForSelectedDate.find(b => b.tableId === t.id)).length;
    const totalCount = tablesInGroup.length;
    const sizeLabel = size === TableSize.LARGE ? 'Large Tables (6x4)' : 'Small Tables (3x4)';
    return (
        <div key={size} className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-neutral-200">{sizeLabel}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${availableCount > 0 ? 'bg-green-900/30 text-green-400 border border-green-800/50' : 'bg-red-900/30 text-red-400 border border-red-800/50'}`}>
                    {availableCount}/{totalCount} available
                </span>
            </div>
            <div className="flex flex-wrap gap-2">
                {tablesInGroup.map(table => {
                    const booking = bookingsForSelectedDate.find(b => b.tableId === table.id);
                    const isMyBooking = user && (booking?.memberId === user.id || booking?.taggedPlayerIds?.includes(user.id));
                    return (
                        <div key={table.id}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${booking ? 'cursor-pointer' : 'cursor-default'} ${booking ? (isMyBooking ? 'bg-amber-900/20 border-amber-600/50 text-amber-300' : 'bg-red-900/20 border-red-900/40 text-red-300') : 'bg-neutral-900 border-neutral-600 text-neutral-300'}`}
                            onMouseEnter={(e) => booking && showPopover(booking, 'table', e.currentTarget)}
                            onMouseLeave={hidePopover}>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${booking ? 'bg-red-400' : 'bg-green-400'}`}></span>
                            {table.name}
                        </div>
                    );
                })}
            </div>
        </div>
    );
})}
            </div>
        )}
    </div>
    <div>
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-8 bg-amber-600 rounded-full inline-block"></span>
            Terrain Box Status
        </h2>
        {isDateCancelled ? (
            <div className="bg-neutral-800 border-2 border-red-900/50 rounded-xl p-8 text-center">
                <h3 className="text-2xl font-bold text-red-400">Club Closed</h3>
                <p className="text-neutral-400 mt-2">The club is closed on this date.</p>
            </div>
        ) : (
            <div className="space-y-3">
                {regularTerrainCategories.map(category => {
                    const boxesInCategory = regularTerrainBoxes.filter(tb => tb.category === category);
                    if (boxesInCategory.length === 0) return null;
                    const availableCount = boxesInCategory.filter(tb => !bookedTerrainIds.has(tb.id)).length;
                    const totalCount = boxesInCategory.length;
                    return (
                        <div key={category} className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold text-neutral-200">{category}</h3>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${availableCount > 0 ? 'bg-green-900/30 text-green-400 border border-green-800/50' : 'bg-red-900/30 text-red-400 border border-red-800/50'}`}>
                                    {availableCount}/{totalCount} available
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {boxesInCategory.map(box => {
                                    const isBooked = bookedTerrainIds.has(box.id);
                                    const booking = isBooked ? bookingsForSelectedDate.find(b => b.terrainBoxId === box.id) : undefined;
                                    const isMyTerrain = user && (booking?.memberId === user.id || booking?.taggedPlayerIds?.includes(user.id));
                                    return (
                                        <div key={box.id}
                                            className={`text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${isBooked ? (isMyTerrain ? 'bg-amber-900/20 border-amber-600/50 text-amber-300' : 'bg-red-900/20 border-red-900/40 text-red-300') : 'bg-neutral-900 border-neutral-600 text-neutral-300 hover:border-neutral-400'}`}
                                            onMouseEnter={(e) => showTerrainPopover(box, booking, e.currentTarget)}
                                            onMouseLeave={hidePopover}>
                                            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${isBooked ? (isMyTerrain ? 'bg-amber-400' : 'bg-red-400') : 'bg-green-400'}`}></span>
                                            {box.name}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
                {secondaryTerrainBoxes.map(box => {
                    const status = getSecondaryTerrainStatus(box, bookingsForSelectedDate, user?.id);
                    const isFull = status.isFull;
                    const isBookedByUser = status.isBookedByUser;
                    const booking = status.booking;
                    return (
                        <div key={box.id} className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold text-neutral-200">{box.name}</h3>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${!isFull ? 'bg-green-900/30 text-green-400 border border-green-800/50' : 'bg-red-900/30 text-red-400 border border-red-800/50'}`}>
                                    {status.isCapacityLimited ? `${status.availableCount}/${status.capacity} available` : 'extra item'}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <div className={`text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${isFull ? 'bg-red-900/20 border-red-900/40 text-red-300' : isBookedByUser ? 'bg-amber-900/20 border-amber-600/50 text-amber-300' : 'bg-neutral-900 border-neutral-600 text-neutral-300 hover:border-neutral-400'}`} onMouseEnter={(e) => showTerrainPopover(box, booking, e.currentTarget)} onMouseLeave={hidePopover}>
                                    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${isFull ? 'bg-red-400' : isBookedByUser ? 'bg-amber-400' : 'bg-green-400'}`}></span>
                                    {box.name}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
    </div>
</div>
  );
};

return (
<>
<Layout user={user} onLogin={() => setIsLoginModalOpen(true)} onLogout={handleLogout} currentPage={currentPage} onNavigate={navigateTo} showSwapMeetTab={showSwapMeetTab}>
{currentPage === 'home' && renderDashboard()}
{currentPage === 'about' && <AboutView />}
{currentPage === 'welcome' && <WelcomeView onNavigate={navigateTo} />}
{currentPage === 'membership' && <MembershipView />}
{currentPage === 'layout' && <ClubLayoutView />}
{currentPage === 'stats' && <StatsView currentUser={user || (isDev ? DEV_USER : null)} showToast={showToast} />}
{currentPage === 'events' && <EventsView events={events} user={user} eventTags={eventTags} nextClubDate={bookableDates[0] || null} />}
{currentPage === 'swapMeet' && showSwapMeetTab && (
  <SwapMeetView
    user={user}
    users={users}
    bookings={swapMeetBookings}
    swapMeet={displayedSwapMeet}
    onLogin={() => setIsLoginModalOpen(true)}
    onBookStalls={handleSwapMeetBookingSave}
    onMarkPaid={handleSwapMeetPaid}
    onMarkInvoiced={handleSwapMeetInvoiced}
    onCancelBooking={handleSwapMeetCancelled}
  />
)}
    {currentPage === 'profile' && user && <ProfileView user={user} onNameChange={(newName) => setUser(prev => prev ? { ...prev, name: newName } : prev)} />}
{currentPage === 'admin' && (user?.isAdmin || isDev) && (
<AdminView
tables={tables}
terrainBoxes={terrainBoxes}
terrainAudit={terrainAudit}
users={users}
allBookings={allBookings}
cancelledDates={cancelledDates}
specialEventDates={specialEventDates}
swapMeets={swapMeets}
swapMeetBookings={swapMeetBookings}
onTablesChange={handleTablesUpdate}
onTerrainChange={handleTerrainUpdate}
onUsersChange={refreshUsers}
onCancelledDatesChange={handleCancelledDatesUpdate}
onSpecialEventDatesChange={handleSpecialEventDatesUpdate}
onSwapMeetSave={handleSwapMeetSave}
onSwapMeetDelete={handleSwapMeetDelete}
onSwapMeetPaid={handleSwapMeetPaid}
onSwapMeetInvoiced={handleSwapMeetInvoiced}
onSwapMeetCancelled={handleSwapMeetCancelled}
onSwapMeetBookingsRefresh={refreshSwapMeetBookings}
showSwapMeetTab={showSwapMeetTab}
onShowSwapMeetTabChange={handleShowSwapMeetTabChange}
currentUser={user || DEV_USER}
gameSystems={gameSystems}
showToast={showToast}
/>
)}
</Layout>
{(user || isDev) && (
<BookingModal
isOpen={isBookingModalOpen}
onClose={() => setIsBookingModalOpen(false)}
onSave={handleBookingSave}
user={user || DEV_USER}
editingBooking={editingBooking}
tables={tables}
terrainBoxes={terrainBoxes}
cancelledDates={cancelledDates}
bookableDates={bookableDates}
initialDate={selectedDate}
allBookings={allBookingsWithPainting}
gameSystems={gameSystems}
allUsers={users}
/>
)}
<LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} onRegisterSuccess={() => { setIsLoginModalOpen(false); navigateTo('welcome'); }} />
{popover && (
  <div
    ref={popoverRef}
    className="fixed z-50 bg-neutral-800 border border-neutral-600 rounded-xl shadow-2xl shadow-black/50 min-w-[260px] max-w-[340px] overflow-hidden"
    style={popoverStyle}
    onMouseEnter={keepPopover}
    onMouseLeave={hidePopover}
  >
    {popover.terrainBox && (
      <img src={popover.terrainBox.uploadedImageUrl || popover.terrainBox.imageUrl} alt={popover.terrainBox.name} className="w-full h-48 object-cover" />
    )}
    <div className="p-4 space-y-2">
      {popover.terrainBox && (
        <div className="text-sm font-bold text-white">{popover.terrainBox.name}
          <span className="ml-2 text-xs font-normal text-neutral-400">{popover.terrainBox.category}</span>
        </div>
      )}
      {popover.booking ? (
        <>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            <span className="text-sm font-semibold text-white">{popover.booking.memberName}</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span className="text-sm text-neutral-300">{popover.booking.gameSystem}</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span className="text-sm text-neutral-400">{popover.booking.playerCount} players</span>
          </div>
          {popover.booking.taggedPlayerIds.length > 0 && (
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
              <div className="flex flex-wrap gap-1">
                {popover.booking.taggedPlayerIds.map(id => {
                  const taggedUser = users.find(u => u.id === id);
                  return <span key={id} className="text-xs bg-amber-900/30 border border-amber-700/40 text-amber-300 px-1.5 py-0.5 rounded-full">{taggedUser?.name || 'Unknown'}</span>;
                })}
              </div>
            </div>
          )}
          {!popover.terrainBox && popover.booking.terrainBoxId && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              <span className="text-sm text-neutral-400">{terrainBoxes.find(t => t.id === popover.booking!.terrainBoxId)?.name || 'Terrain'}</span>
            </div>
          )}
          {!popover.terrainBox && popover.booking.secondaryTerrainId && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              <span className="text-sm text-neutral-400">{terrainBoxes.find(t => t.id === popover.booking!.secondaryTerrainId)?.name || 'Extra Terrain'}</span>
            </div>
          )}
          {popover.type === 'table' && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              <span className="text-sm text-neutral-400">{tables.find(t => t.id === popover.booking!.tableId)?.name || 'Table'}</span>
            </div>
          )}
          {popover.type === 'terrain' && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              <span className="text-sm text-neutral-400">{tables.find(t => t.id === popover.booking!.tableId)?.name || 'Table'}</span>
            </div>
          )}
        </>
      ) : (
        <div className="text-xs text-green-400 font-medium">Available</div>
      )}
    </div>
    {popover.booking && canModifyBooking(popover.booking, user) && (
      <div className="px-4 pb-4 pt-1 border-t border-neutral-700 flex gap-2">
        <button onClick={() => { const b = popover.booking!; setPopover(null); handleEdit(b); }} className="flex-1 text-xs bg-neutral-700 hover:bg-neutral-600 py-1.5 rounded text-neutral-300 transition-colors">Edit</button>
        <button onClick={() => { const id = popover.booking!.id; setPopover(null); handleDelete(id); }} className="flex-1 text-xs bg-red-900/30 hover:bg-red-900/50 py-1.5 rounded text-red-300 transition-colors">Cancel</button>
      </div>
    )}
  </div>
)}

{/* Toast notification */}
{toast && (
  <div
    key={toast.key}
    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-neutral-800 border border-neutral-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3"
  >
    <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
    <span className="text-sm font-medium">{toast.message}</span>
  </div>
)}
</>
);
};

export default App;
