import {describe, expect, it} from "vitest";
import {getFirestore} from "firebase-admin/firestore";
import {
  onBookingCreated,
  onBookingUpdated,
  onMembershipAuditCreated,
  onSwapMeetBookingCreated,
  onSwapMeetBookingUpdated,
} from "../index";

const db = getFirestore();

const makeCreatedEvent = (
  params: Record<string, string>,
  data: Record<string, unknown>,
) => ({
  params,
  data: {data: () => data},
});

const makeUpdatedEvent = (
  params: Record<string, string>,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) => ({
  params,
  data: {
    before: {data: () => before},
    after: {data: () => after},
  },
});

const baseBooking = {
  id: "booking-1",
  date: "2026-03-10",
  tableId: "L1",
  memberId: "user-1",
  memberName: "User One",
  gameSystem: "Warhammer 40k",
  playerCount: 2,
  timestamp: 1000,
  status: "active",
};

describe("index.ts booking triggers (Firestore emulator)", () => {
  it("queues a confirmation email when a booking is created", async () => {
    await db.collection("users").doc("user-1").set({
      email: "user1@example.com",
    });
    await db.collection("tables").doc("L1").set({name: "Long Table 1"});

    await onBookingCreated.run(
      makeCreatedEvent({bookingId: "booking-1"}, baseBooking),
    );

    const mailSnap = await db.collection("mail").get();
    expect(mailSnap.docs).toHaveLength(1);
    const mail = mailSnap.docs[0].data();
    expect(mail.to).toEqual(["user1@example.com"]);
    expect(mail.message.subject).toContain("Booking Confirmed");
  });

  it(
    "sends nothing when the booking creator has no email on file",
    async () => {
      await onBookingCreated.run(makeCreatedEvent(
        {bookingId: "booking-1"},
        {...baseBooking, memberId: "missing-user"},
      ));

      const mailSnap = await db.collection("mail").get();
      expect(mailSnap.empty).toBe(true);
    },
  );

  it(
    "queues a cancellation email when a booking transitions to cancelled",
    async () => {
      await db.collection("users").doc("user-1").set({
        email: "user1@example.com",
      });
      await db.collection("tables").doc("L1").set({name: "Long Table 1"});

      const after = {...baseBooking, status: "cancelled"};
      await onBookingUpdated.run(
        makeUpdatedEvent({bookingId: "booking-1"}, baseBooking, after),
      );

      const mailSnap = await db.collection("mail").get();
      expect(mailSnap.docs).toHaveLength(1);
      expect(mailSnap.docs[0].data().message.subject)
        .toContain("Booking Cancelled");
    },
  );

  it(
    "queues a modification email when booking details change " +
    "while still active",
    async () => {
      await db.collection("users").doc("user-1").set({
        email: "user1@example.com",
      });
      await db.collection("tables").doc("L2").set({name: "Long Table 2"});

      const after = {...baseBooking, tableId: "L2"};
      await onBookingUpdated.run(
        makeUpdatedEvent({bookingId: "booking-1"}, baseBooking, after),
      );

      const mailSnap = await db.collection("mail").get();
      expect(mailSnap.docs).toHaveLength(1);
      expect(mailSnap.docs[0].data().message.subject)
        .toContain("Booking Updated");
    },
  );

  it(
    "sends no email when an update does not change anything meaningful",
    async () => {
      await db.collection("users").doc("user-1").set({
        email: "user1@example.com",
      });
      await db.collection("tables").doc("L1").set({name: "Long Table 1"});

      await onBookingUpdated.run(makeUpdatedEvent(
        {bookingId: "booking-1"}, baseBooking, {...baseBooking},
      ));

      const mailSnap = await db.collection("mail").get();
      expect(mailSnap.empty).toBe(true);
    },
  );
});

describe("index.ts membership audit trigger (Firestore emulator)", () => {
  it(
    "queues a membership activated email including the expiry date",
    async () => {
      await db.collection("users").doc("user-1").set({
        email: "user1@example.com",
        name: "User One",
        membershipExpiryDate: "2027-01-01",
      });

      await onMembershipAuditCreated.run(makeCreatedEvent(
        {entryId: "entry-1"},
        {
          id: "entry-1",
          userId: "user-1",
          action: "activated",
          performedBy: "admin-1",
          performedByName: "Admin",
          timestamp: 1000,
        },
      ));

      const mailSnap = await db.collection("mail").get();
      expect(mailSnap.docs).toHaveLength(1);
      expect(mailSnap.docs[0].data().message.subject)
        .toContain("Membership Activated");
    },
  );

  it(
    "sends nothing for a cancelled membership audit entry",
    async () => {
      await db.collection("users").doc("user-1").set({
        email: "user1@example.com",
        name: "User One",
        membershipExpiryDate: "2027-01-01",
      });

      await onMembershipAuditCreated.run(makeCreatedEvent(
        {entryId: "entry-1"},
        {
          id: "entry-1",
          userId: "user-1",
          action: "cancelled",
          performedBy: "admin-1",
          performedByName: "Admin",
          timestamp: 1000,
        },
      ));

      const mailSnap = await db.collection("mail").get();
      expect(mailSnap.empty).toBe(true);
    },
  );
});

describe("index.ts swap meet booking triggers (Firestore emulator)", () => {
  const baseSwapMeetBooking = {
    id: "sm-1",
    userId: "user-1",
    userName: "User One",
    stallCount: 2,
    amountOwed: 20,
    invoiced: false,
    createdAt: 1000,
    updatedAt: 1000,
  };

  it(
    "queues a \"received\" email for a pending swap meet booking",
    async () => {
      await db.collection("users").doc("user-1").set({
        email: "user1@example.com",
      });

      await onSwapMeetBookingCreated.run(makeCreatedEvent(
        {bookingId: "sm-1"},
        {...baseSwapMeetBooking, status: "pending", paid: false},
      ));

      const mailSnap = await db.collection("mail").get();
      expect(mailSnap.docs).toHaveLength(1);
      expect(mailSnap.docs[0].data().message.subject)
        .toBe("Swap Meet Booking Received");
    },
  );

  it(
    "queues cancellation emails to both the user and the committee " +
    "when cancelled",
    async () => {
      await db.collection("users").doc("user-1").set({
        email: "user1@example.com",
      });

      const before = {
        ...baseSwapMeetBooking, status: "confirmed", paid: true,
      };
      const after = {...before, status: "cancelled"};
      await onSwapMeetBookingUpdated.run(
        makeUpdatedEvent({bookingId: "sm-1"}, before, after),
      );

      const mailSnap = await db.collection("mail").get();
      const recipients = mailSnap.docs
        .map((doc) => doc.data().to[0]).sort();
      expect(recipients).toEqual([
        "axesandalescommittee@gmail.com", "user1@example.com",
      ]);
    },
  );

  it(
    "queues a confirmation email when a booking is marked paid",
    async () => {
      await db.collection("users").doc("user-1").set({
        email: "user1@example.com",
      });

      const before = {
        ...baseSwapMeetBooking, status: "pending", paid: false,
      };
      const after = {...before, status: "confirmed", paid: true};
      await onSwapMeetBookingUpdated.run(
        makeUpdatedEvent({bookingId: "sm-1"}, before, after),
      );

      const mailSnap = await db.collection("mail").get();
      expect(mailSnap.docs).toHaveLength(1);
      expect(mailSnap.docs[0].data().message.subject)
        .toBe("Swap Meet Booking Confirmed");
    },
  );
});
