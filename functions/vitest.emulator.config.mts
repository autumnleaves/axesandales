import { defineConfig } from 'vitest/config';

// Emulator smoke tests for functions/src, run via the "test:emulator"
// script (wrapped in `firebase emulators:exec`, which sets
// FIRESTORE_EMULATOR_HOST automatically — the Admin SDK picks that up
// on its own, no manual emulator-connect call needed here).
export default defineConfig({
  test: {
    include: ['src/**/*.emulator.test.ts'],
    setupFiles: ['src/__tests__/emulatorSetup.ts'],
    testTimeout: 15000,
    // All emulator test files share one live Firestore emulator/database
    // and a global "clear everything" beforeEach, so files must not run
    // concurrently or they stomp on each other's data.
    fileParallelism: false,
  },
});
