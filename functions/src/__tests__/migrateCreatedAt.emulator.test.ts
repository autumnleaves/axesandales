import {describe, expect, it} from "vitest";
import type {Auth} from "firebase-admin/auth";
import {getDb} from "../adminApp";
import {migrateCreatedAt} from "../migrateCreatedAt.logic";

// migrateCreatedAt only calls auth.listUsers(), so a minimal stub covers
// it without standing up the Auth emulator for this one function.
const makeFakeAuth = (records: Record<string, string>): Auth => ({
  listUsers: async () => ({
    users: Object.entries(records).map(([uid, creationTime]) => ({
      uid,
      metadata: {creationTime},
    })),
    pageToken: undefined,
  }),
}) as unknown as Auth;

describe("migrateCreatedAt (Firestore emulator)", () => {
  it(
    "backfills createdAt from Auth metadata for users missing it",
    async () => {
      const db = getDb();
      await db.collection("users").doc("user-1").set({
        name: "Needs Backfill",
      });
      await db.collection("users").doc("user-2").set({
        name: "Already Has It",
        createdAt: new Date("2024-01-01"),
      });
      await db.collection("users").doc("user-3").set({
        name: "No Auth Record",
      });

      const fakeAuth = makeFakeAuth({
        "user-1": "2023-05-01T00:00:00.000Z",
        "user-2": "2020-01-01T00:00:00.000Z",
      });

      const result = await migrateCreatedAt(db, fakeAuth);
      expect(result).toEqual({updated: 1, skipped: 2, failed: 0});

      const backfilled = await db.collection("users")
        .doc("user-1").get();
      expect(backfilled.data()?.createdAt.toDate().toISOString())
        .toBe("2023-05-01T00:00:00.000Z");

      const untouched = await db.collection("users")
        .doc("user-2").get();
      expect(untouched.data()?.createdAt.toDate().toISOString())
        .toBe("2024-01-01T00:00:00.000Z");
    },
  );

  it("does nothing when there are no users", async () => {
    const db = getDb();
    const result = await migrateCreatedAt(db, makeFakeAuth({}));

    expect(result).toEqual({updated: 0, skipped: 0, failed: 0});
  });
});
