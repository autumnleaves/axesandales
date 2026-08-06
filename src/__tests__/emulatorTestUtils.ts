// Shared helpers for Firestore emulator smoke tests (*.emulator.test.ts).
// These tests run against a real local Firestore emulator (see
// package.json's "test:emulator" script and vitest.emulator.config.ts),
// not mocks, so they exercise genuine query/transaction/batch behavior.

// Polls until `predicate` returns true, for asserting on onSnapshot listener
// callbacks that fire asynchronously.
export async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}
