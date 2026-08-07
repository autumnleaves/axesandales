import {describe, expect, it} from "vitest";
import {getDb} from "../adminApp";
import {sendUnpaidReminders} from "../unpaidReminders.logic";

const daysAgo = (days: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

describe("sendUnpaidReminders (Firestore emulator)", () => {
  it(
    "reminds unpaid users created 14+ days ago, skipping " +
    "already-reminded, recent, and members",
    async () => {
      const db = getDb();
      await db.collection("users").doc("old-unpaid").set({
        isMember: false,
        email: "old@example.com",
        name: "Old Unpaid",
        createdAt: daysAgo(30),
      });
      await db.collection("users").doc("already-reminded").set({
        isMember: false,
        email: "already@example.com",
        name: "Already Reminded",
        createdAt: daysAgo(30),
        unpaidReminderLastSent: daysAgo(1),
      });
      await db.collection("users").doc("too-recent").set({
        isMember: false,
        email: "recent@example.com",
        name: "Too Recent",
        createdAt: daysAgo(2),
      });
      await db.collection("users").doc("now-a-member").set({
        isMember: true,
        email: "member@example.com",
        name: "Now A Member",
        createdAt: daysAgo(30),
      });

      const result = await sendUnpaidReminders(db);
      expect(result).toEqual({sent: 1, skipped: 1});

      const mailSnap = await db.collection("mail").get();
      const recipients = mailSnap.docs.map((doc) => doc.data().to[0]);
      expect(recipients).toEqual(["old@example.com"]);
    },
  );

  it("sends nothing when there are no unpaid members", async () => {
    const db = getDb();
    const result = await sendUnpaidReminders(db);

    expect(result).toEqual({sent: 0, skipped: 0});
  });
});
