import {describe, expect, it} from "vitest";
import {getDb} from "../adminApp";
import {checkCreatedAt} from "../checkCreatedAt.logic";

describe("checkCreatedAt (Firestore emulator)", () => {
  it(
    "counts users with and without createdAt and finds the earliest",
    async () => {
      const db = getDb();
      await db.collection("users").doc("user-1").set({
        createdAt: new Date("2025-01-01T00:00:00Z"),
      });
      await db.collection("users").doc("user-2").set({
        createdAt: new Date("2024-06-01T00:00:00Z"),
      });
      await db.collection("users").doc("user-3").set({
        name: "No timestamp",
      });

      const result = await checkCreatedAt(db);

      expect(result.withCount).toBe(2);
      expect(result.withoutCount).toBe(1);
      expect(result.earliest?.toISOString())
        .toBe("2024-06-01T00:00:00.000Z");
    },
  );

  it("reports an empty result when there are no users", async () => {
    const db = getDb();
    const result = await checkCreatedAt(db);

    expect(result).toEqual({withCount: 0, withoutCount: 0, earliest: null});
  });
});
