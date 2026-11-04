import {describe, expect, it, vi} from "vitest";
import {getDb} from "../adminApp";
import {
  COMMITTEE_EMAIL,
  PAYPAL_LEDGER_COLLECTION,
  SYNC_PERFORMED_BY,
  computeNewExpiry,
  syncPayPalMemberships,
} from "../paypalMembershipSync.logic";
import {MAIL_COLLECTION} from "../mail";
import type {PayPalTransaction} from "../paypal";

const NOW = new Date("2026-11-03T21:00:00Z");
const TODAY = "2026-11-03";

let txnCounter = 0;
const payment = (overrides: {
  id?: string;
  payerEmail?: string;
  note?: string;
  amount?: string;
  date?: string;
  eventCode?: string;
} = {}): PayPalTransaction => ({
  transaction_info: {
    transaction_id: overrides.id ?? `TXN${++txnCounter}`,
    transaction_event_code: overrides.eventCode ?? "T0000",
    transaction_initiation_date: overrides.date ?? "2026-11-02T10:00:00Z",
    transaction_amount: {
      currency_code: "AUD",
      value: overrides.amount ?? "60.00",
    },
    transaction_status: "S",
    transaction_note: overrides.note,
  },
  payer_info: {
    email_address: overrides.payerEmail ?? "someone@paypal.example",
    payer_name: {given_name: "Pat", surname: "Payer"},
  },
});

const sync = (txns: PayPalTransaction[]) =>
  syncPayPalMemberships(getDb(), txns, {now: NOW});

const committeeMail = async () => {
  const snap = await getDb().collection(MAIL_COLLECTION)
    .where("to", "==", COMMITTEE_EMAIL).get();
  return snap.docs.map((d) => d.data());
};

const auditEntries = async () => {
  const snap = await getDb().collection("membershipAudit").get();
  return snap.docs.map((d) => d.data());
};

describe("computeNewExpiry", () => {
  it("extends an active membership from its current expiry", () => {
    expect(computeNewExpiry("2026-12-01", TODAY)).toBe("2027-12-02");
  });

  it("starts from today for expired or new memberships", () => {
    expect(computeNewExpiry("2026-01-01", TODAY)).toBe("2027-11-04");
    expect(computeNewExpiry(undefined, TODAY)).toBe("2027-11-04");
  });

  it("caps at 18 months from today", () => {
    expect(computeNewExpiry("2027-12-01", TODAY)).toBe("2028-05-03");
  });
});

describe("syncPayPalMemberships (Firestore emulator)", () => {
  it("renews a member matched by PayPal email (case-insensitive)", async () => {
    const db = getDb();
    await db.collection("users").doc("u1").set({
      email: "Member@Example.com",
      name: "Member One",
      isMember: true,
      membershipPaidDate: "2025-11-01",
      membershipExpiryDate: "2026-11-02",
    });

    const result = await sync([
      payment({id: "A1", payerEmail: "member@example.com"}),
    ]);

    expect(result).toMatchObject({applied: 1, manualReview: 0});
    const user = (await db.collection("users").doc("u1").get()).data();
    expect(user).toMatchObject({
      isMember: true,
      membershipPaidDate: "2026-11-02",
      membershipExpiryDate: "2027-11-04",
    });
    const audit = await auditEntries();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      userId: "u1", action: "renewed", performedBy: SYNC_PERFORMED_BY,
    });
    const ledger = (await db.collection(PAYPAL_LEDGER_COLLECTION)
      .doc("A1").get()).data();
    expect(ledger).toMatchObject({
      status: "applied", userId: "u1", matchedBy: "payer_email",
    });
    expect(await committeeMail()).toHaveLength(0);
  });

  it("activates a pending user matched by an email in the note", async () => {
    const db = getDb();
    await db.collection("users").doc("u2").set({
      email: "newbie@example.com",
      name: "New Member",
      isMember: false,
    });

    const result = await sync([
      payment({note: "Membership for NEWBIE@example.com thanks!"}),
    ]);

    expect(result.applied).toBe(1);
    const user = (await db.collection("users").doc("u2").get()).data();
    expect(user).toMatchObject({
      isMember: true,
      membershipPaidDate: "2026-11-02",
      membershipExpiryDate: "2027-11-04",
    });
    expect((await auditEntries())[0]).toMatchObject({action: "activated"});
  });

  it("never applies the same payment twice across runs", async () => {
    const db = getDb();
    await db.collection("users").doc("u1").set({
      email: "member@example.com", name: "M", isMember: true,
    });
    const txn = payment({payerEmail: "member@example.com"});

    await sync([txn]);
    const second = await sync([txn]);

    expect(second).toMatchObject({applied: 0, previouslyProcessed: 1});
    expect(await auditEntries()).toHaveLength(1);
  });

  it("skips payments already renewed by hand on or after the payment date",
    async () => {
      const db = getDb();
      await db.collection("users").doc("u1").set({
        email: "member@example.com",
        name: "M",
        isMember: true,
        membershipPaidDate: "2026-11-03",
        membershipExpiryDate: "2027-11-04",
      });

      const result = await sync([payment({payerEmail: "member@example.com"})]);

      expect(result).toMatchObject({applied: 0, alreadyApplied: 1});
      const user = (await db.collection("users").doc("u1").get()).data();
      expect(user?.membershipExpiryDate).toBe("2027-11-04");
      expect(await auditEntries()).toHaveLength(0);
      expect(await committeeMail()).toHaveLength(0);
    });

  it("flags a payment shortly after the last renewal as a possible duplicate",
    async () => {
      const db = getDb();
      await db.collection("users").doc("u1").set({
        email: "member@example.com",
        name: "M",
        isMember: true,
        membershipPaidDate: "2026-10-20",
        membershipExpiryDate: "2027-10-21",
      });

      const result = await sync([payment({payerEmail: "member@example.com"})]);

      expect(result).toMatchObject({applied: 0, manualReview: 1});
      const mail = await committeeMail();
      expect(mail).toHaveLength(1);
      expect(mail[0].html).toContain("duplicate");
      expect(mail[0].html).toContain("member@example.com");
    });

  it("flags two payments from the same member in one run", async () => {
    const db = getDb();
    await db.collection("users").doc("u1").set({
      email: "member@example.com", name: "M", isMember: false,
    });

    const result = await sync([
      payment({payerEmail: "member@example.com", date: "2026-11-01T10:00:00Z"}),
      payment({payerEmail: "member@example.com", date: "2026-11-02T10:00:00Z"}),
    ]);

    expect(result).toMatchObject({applied: 1, manualReview: 1});
    expect(await auditEntries()).toHaveLength(1);
  });

  it("flags payer and note pointing at different accounts", async () => {
    const db = getDb();
    await db.collection("users").doc("u1").set({
      email: "payer@example.com", name: "Payer", isMember: true,
    });
    await db.collection("users").doc("u2").set({
      email: "partner@example.com", name: "Partner", isMember: false,
    });

    const result = await sync([payment({
      payerEmail: "payer@example.com",
      note: "This is for partner@example.com",
    })]);

    expect(result).toMatchObject({applied: 0, manualReview: 1});
  });

  it("emails the committee once about unmatched payments, escaping notes, " +
    "and applies them once the account exists", async () => {
    const db = getDb();
    const txn = payment({
      id: "U1",
      payerEmail: "stranger@paypal.example",
      note: "<b>hi</b> from late@example.com",
    });

    const first = await sync([txn]);
    expect(first).toMatchObject({manualReview: 1, committeeNotified: true});
    const mail = await committeeMail();
    expect(mail).toHaveLength(1);
    expect(mail[0].html).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(mail[0].html).toContain("U1");

    const second = await sync([txn]);
    expect(second).toMatchObject({manualReview: 1, committeeNotified: false});
    expect(await committeeMail()).toHaveLength(1);

    await db.collection("users").doc("late").set({
      email: "late@example.com", name: "Late Signup", isMember: false,
    });
    const third = await sync([txn]);
    expect(third.applied).toBe(1);
    const ledger = (await db.collection(PAYPAL_LEDGER_COLLECTION)
      .doc("U1").get()).data();
    expect(ledger?.status).toBe("applied");
  });

  it("flags a member with an unpaid swap meet booking for the same amount",
    async () => {
      const db = getDb();
      await db.collection("users").doc("u1").set({
        email: "member@example.com", name: "M", isMember: true,
      });
      await db.collection("swapMeetBookings").doc("b1").set({
        userId: "u1", amountOwed: 60, paid: false, status: "pending",
      });

      const result = await sync([payment({payerEmail: "member@example.com"})]);

      expect(result).toMatchObject({applied: 0, manualReview: 1});
    });

  it("never writes names or emails to the (public) run log", async () => {
    const db = getDb();
    await db.collection("users").doc("u1").set({
      email: "member@example.com", name: "Member One", isMember: false,
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await sync([
        payment({payerEmail: "member@example.com"}),
        payment({payerEmail: "stranger@paypal.example",
          note: "for nobody@example.com"}),
        payment({payerEmail: "member@example.com", amount: "20.00"}),
      ]);
      const output = log.mock.calls.flat().join("\n");
      expect(output).toContain("activated user u1");
      expect(output).toContain("ignored, not the membership fee");
      expect(output).not.toContain("@");
      expect(output).not.toContain("Pat Payer");
    } finally {
      log.mockRestore();
    }
  });

  it("ignores non-membership transactions", async () => {
    const db = getDb();
    await db.collection("users").doc("u1").set({
      email: "member@example.com", name: "M", isMember: false,
    });

    const result = await sync([
      payment({payerEmail: "member@example.com", amount: "20.00"}),
      payment({payerEmail: "member@example.com", eventCode: "T1107"}),
      payment({payerEmail: "member@example.com", note: "Swap meet stall"}),
    ]);

    expect(result).toMatchObject({applied: 0, manualReview: 0, ignored: 3});
    expect(await committeeMail()).toHaveLength(0);
  });
});
