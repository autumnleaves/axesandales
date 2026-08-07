import {describe, expect, it} from "vitest";
import {getDb} from "../adminApp";
import {sendMembershipReminders} from "../membershipReminders.logic";

const getDateInDays = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
};

describe("sendMembershipReminders (Firestore emulator)", () => {
  it(
    "queues reminder emails for members expiring in 30 or 7 days, " +
    "skipping others",
    async () => {
      const db = getDb();
      await db.collection("users").doc("user-30").set({
        isMember: true,
        email: "thirty@example.com",
        name: "Thirty Days",
        membershipExpiryDate: getDateInDays(30),
      });
      await db.collection("users").doc("user-7").set({
        isMember: true,
        email: "seven@example.com",
        name: "Seven Days",
        membershipExpiryDate: getDateInDays(7),
      });
      await db.collection("users").doc("user-not-due").set({
        isMember: true,
        email: "later@example.com",
        name: "Not Due Yet",
        membershipExpiryDate: getDateInDays(15),
      });
      await db.collection("users").doc("user-missing-email").set({
        isMember: true,
        name: "No Email",
        membershipExpiryDate: getDateInDays(30),
      });

      const result = await sendMembershipReminders(db);
      expect(result.totalSent).toBe(2);

      const mailSnap = await db.collection("mail").get();
      const recipients = mailSnap.docs
        .map((doc) => doc.data().to[0]).sort();
      expect(recipients).toEqual([
        "seven@example.com", "thirty@example.com",
      ]);
    },
  );

  it("sends nothing when no memberships are due", async () => {
    const db = getDb();
    const result = await sendMembershipReminders(db);

    expect(result.totalSent).toBe(0);
    const mailSnap = await db.collection("mail").get();
    expect(mailSnap.empty).toBe(true);
  });
});
