/**
 * Delivery of a single queued email. Kept free of the Cloud Functions
 * runtime and of any particular mail library so it can be exercised
 * against the Firestore emulator with a fake transport.
 */
import type {DocumentReference} from "firebase-admin/firestore";
import {FieldValue} from "firebase-admin/firestore";
import type {DeliveryState, QueuedEmail} from "./queue";

export interface MailMessage {
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  html: string;
}

/** The subset of a nodemailer Transporter that delivery relies on. */
export interface MailTransport {
  sendMail(message: MailMessage): Promise<{messageId?: string}>;
}

export interface Sender {
  from: string;
  replyTo?: string;
}

/**
 * Send a queued email and record the outcome on its document.
 *
 * Firestore triggers are delivered at least once, so the document is
 * claimed in a transaction first: only the invocation that moves it
 * into PROCESSING sends it, and any duplicate invocation is a no-op.
 * @param {DocumentReference} ref - The outbox document.
 * @param {MailTransport} transport - Transport used to send.
 * @param {Sender} sender - From and reply-to addresses.
 * @return {Promise<DeliveryState | null>} The final delivery state, or
 * null if the document was missing or already claimed.
 */
export async function deliverQueuedEmail(
  ref: DocumentReference,
  transport: MailTransport,
  sender: Sender,
): Promise<DeliveryState | null> {
  const email = await ref.firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as QueuedEmail | undefined;
    if (!data || data.delivery) return null;
    tx.update(ref, {
      delivery: {
        state: "PROCESSING",
        startTime: FieldValue.serverTimestamp(),
      },
    });
    return data;
  });
  if (!email) return null;

  try {
    const info = await transport.sendMail({
      ...sender,
      to: email.to,
      subject: email.subject,
      html: email.html,
    });
    await ref.update({
      "delivery.state": "SUCCESS",
      "delivery.endTime": FieldValue.serverTimestamp(),
      ...(info.messageId ? {"delivery.messageId": info.messageId} : {}),
    });
    return "SUCCESS";
  } catch (err) {
    await ref.update({
      "delivery.state": "ERROR",
      "delivery.endTime": FieldValue.serverTimestamp(),
      "delivery.error": err instanceof Error ? err.message : String(err),
    });
    return "ERROR";
  }
}
