import {describe, expect, it} from "vitest";
import {getDb} from "../adminApp";
import {sendNewUserReminders} from "../newUserReminders.logic";

const daysAgo = (days: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

describe("sendNewUserReminders (Firestore emulator)", () => {
  it(
    "reminds unpaid users created 14-15 days ago, skipping " +
    "already-reminded and members",
    async () => {
      const db = getDb();
      await db.collection("users").doc("in-window").set({
        isMember: false,
        email: "in-window@example.com",
        name: "In Window",
        createdAt: daysAgo(14.5),
      });
      await db.collection("users").doc("already-reminded").set({
        isMember: false,
        email: "already@example.com",
        name: "Already Reminded",
        createdAt: daysAgo(14.5),
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
        createdAt: daysAgo(14.5),
      });

      const result = await sendNewUserReminders(db);
      expect(result).toEqual({sent: 1, skipped: 1});

      const mailSnap = await db.collection("mail").get();
      const recipients = mailSnap.docs.map((doc) => doc.data().to[0]);
      expect(recipients).toEqual(["in-window@example.com"]);

      const remindedUser = await db.collection("users")
        .doc("in-window").get();
      expect(remindedUser.data()?.unpaidReminderLastSent).toBeDefined();
    },
  );

  it("sends nothing when no users fall in the window", async () => {
    const db = getDb();
    const result = await sendNewUserReminders(db);

    expect(result).toEqual({sent: 0, skipped: 0});
  });
});
