import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {getDb} from "../adminApp";
import {
  MAIL_COLLECTION,
  MailTriggerOptions,
  createMailTrigger,
  queueEmail,
} from "../mail";

const {createTransport, sendMail} = vi.hoisted(() => {
  const sendMail = vi.fn();
  return {sendMail, createTransport: vi.fn(() => ({sendMail}))};
});
vi.mock("nodemailer", () => ({createTransport}));

const db = getDb();

const PASSWORD_SECRET = "TEST_SMTP_PASSWORD";

const options: MailTriggerOptions = {
  region: "australia-southeast2",
  sender: {from: "committee@example.com", replyTo: "reply@example.com"},
  smtp: {
    host: "smtp.example.com",
    port: 465,
    user: "smtp-user",
    passwordSecret: PASSWORD_SECRET,
  },
};

const email = {
  to: "user1@example.com",
  subject: "Hello",
  html: "<p>Hi</p>",
};

/**
 * Queue an email and build the created event the trigger would receive.
 * @return {Promise<object>} The event, with its document snapshot.
 */
const queueAndMakeEvent = async () => {
  await queueEmail(db, email);
  const snap = await db.collection(MAIL_COLLECTION).get();
  const doc = snap.docs[snap.docs.length - 1];
  return {params: {emailId: doc.id}, data: doc};
};

describe("createMailTrigger (Firestore emulator)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMail.mockResolvedValue({messageId: "msg-1"});
    process.env[PASSWORD_SECRET] = "test-password";
  });

  afterEach(() => {
    delete process.env[PASSWORD_SECRET];
  });

  it(
    "triggers on outbox creates in the configured region, with the secret",
    () => {
      const endpoint = createMailTrigger(options).__endpoint;

      expect(endpoint.region).toEqual(["australia-southeast2"]);
      expect(endpoint.secretEnvironmentVariables)
        .toEqual([{key: PASSWORD_SECRET}]);
      expect(endpoint.eventTrigger).toMatchObject({
        eventType: "google.cloud.firestore.document.v1.created",
        eventFilterPathPatterns: {document: `${MAIL_COLLECTION}/{emailId}`},
      });
    },
  );

  it(
    "sends the queued email over SMTP using the secret as password",
    async () => {
      const trigger = createMailTrigger(options);
      const event = await queueAndMakeEvent();

      await trigger.run(event as never);

      expect(createTransport).toHaveBeenCalledWith({
        host: "smtp.example.com",
        port: 465,
        secure: true,
        auth: {user: "smtp-user", pass: "test-password"},
      });
      expect(sendMail).toHaveBeenCalledWith({...options.sender, ...email});
      const delivery = (await event.data.ref.get()).data()?.delivery;
      expect(delivery.state).toBe("SUCCESS");
    },
  );

  it("uses STARTTLS rather than implicit TLS off port 465", async () => {
    const trigger = createMailTrigger({
      ...options,
      smtp: {...options.smtp, port: 587},
    });

    await trigger.run(await queueAndMakeEvent() as never);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({port: 587, secure: false}),
    );
  });

  it("reuses one SMTP transport across invocations", async () => {
    const trigger = createMailTrigger(options);

    await trigger.run(await queueAndMakeEvent() as never);
    await trigger.run(await queueAndMakeEvent() as never);

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it("records the failure when the SMTP send fails", async () => {
    sendMail.mockRejectedValue(new Error("535 Authentication failed"));
    const trigger = createMailTrigger(options);
    const event = await queueAndMakeEvent();

    await trigger.run(event as never);

    const delivery = (await event.data.ref.get()).data()?.delivery;
    expect(delivery.state).toBe("ERROR");
    expect(delivery.error).toBe("535 Authentication failed");
  });

  it("ignores an event with no document data", async () => {
    const trigger = createMailTrigger(options);

    await trigger.run({params: {emailId: "x"}, data: undefined} as never);

    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});
