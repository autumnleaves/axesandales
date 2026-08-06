// Global setup for Firestore emulator smoke tests, loaded via
// vitest.emulator.config.ts's `setupFiles`. Points the app's real
// firebaseConfig db/auth at the local emulator (started by the
// "test:emulator" script) instead of mocking Firestore, so the actual
// firebaseService.ts code runs against real Firestore semantics.
import { beforeEach, vi } from 'vitest';
import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

export const EMULATOR_PROJECT_ID = 'demo-axesandales';
const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8080;

const app = initializeApp({ projectId: EMULATOR_PROJECT_ID }, 'firestore-emulator-smoke-tests');
const db = getFirestore(app);
connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORT);

vi.mock('../firebaseConfig', () => ({
  db,
  auth: { currentUser: null },
}));

beforeEach(async () => {
  await fetch(
    `http://${EMULATOR_HOST}:${EMULATOR_PORT}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
});
