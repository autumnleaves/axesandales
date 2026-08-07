// Global setup for Firestore/Auth emulator smoke tests, loaded via
// vitest.emulator.config.ts's `setupFiles`. Points the app's real
// firebaseConfig db/auth at the local emulators (started by the
// "test:emulator" script) instead of mocking them, so the actual
// firebaseService.ts code runs against real Firestore/Auth semantics.
import { beforeEach, vi } from 'vitest';
import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

export const EMULATOR_PROJECT_ID = 'demo-axesandales';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const AUTH_HOST = '127.0.0.1';
const AUTH_PORT = 9099;

const app = initializeApp(
  // The Auth SDK validates apiKey is present before it ever talks to the
  // emulator; Firestore doesn't care, so this only exists to satisfy that
  // local check - the emulator never verifies it against a real project.
  { apiKey: 'fake-api-key', projectId: EMULATOR_PROJECT_ID },
  'firestore-emulator-smoke-tests'
);
const db = getFirestore(app);
connectFirestoreEmulator(db, FIRESTORE_HOST, FIRESTORE_PORT);

const auth = getAuth(app);
connectAuthEmulator(auth, `http://${AUTH_HOST}:${AUTH_PORT}`, { disableWarnings: true });

vi.mock('../firebaseConfig', () => ({
  db,
  auth,
}));

beforeEach(async () => {
  await fetch(
    `http://${FIRESTORE_HOST}:${FIRESTORE_PORT}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  await fetch(
    `http://${AUTH_HOST}:${AUTH_PORT}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/accounts`,
    { method: 'DELETE' }
  );
});
