import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Layout } from './components/Layout';
import { BookingDashboardView } from './components/BookingDashboardView';
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
import { sanitizeBookingGameSystem, shouldAutoAddGameSystem } from './utils/bookingFlowHelpers';
import { resolveSelectedBookingDate } from './utils/bookingDateSelection';
import { AdminAuditEntry, Booking, User, Table, TerrainBox, ClubEvent, SwapMeet, SwapMeetBooking } from './types';

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
const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

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

const handleBookingSave = async (booking: Booking, isNew: boolean) => {
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

const bookableDates = getBookableDates(specialEventDates, cancelledDates);

if (loading) {
return (
<div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white space-y-4">
<div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
<div>Loading Axes & Ales...</div>
</div>
);
}


return (
<>
<Layout user={user} onLogin={() => setIsLoginModalOpen(true)} onLogout={handleLogout} currentPage={currentPage} onNavigate={navigateTo} showSwapMeetTab={showSwapMeetTab}>
{currentPage === 'home' && (
  <BookingDashboardView
    user={user}
    devUser={DEV_USER}
    tables={tables}
    terrainBoxes={terrainBoxes}
    allUsers={users}
    gameSystems={gameSystems}
    activeBookings={activeBookings}
    cancelledDates={cancelledDates}
    bookableDates={bookableDates}
    selectedDate={selectedDate}
    onSelectedDateChange={setSelectedDate}
    selectableDates={selectableDates}
    onNavigateToMembership={() => navigateTo('membership')}
    onSaveBooking={handleBookingSave}
    showToast={showToast}
  />
)}
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
<LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} onRegisterSuccess={() => { setIsLoginModalOpen(false); navigateTo('welcome'); }} />

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
