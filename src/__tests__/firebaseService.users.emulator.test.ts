import { describe, expect, it } from 'vitest';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  addMembershipAuditEntry,
  createPendingProfile,
  deleteUser,
  getAllUsers,
  getUserProfile,
  subscribeMembershipAudit,
  subscribeUsers,
  updateDisplayName,
  updateUserProfile,
} from '../services/firebaseService';
import { waitFor } from './emulatorTestUtils';
import type { MembershipAuditEntry, User } from '../types';

describe('firebaseService users (Firestore emulator)', () => {
  it('returns null for a user profile that does not exist', async () => {
    await expect(getUserProfile('missing-user')).resolves.toBeNull();
  });

  it('creates a pending profile and reads it back', async () => {
    const profile = await createPendingProfile('user-1', 'test@example.com', 'Test User');
    expect(profile).toMatchObject({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      isMember: false,
      isAdmin: false,
    });

    const fetched = await getUserProfile('user-1');
    expect(fetched).toMatchObject({ id: 'user-1', email: 'test@example.com', name: 'Test User' });
  });

  it('updates a user profile', async () => {
    await createPendingProfile('user-2', 'a@example.com', 'Original Name');
    await updateUserProfile('user-2', { isMember: true, name: 'Updated Name' });

    const fetched = await getUserProfile('user-2');
    expect(fetched).toMatchObject({ name: 'Updated Name', isMember: true });
  });

  it('deletes a user profile', async () => {
    await createPendingProfile('user-3', 'b@example.com', 'To Delete');
    await deleteUser('user-3');

    await expect(getUserProfile('user-3')).resolves.toBeNull();
  });

  it('lists all users', async () => {
    await createPendingProfile('user-4', 'c@example.com', 'User Four');
    await createPendingProfile('user-5', 'd@example.com', 'User Five');

    const all = await getAllUsers();
    expect(all.map((u) => u.id).sort()).toEqual(['user-4', 'user-5']);
  });

  it('subscribes to users sorted by name', async () => {
    await createPendingProfile('user-6', 'e@example.com', 'Zed');
    await createPendingProfile('user-7', 'f@example.com', 'Alice');

    let latest: User[] | undefined;
    const unsubscribe = subscribeUsers((users) => { latest = users; });
    await waitFor(() => latest !== undefined && latest.length === 2);

    expect(latest!.map((u) => u.name)).toEqual(['Alice', 'Zed']);
    unsubscribe();
  });

  it('propagates a profile name change to every booking by that member', async () => {
    await createPendingProfile('user-8', 'g@example.com', 'Old Name');
    await setDoc(doc(db, 'bookings', 'booking-a'), { memberId: 'user-8', memberName: 'Old Name' });
    await setDoc(doc(db, 'bookings', 'booking-b'), { memberId: 'someone-else', memberName: 'Someone Else' });

    await updateDisplayName('user-8', 'New Name');

    const updatedBooking = await getDoc(doc(db, 'bookings', 'booking-a'));
    const untouchedBooking = await getDoc(doc(db, 'bookings', 'booking-b'));
    expect(updatedBooking.data()?.memberName).toBe('New Name');
    expect(untouchedBooking.data()?.memberName).toBe('Someone Else');
  });

  it('records and subscribes to membership audit entries scoped to a single user', async () => {
    await addMembershipAuditEntry({
      userId: 'user-9',
      action: 'activated',
      performedBy: 'admin-1',
      performedByName: 'Admin One',
      timestamp: 1000,
    });
    await addMembershipAuditEntry({
      userId: 'someone-else',
      action: 'activated',
      performedBy: 'admin-1',
      performedByName: 'Admin One',
      timestamp: 1000,
    });

    let latest: MembershipAuditEntry[] | undefined;
    const unsubscribe = subscribeMembershipAudit('user-9', (entries) => { latest = entries; });
    await waitFor(() => latest !== undefined && latest.length === 1);

    expect(latest![0].userId).toBe('user-9');
    unsubscribe();
  });
});
