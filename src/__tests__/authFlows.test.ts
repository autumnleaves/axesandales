import { describe, expect, it, vi } from 'vitest';
import { assertAuthenticatedUser, resolveGoogleSignInProfile } from '../services/authFlows';
import type { User } from '../types';

describe('resolveGoogleSignInProfile', () => {
  const existingProfile: User = {
    id: 'user-1',
    email: 'existing@example.com',
    name: 'Existing User',
    isMember: true,
  };

  it('returns the existing profile without creating one when it already exists', async () => {
    const lookupProfile = vi.fn().mockResolvedValue(existingProfile);
    const createProfile = vi.fn();

    const result = await resolveGoogleSignInProfile(
      { uid: 'user-1', email: 'existing@example.com', displayName: 'Existing User' },
      lookupProfile,
      createProfile,
    );

    expect(result).toEqual({ user: existingProfile, isNewUser: false });
    expect(lookupProfile).toHaveBeenCalledWith('user-1');
    expect(createProfile).not.toHaveBeenCalled();
  });

  it('creates a pending profile using the Google account email and display name when none exists', async () => {
    const lookupProfile = vi.fn().mockResolvedValue(null);
    const newProfile: User = { id: 'user-2', email: 'new@example.com', name: 'New Person', isMember: false, isAdmin: false };
    const createProfile = vi.fn().mockResolvedValue(newProfile);

    const result = await resolveGoogleSignInProfile(
      { uid: 'user-2', email: 'new@example.com', displayName: 'New Person' },
      lookupProfile,
      createProfile,
    );

    expect(createProfile).toHaveBeenCalledWith('user-2', 'new@example.com', 'New Person');
    expect(result).toEqual({ user: newProfile, isNewUser: true });
  });

  it('falls back to the email as the display name when Google provides no display name', async () => {
    const lookupProfile = vi.fn().mockResolvedValue(null);
    const createProfile = vi.fn().mockResolvedValue({} as User);

    await resolveGoogleSignInProfile(
      { uid: 'user-3', email: 'noname@example.com', displayName: null },
      lookupProfile,
      createProfile,
    );

    expect(createProfile).toHaveBeenCalledWith('user-3', 'noname@example.com', 'noname@example.com');
  });

  it('falls back to "New User" when Google provides neither an email nor a display name', async () => {
    const lookupProfile = vi.fn().mockResolvedValue(null);
    const createProfile = vi.fn().mockResolvedValue({} as User);

    await resolveGoogleSignInProfile(
      { uid: 'user-4', email: null, displayName: null },
      lookupProfile,
      createProfile,
    );

    expect(createProfile).toHaveBeenCalledWith('user-4', '', 'New User');
  });
});

describe('assertAuthenticatedUser', () => {
  it('returns the user when one is signed in', () => {
    const user = { uid: 'user-1' };
    expect(assertAuthenticatedUser(user)).toBe(user);
  });

  it('throws when no user is signed in', () => {
    expect(() => assertAuthenticatedUser(null)).toThrow('No authenticated user found.');
  });
});
