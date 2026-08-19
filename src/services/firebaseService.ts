import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    updatePassword,
    GoogleAuthProvider,
    signInWithPopup,
    sendPasswordResetEmail
} from 'firebase/auth';
import { 
    doc, 
    setDoc, 
    getDoc, 
    collection, 
    getDocs, 
    updateDoc, 
    deleteDoc,
    onSnapshot,
    query,
    where,
    orderBy,
    limit,
    Unsubscribe,
    writeBatch,
    runTransaction
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import {
    getBookingSaveConflicts,
    mapBookingSnapshotData,
} from './firebaseBookingHelpers';
import {
    sortByOrder,
    slugifyFirestoreId,
} from './firebaseDocumentHelpers';
import {
    User,
    Booking,
    Table,
    TerrainBox,
    MembershipAuditEntry,
    AdminAuditEntry,
    ClubEvent,
    SwapMeet,
    SwapMeetBooking,
    SwapMeetAuditEntry,
} from '../types';
import { chunkArray } from '../utils/gameSystemRename';
import { fileToDataUrl } from '../utils/fileToDataUrl';
import {
    buildSwapMeetBooking,
    isSwapMeetBookingActive,
    SWAP_MEET_TOTAL_STALLS,
    validateSwapMeetStallCount,
} from './swapMeetService';
import { assertAuthenticatedUser, resolveGoogleSignInProfile } from './authFlows';

const googleProvider = new GoogleAuthProvider();

// Send a password reset email
export const resetPassword = async (email: string): Promise<void> => {
    await sendPasswordResetEmail(auth, email);
};

// Fetch a user's profile from Firestore
export const getUserProfile = async (uid: string): Promise<User | null> => {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return {
            id: uid,
            email: data.email,
            name: data.name,
            isMember: data.isMember,
            isAdmin: data.isAdmin,
            membershipPaidDate: data.membershipPaidDate,
            membershipExpiryDate: data.membershipExpiryDate,
        };
    }
    return null;
};

// Create a pending Firestore profile for a new user
export const createPendingProfile = async (uid: string, email: string, name: string): Promise<User> => {
    const profile: Omit<User, 'id'> = {
        email,
        name,
        isMember: false,
        isAdmin: false,
    };
    await setDoc(doc(db, 'users', uid), { ...profile, createdAt: new Date() });
    return { id: uid, ...profile };
};

// Self-service registration (email/password)
export const register = async (email: string, password: string, name: string): Promise<User> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const { user } = userCredential;
    return createPendingProfile(user.uid, email, name);
};

// Google sign-in (creates profile if first time)
export const signInWithGoogle = async (): Promise<{ user: User; isNewUser: boolean }> => {
    const result = await signInWithPopup(auth, googleProvider);
    return resolveGoogleSignInProfile(result.user, getUserProfile, createPendingProfile);
};

// Login
export const login = async (email: string, pass: string) => {
    return signInWithEmailAndPassword(auth, email, pass);
};

// Logout
export const logout = async () => {
    return signOut(auth);
};

// Change Password
export const changePassword = async (newPassword: string) => {
    const user = assertAuthenticatedUser(auth.currentUser);
    return updatePassword(user, newPassword);
};

// Update display name (user profile + all their bookings)
export const updateDisplayName = async (uid: string, newName: string): Promise<void> => {
    const batch = writeBatch(db);

    // Update user profile
    batch.update(doc(db, 'users', uid), { name: newName });

    // Update memberName on all bookings belonging to this user
    const bookingsSnap = await getDocs(collection(db, 'bookings'));
    bookingsSnap.docs.forEach(d => {
        if (d.data().memberId === uid) {
            batch.update(doc(db, 'bookings', d.id), { memberName: newName });
        }
    });

    await batch.commit();
};

// --- ADMIN FUNCTIONS ---

export const getAllUsers = async (): Promise<User[]> => {
    const usersCol = collection(db, 'users');
    const userSnapshot = await getDocs(usersCol);
    const userList = userSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as User));
    return userList;
};

// Subscribe to all users in real-time (for player tagging and admin features)
export const subscribeUsers = (callback: (users: User[]) => void): Unsubscribe => {
    const q = query(collection(db, 'users'));
    return onSnapshot(q, (snapshot) => {
        const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as User));
        users.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        callback(users);
    }, (error) => {
        console.error('Error subscribing to users:', error);
        callback([]);
    });
};

export const updateUserProfile = async (uid: string, data: Partial<User>) => {
    const userDoc = doc(db, 'users', uid);
    return updateDoc(userDoc, data);
};

export const deleteUser = async (uid: string) => {
    const userDoc = doc(db, 'users', uid);
    await deleteDoc(userDoc);
};

// =====================================================
// MEMBERSHIP AUDIT TRAIL
// =====================================================

export const addMembershipAuditEntry = async (
    entry: Omit<MembershipAuditEntry, 'id'>
): Promise<void> => {
    const colRef = collection(db, 'membershipAudit');
    const docRef = doc(colRef);
    await setDoc(docRef, { ...entry, id: docRef.id });
};

export const subscribeMembershipAudit = (
    userId: string,
    callback: (entries: MembershipAuditEntry[]) => void
): Unsubscribe => {
    const q = query(
        collection(db, 'membershipAudit'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
        const entries = snapshot.docs.map(d => d.data() as MembershipAuditEntry);
        callback(entries);
    }, (error) => {
        console.error('Error subscribing to membership audit:', error);
        callback([]);
    });
};

// =====================================================
// SWAP MEET
// =====================================================

export const subscribeSwapMeetBookings = (
    callback: (bookings: SwapMeetBooking[]) => void
): Unsubscribe => {
    const q = query(collection(db, 'swapMeetBookings'), orderBy('userName', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const bookings = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as SwapMeetBooking));
        callback(bookings);
    }, (error) => {
        console.error('Error subscribing to swap meet bookings:', error);
        callback([]);
    });
};

export const saveSwapMeetBooking = async (
    user: User,
    stallCount: number,
    swapMeet: SwapMeet
): Promise<void> => {
    const bookingRef = doc(db, 'swapMeetBookings', `${swapMeet.id}_${user.id}`);
    const stateRef = doc(db, 'swapMeetState', swapMeet.id);
    const auditRef = doc(collection(db, 'swapMeetAudit'));

    await runTransaction(db, async (transaction) => {
        const [bookingSnap, stateSnap] = await Promise.all([
            transaction.get(bookingRef),
            transaction.get(stateRef),
        ]);
        const existingBooking = bookingSnap.exists()
            ? bookingSnap.data() as SwapMeetBooking
            : null;
        const previousStallCount = existingBooking && isSwapMeetBookingActive(existingBooking)
            ? existingBooking.stallCount
            : 0;
        const bookedStallCount = stateSnap.exists()
            ? Number(stateSnap.data().bookedStallCount ?? 0)
            : 0;
        const totalStallCount = stateSnap.exists()
            ? Number(stateSnap.data().stallCount ?? SWAP_MEET_TOTAL_STALLS)
            : swapMeet.stallCount;
        const validation = validateSwapMeetStallCount(
            stallCount,
            previousStallCount,
            bookedStallCount,
            totalStallCount
        );

        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const booking = buildSwapMeetBooking(user, stallCount, existingBooking, swapMeet.id);
        const nextBookedStallCount = bookedStallCount - previousStallCount + stallCount;
        if (nextBookedStallCount > totalStallCount) {
            throw new Error('The swap meet has just sold out. Please refresh and try again.');
        }

        transaction.set(bookingRef, booking);
        transaction.set(stateRef, {
            bookedStallCount: nextBookedStallCount,
            stallCount: totalStallCount,
            date: swapMeet.date,
            updatedAt: Date.now(),
        }, { merge: true });
        transaction.set(auditRef, {
            id: auditRef.id,
            bookingId: booking.id,
            userId: user.id,
            action: 'booked',
            performedBy: user.id,
            performedByName: user.name,
            timestamp: Date.now(),
            previousStallCount,
            newStallCount: stallCount,
        } satisfies SwapMeetAuditEntry);
    });
};

export const markSwapMeetBookingPaid = async (
    bookingId: string,
    adminUser: User
): Promise<void> => {
    const bookingRef = doc(db, 'swapMeetBookings', bookingId);
    const auditRef = doc(collection(db, 'swapMeetAudit'));
    const now = Date.now();

    await runTransaction(db, async (transaction) => {
        const bookingSnap = await transaction.get(bookingRef);
        if (!bookingSnap.exists()) {
            throw new Error('Swap meet booking not found.');
        }
        const booking = bookingSnap.data() as SwapMeetBooking;
        transaction.update(bookingRef, {
            paid: true,
            status: 'confirmed',
            paidAt: now,
            paidBy: adminUser.id,
        });
        transaction.set(auditRef, {
            id: auditRef.id,
            bookingId,
            userId: booking.userId,
            action: 'marked_paid',
            performedBy: adminUser.id,
            performedByName: adminUser.name,
            timestamp: now,
        } satisfies SwapMeetAuditEntry);
    });
};

export const cancelSwapMeetBooking = async (
    bookingId: string,
    cancelledByUser: User
): Promise<void> => {
    const bookingRef = doc(db, 'swapMeetBookings', bookingId);
    const auditRef = doc(collection(db, 'swapMeetAudit'));
    const now = Date.now();

    await runTransaction(db, async (transaction) => {
        const bookingSnap = await transaction.get(bookingRef);
        if (!bookingSnap.exists()) {
            throw new Error('Swap meet booking not found.');
        }
        const booking = bookingSnap.data() as SwapMeetBooking;
        if (!isSwapMeetBookingActive(booking)) {
            return;
        }
        if (!booking.swapMeetId) {
            throw new Error('This booking is not linked to a swap meet yet. Run the migration first.');
        }
        const stateRef = doc(db, 'swapMeetState', booking.swapMeetId);
        const stateSnap = await transaction.get(stateRef);
        const bookedStallCount = stateSnap.exists()
            ? Number(stateSnap.data().bookedStallCount ?? 0)
            : 0;
        transaction.update(bookingRef, {
            status: 'cancelled',
            updatedAt: now,
            cancelledAt: now,
            cancelledBy: cancelledByUser.id,
        });
        transaction.set(stateRef, {
            bookedStallCount: Math.max(0, bookedStallCount - booking.stallCount),
            updatedAt: now,
        }, { merge: true });
        transaction.set(auditRef, {
            id: auditRef.id,
            bookingId,
            userId: booking.userId,
            action: 'cancelled',
            performedBy: cancelledByUser.id,
            performedByName: cancelledByUser.name,
            timestamp: now,
            previousStallCount: booking.stallCount,
            newStallCount: 0,
        } satisfies SwapMeetAuditEntry);
    });
};

export const markSwapMeetBookingInvoiced = async (
    bookingId: string,
    adminUser: User
): Promise<void> => {
    const bookingRef = doc(db, 'swapMeetBookings', bookingId);
    const auditRef = doc(collection(db, 'swapMeetAudit'));
    const now = Date.now();

    await runTransaction(db, async (transaction) => {
        const bookingSnap = await transaction.get(bookingRef);
        if (!bookingSnap.exists()) {
            throw new Error('Swap meet booking not found.');
        }
        const booking = bookingSnap.data() as SwapMeetBooking;
        transaction.update(bookingRef, {
            invoiced: true,
            invoicedAt: now,
            invoicedBy: adminUser.id,
        });
        transaction.set(auditRef, {
            id: auditRef.id,
            bookingId,
            userId: booking.userId,
            action: 'marked_invoiced',
            performedBy: adminUser.id,
            performedByName: adminUser.name,
            timestamp: now,
        } satisfies SwapMeetAuditEntry);
    });
};

// =====================================================
// BOOKINGS
// =====================================================

export const subscribeBookings = (callback: (bookings: Booking[]) => void): Unsubscribe => {
    const q = query(collection(db, 'bookings'));
    return onSnapshot(q, (snapshot) => {
        const bookings = snapshot.docs.map(d => mapBookingSnapshotData(d.id, d.data()));
        callback(bookings);
    }, (error) => {
        console.error('Error subscribing to bookings:', error);
        callback([]);
    });
};

export class BookingConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BookingConflictError';
    }
}

export const saveBooking = async (booking: Booking): Promise<void> => {
    if (!booking.tableId) {
        throw new Error('Please select a table and enter a game system.');
    }

    // Fresh availability check immediately before writing to minimise race window
    const q = query(
        collection(db, 'bookings'),
        where('date', '==', booking.date),
        where('status', '==', 'active')
    );
    const snapshot = await getDocs(q);
    const activeBookings = snapshot.docs.map(d => mapBookingSnapshotData(d.id, d.data()));
    const conflicts = getBookingSaveConflicts(booking, activeBookings);
    if (conflicts.length > 0) {
        throw new BookingConflictError(conflicts.join(' ') + ' Please make another selection.');
    }
    await setDoc(doc(db, 'bookings', booking.id), booking);
};

export const fetchBookings = async (): Promise<Booking[]> => {
    const snapshot = await getDocs(collection(db, 'bookings'));
    return snapshot.docs.map(d => mapBookingSnapshotData(d.id, d.data()));
};

export const cancelBooking = async (id: string, cancelledByUserId: string): Promise<void> => {
    await updateDoc(doc(db, 'bookings', id), {
        status: 'cancelled',
        cancelledAt: Date.now(),
        cancelledBy: cancelledByUserId,
    });
};

// =====================================================
// TABLES
// =====================================================

export const subscribeTables = (callback: (tables: Table[]) => void): Unsubscribe => {
    const q = query(collection(db, 'tables'));
    return onSnapshot(q, (snapshot) => {
        callback(sortByOrder(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Table))));
    }, (error) => {
        console.error('Error subscribing to tables:', error);
    });
};

export const saveTablesToDb = async (tables: Table[]): Promise<void> => {
    // Delete any docs in Firestore that are no longer in the array
    const existingSnap = await getDocs(collection(db, 'tables'));
    const newIds = new Set(tables.map(t => t.id));
    const deletePromises = existingSnap.docs
        .filter(d => !newIds.has(d.id))
        .map(d => deleteDoc(doc(db, 'tables', d.id)));
    // Write each table as its own doc
    const writePromises = tables.map(t => setDoc(doc(db, 'tables', t.id), t));
    await Promise.all([...deletePromises, ...writePromises]);
};

// =====================================================
// TERRAIN BOXES
// =====================================================

export const subscribeTerrainBoxes = (callback: (boxes: TerrainBox[]) => void): Unsubscribe => {
    const q = query(collection(db, 'terrainBoxes'));
    return onSnapshot(q, (snapshot) => {
        callback(sortByOrder(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TerrainBox))));
    }, (error) => {
        console.error('Error subscribing to terrain boxes:', error);
    });
};

export const saveTerrainBoxesToDb = async (boxes: TerrainBox[]): Promise<void> => {
    // Delete any docs in Firestore that are no longer in the array
    const existingSnap = await getDocs(collection(db, 'terrainBoxes'));
    const newIds = new Set(boxes.map(b => b.id));
    const deletePromises = existingSnap.docs
        .filter(d => !newIds.has(d.id))
        .map(d => deleteDoc(doc(db, 'terrainBoxes', d.id)));
    // Write each terrain box as its own doc
    const writePromises = boxes.map(b => setDoc(doc(db, 'terrainBoxes', b.id), b));
    await Promise.all([...deletePromises, ...writePromises]);
};

// Upload a terrain image as a base64 data URL stored directly in Firestore
export const uploadTerrainImage = async (terrainId: string, file: File): Promise<string> => {
    const dataUrl = await fileToDataUrl(file);

    // Update the terrain doc with the base64 data URL
    const terrainDoc = doc(db, 'terrainBoxes', terrainId);
    await updateDoc(terrainDoc, { uploadedImageUrl: dataUrl });

    return dataUrl;
};

// Remove a terrain's uploaded image (clear the field in Firestore)
export const removeTerrainImage = async (terrainId: string): Promise<void> => {
    const terrainDoc = doc(db, 'terrainBoxes', terrainId);
    await updateDoc(terrainDoc, { uploadedImageUrl: null });
};

// =====================================================
// CANCELLED DATES & SPECIAL EVENT DATES
// These are stored as single docs in a 'config' collection
// =====================================================

const CONFIG_DOC_ID = 'schedule';
const SITE_CONFIG_DOC_ID = 'siteSettings';

export const subscribeScheduleConfig = (callback: (cancelled: string[], specialEvents: string[]) => void): Unsubscribe => {
    const docRef = doc(db, 'config', CONFIG_DOC_ID);
    return onSnapshot(docRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            callback(data.cancelledDates || [], data.specialEventDates || []);
        } else {
            callback([], []);
        }
    }, (error) => {
        console.error('Error subscribing to schedule config:', error);
        callback([], []);
    });
};

export const saveCancelledDatesToDb = async (dates: string[]): Promise<void> => {
    const docRef = doc(db, 'config', CONFIG_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        await updateDoc(docRef, { cancelledDates: dates });
    } else {
        await setDoc(docRef, { cancelledDates: dates, specialEventDates: [] });
    }
};

export const saveSpecialEventDatesToDb = async (dates: string[]): Promise<void> => {
    const docRef = doc(db, 'config', CONFIG_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        await updateDoc(docRef, { specialEventDates: dates });
    } else {
        await setDoc(docRef, { cancelledDates: [], specialEventDates: dates });
    }
};

export const fetchSwapMeetBookings = async (): Promise<SwapMeetBooking[]> => {
    const q = query(collection(db, 'swapMeetBookings'), orderBy('userName', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id } as SwapMeetBooking));
};

export const subscribeSwapMeets = (
    callback: (swapMeets: SwapMeet[]) => void
): Unsubscribe => {
    const q = query(collection(db, 'swapMeetState'), orderBy('date', 'asc'));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SwapMeet)));
    }, (error) => {
        console.error('Error subscribing to swap meets:', error);
        callback([]);
    });
};

export const saveSwapMeet = async (
    swapMeet: Pick<SwapMeet, 'id' | 'date' | 'stallCount'>
): Promise<void> => {
    const matchingDates = await getDocs(query(
        collection(db, 'swapMeetState'),
        where('date', '==', swapMeet.date)
    ));
    if (matchingDates.docs.some(existingMeet => existingMeet.id !== swapMeet.id)) {
        throw new Error('A swap meet is already scheduled for this date.');
    }
    const bookings = await getDocs(query(
        collection(db, 'swapMeetBookings'),
        where('swapMeetId', '==', swapMeet.id)
    ));
    const bookedStallCount = bookings.docs
        .filter(booking => booking.data().status !== 'cancelled')
        .reduce((total, booking) => total + Number(booking.data().stallCount ?? 0), 0);
    if (bookedStallCount > swapMeet.stallCount) {
        throw new Error('The stall count cannot be lower than the booked half-table count.');
    }
    const now = Date.now();
    await setDoc(doc(db, 'swapMeetState', swapMeet.id), {
        date: swapMeet.date,
        stallCount: swapMeet.stallCount,
        updatedAt: now,
        createdAt: now,
        bookedStallCount,
    }, { merge: true });
};

export const deleteSwapMeet = async (swapMeetId: string): Promise<void> => {
    const bookings = await getDocs(query(
        collection(db, 'swapMeetBookings'),
        where('swapMeetId', '==', swapMeetId)
    ));
    const hasActiveBookings = bookings.docs.some(booking => booking.data().status !== 'cancelled');
    if (hasActiveBookings) {
        throw new Error('This swap meet has active bookings and cannot be deleted.');
    }
    await deleteDoc(doc(db, 'swapMeetState', swapMeetId));
};

export const subscribeSiteConfig = (
    callback: (showSwapMeetTab: boolean) => void
): Unsubscribe => {
    const docRef = doc(db, 'config', SITE_CONFIG_DOC_ID);
    return onSnapshot(docRef, (snapshot) => {
        callback(snapshot.exists() && snapshot.data().showSwapMeetTab === true);
    }, (error) => {
        console.error('Error subscribing to site config:', error);
        callback(false);
    });
};

export const saveShowSwapMeetTabToDb = async (
    showSwapMeetTab: boolean
): Promise<void> => {
    await setDoc(doc(db, 'config', SITE_CONFIG_DOC_ID), {
        showSwapMeetTab,
    }, { merge: true });
};

export const addAdminAuditEntry = async (
    entry: Omit<AdminAuditEntry, 'id'>
): Promise<void> => {
    const docRef = doc(collection(db, 'adminAudit'));
    await setDoc(docRef, { ...entry, id: docRef.id });
};

export const subscribeTerrainAudit = (
    callback: (entries: AdminAuditEntry[]) => void
): Unsubscribe => {
    const q = query(
        collection(db, 'adminAudit'),
        orderBy('timestamp', 'desc'),
        limit(50)
    );
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs
            .map(d => d.data() as AdminAuditEntry)
            .filter(entry => entry.entityType === 'terrain')
            .slice(0, 20));
    }, (error) => {
        console.error('Error subscribing to terrain audit:', error);
        callback([]);
    });
};

// =====================================================
// GAME SYSTEMS
// =====================================================

export const subscribeGameSystems = (callback: (gameSystems: string[]) => void): Unsubscribe => {
    const q = query(collection(db, 'gameSystems'));
    return onSnapshot(q, (snapshot) => {
        const names = snapshot.docs.map(d => d.data().name as string).filter(Boolean);
        names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        callback(names);
    }, (error) => {
        console.error('Error subscribing to game systems:', error);
        callback([]);
    });
};

export const fetchGameSystems = async (): Promise<string[]> => {
    const snapshot = await getDocs(collection(db, 'gameSystems'));
    const names = snapshot.docs.map(d => d.data().name as string).filter(Boolean);
    names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return names;
};

export const addGameSystem = async (name: string): Promise<void> => {
    const id = slugifyFirestoreId(name);
    const docRef = doc(db, 'gameSystems', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
        await setDoc(docRef, { name });
    }
};

export const renameGameSystem = async (oldName: string, newName: string): Promise<void> => {
    const trimmedNewName = newName.trim();
    if (!oldName || !trimmedNewName || oldName === trimmedNewName) {
        return;
    }

    const oldId = slugifyFirestoreId(oldName);
    const newId = slugifyFirestoreId(trimmedNewName);

    const bookingsSnap = await getDocs(collection(db, 'bookings'));
    const matchingBookings = bookingsSnap.docs.filter(d => d.data().gameSystem === oldName);

    const bookingChunks = chunkArray(matchingBookings, 450);

    const metaBatch = writeBatch(db);
    if (oldId !== newId) {
        metaBatch.delete(doc(db, 'gameSystems', oldId));
    }
    metaBatch.set(doc(db, 'gameSystems', newId), { name: trimmedNewName });
    bookingChunks[0]?.forEach(d => {
        metaBatch.update(doc(db, 'bookings', d.id), { gameSystem: trimmedNewName });
    });
    await metaBatch.commit();

    for (const chunk of bookingChunks.slice(1)) {
        const batch = writeBatch(db);
        chunk.forEach(d => {
            batch.update(doc(db, 'bookings', d.id), { gameSystem: trimmedNewName });
        });
        await batch.commit();
    }
};

export const deleteGameSystem = async (name: string): Promise<void> => {
    const id = slugifyFirestoreId(name);
    await deleteDoc(doc(db, 'gameSystems', id));
};

// =====================================================
// EVENTS
// =====================================================

export const subscribeEvents = (callback: (events: ClubEvent[]) => void): Unsubscribe => {
    const q = query(collection(db, 'events'), orderBy('startDate', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const events = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ClubEvent));
        callback(events);
    }, (error) => {
        console.error('Error subscribing to events:', error);
        callback([]);
    });
};

export const saveEvent = async (event: ClubEvent): Promise<void> => {
    await setDoc(doc(db, 'events', event.id), event);
};

export const deleteEvent = async (id: string): Promise<void> => {
    await deleteDoc(doc(db, 'events', id));
};

// =====================================================
// EVENT TAGS
// =====================================================

export const subscribeEventTags = (callback: (tags: string[]) => void): Unsubscribe => {
    const q = query(collection(db, 'eventTags'));
    return onSnapshot(q, (snapshot) => {
        const tags = snapshot.docs.map(d => d.data().name as string).filter(Boolean);
        tags.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        callback(tags);
    }, (error) => {
        console.error('Error subscribing to event tags:', error);
        callback([]);
    });
};

export const addEventTag = async (name: string): Promise<void> => {
    const id = slugifyFirestoreId(name);
    const docRef = doc(db, 'eventTags', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
        await setDoc(docRef, { name });
    }
};

export const deleteEventTag = async (name: string): Promise<void> => {
    const id = slugifyFirestoreId(name);
    await deleteDoc(doc(db, 'eventTags', id));
};
