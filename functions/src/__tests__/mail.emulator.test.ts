import {describe, expect, it, vi} from "vitest";
import {getDb} from "../adminApp";
import {
  MAIL_COLLECTION,
  MailTransport,
  deliverQueuedEmail,
  queueEmail,
} from "../mail";

const db = getDb();

const sender = {
  from: "committee@example.com",
  replyTo: "reply@example.com",
};

const email = {
  to: "user1@example.com",
  subject: "Hello",
  html: "<p>Hi</p>",
};

const makeTransport = (
  impl: MailTransport["sendMail"] =
  async () => ({messageId: "msg-1"}),
) => ({sendMail: vi.fn(impl)});

const queueOne = async () => {
  await queueEmail(db, email);
  const snap = await db.collection(MAIL_COLLECTION).get();
  return snap.docs[0].ref;
};

describe("queueEmail (Firestore emulator)", () => {
  it("writes an undelivered email to the outbox", async () => {
    await queueEmail(db, email);

    const snap = await db.collection(MAIL_COLLECTION).get();
    expect(snap.docs).toHaveLength(1);
    const doc = snap.docs[0].data();
    expect(doc).toMatchObject(email);
    expect(doc.createdAt).toBeDefined();
    expect(doc.delivery).toBeUndefined();
  });
});

describe("deliverQueuedEmail (Firestore emulator)", () => {
  it("sends the email from the sender and records success", async () => {
    const ref = await queueOne();
    const transport = makeTransport();

    const state = await deliverQueuedEmail(ref, transport, sender);

    expect(state).toBe("SUCCESS");
    expect(transport.sendMail).toHaveBeenCalledWith({...sender, ...email});
    const delivery = (await ref.get()).data()?.delivery;
    expect(delivery.state).toBe("SUCCESS");
    expect(delivery.messageId).toBe("msg-1");
    expect(delivery.startTime).toBeDefined();
    expect(delivery.endTime).toBeDefined();
  });

  it("records the error when sending fails", async () => {
    const ref = await queueOne();
    const transport = makeTransport(async () => {
      throw new Error("SMTP unavailable");
    });

    const state = await deliverQueuedEmail(ref, transport, sender);

    expect(state).toBe("ERROR");
    const delivery = (await ref.get()).data()?.delivery;
    expect(delivery.state).toBe("ERROR");
    expect(delivery.error).toBe("SMTP unavailable");
  });

  it("does not resend an email that was already delivered", async () => {
    const ref = await queueOne();
    const transport = makeTransport();

    await deliverQueuedEmail(ref, transport, sender);
    const state = await deliverQueuedEmail(ref, transport, sender);

    expect(state).toBeNull();
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });

  it(
    "sends only once when invoked twice concurrently for one email",
    async () => {
      const ref = await queueOne();
      const transport = makeTransport();

      const states = await Promise.all([
        deliverQueuedEmail(ref, transport, sender),
        deliverQueuedEmail(ref, transport, sender),
      ]);

      expect(states.sort()).toEqual(["SUCCESS", null].sort());
      expect(transport.sendMail).toHaveBeenCalledTimes(1);
    },
  );

  it("does nothing when the document no longer exists", async () => {
    const ref = db.collection(MAIL_COLLECTION).doc("missing");
    const transport = makeTransport();

    const state = await deliverQueuedEmail(ref, transport, sender);

    expect(state).toBeNull();
    expect(transport.sendMail).not.toHaveBeenCalled();
  });
});
