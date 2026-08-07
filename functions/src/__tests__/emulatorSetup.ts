// Global setup for functions Firestore emulator smoke tests, loaded via
// vitest.emulator.config.ts's `setupFiles`. `firebase emulators:exec`
// (the "test:emulator" script) sets FIRESTORE_EMULATOR_HOST for this
// process automatically, so the Admin SDK (via getDb() in adminApp.ts)
// talks to the local emulator with no extra wiring.
import {beforeEach} from "vitest";

export const EMULATOR_PROJECT_ID = "demo-axesandales";
const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_PORT = 8080;

beforeEach(async () => {
  await fetch(
    `http://${EMULATOR_HOST}:${EMULATOR_PORT}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents`,
    {method: "DELETE"}
  );
});
