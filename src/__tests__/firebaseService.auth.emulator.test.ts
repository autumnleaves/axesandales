import { describe, expect, it } from 'vitest';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { login, register } from '../services/firebaseService';

describe('firebaseService auth (Firestore + Auth emulator)', () => {
  it('registers a user with a matching Auth account and Firestore profile, then logs in with the same credentials', async () => {
    const email = 'newmember@example.com';
    const password = 'correct-horse-battery-staple';
    const name = 'New Member';

    const profile = await register(email, password, name);

    // Confirms register() wired (email, name) into the Firestore profile
    // without swapping them - both are plain strings, so TypeScript can't
    // catch a mix-up here on its own.
    expect(profile).toMatchObject({ email, name, isMember: false, isAdmin: false });
    const profileDoc = await getDoc(doc(db, 'users', profile.id));
    expect(profileDoc.data()).toMatchObject({ email, name });

    // Confirms register() wired (email, password) into the Auth SDK call
    // in the right slots: logging in with the same credentials must
    // succeed against the real emulator, not a mock that would pass
    // regardless of argument order.
    const loginResult = await login(email, password);
    expect(loginResult.user.uid).toBe(profile.id);
  });

  it('rejects login with the wrong password', async () => {
    const email = 'member@example.com';
    await register(email, 'correct-password', 'Member');

    await expect(login(email, 'wrong-password')).rejects.toThrow();
  });
});
