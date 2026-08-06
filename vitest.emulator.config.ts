import { defineConfig } from 'vitest/config';

// Separate config for Firestore emulator smoke tests, run via the
// "test:emulator" script (wrapped in `firebase emulators:exec`). Kept apart
// from the default vitest run so `npm test` never requires a local emulator.
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
