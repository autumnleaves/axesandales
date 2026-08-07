import { User } from '../types';

// The subset of a Firebase Auth UserCredential.user we actually read.
export interface AuthProviderUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface GoogleSignInResolution {
  user: User;
  isNewUser: boolean;
}

// Decides whether a just-authenticated Google user already has a profile,
// or needs a new pending one created. Firebase's own `isNewUser` flag
// (via getAdditionalUserInfo) reflects "new to this sign-in provider," not
// "new to this app" — a user could already have an email/password account
// and be linking Google for the first time — so this checks our own
// Firestore profile instead.
export const resolveGoogleSignInProfile = async (
  authUser: AuthProviderUser,
  lookupProfile: (uid: string) => Promise<User | null>,
  createProfile: (uid: string, email: string, name: string) => Promise<User>
): Promise<GoogleSignInResolution> => {
  const existing = await lookupProfile(authUser.uid);
  if (existing) return { user: existing, isNewUser: false };

  const newUser = await createProfile(
    authUser.uid,
    authUser.email || '',
    authUser.displayName || authUser.email || 'New User'
  );
  return { user: newUser, isNewUser: true };
};

// Guards changePassword: Firebase's updatePassword requires a signed-in
// user, but throws a generic SDK error if currentUser is null. This gives
// a clearer, app-specific error instead.
export const assertAuthenticatedUser = <T extends { uid: string }>(
  currentUser: T | null
): T => {
  if (!currentUser) {
    throw new Error('No authenticated user found.');
  }
  return currentUser;
};
