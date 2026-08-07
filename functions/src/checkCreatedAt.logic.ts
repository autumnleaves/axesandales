/**
 * Check createdAt field status across all users.
 */
import type {Firestore} from "firebase-admin/firestore";

export interface CheckCreatedAtResult {
  withCount: number;
  withoutCount: number;
  earliest: Date | null;
}

/**
 * Reports how many user docs have/lack a createdAt field.
 * @param {Firestore} db - Firestore instance.
 * @return {Promise<CheckCreatedAtResult>} Summary of the check.
 */
export async function checkCreatedAt(
  db: Firestore,
): Promise<CheckCreatedAtResult> {
  const snap = await db.collection("users").get();
  let earliest: Date | null = null;
  let withCount = 0;
  let withoutCount = 0;

  for (const doc of snap.docs) {
    const ca = doc.data().createdAt;
    if (ca) {
      withCount++;
      const d = ca.toDate ? ca.toDate() : new Date(ca);
      if (!earliest || d < earliest) earliest = d;
    } else {
      withoutCount++;
    }
  }

  console.log("Users with createdAt:", withCount);
  console.log("Users without createdAt:", withoutCount);
  console.log("Earliest createdAt:", earliest?.toISOString() ?? "none");

  return {withCount, withoutCount, earliest};
}
