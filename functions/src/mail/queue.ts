/**
 * Outbound email queue. Callers write a document to the outbox
 * collection; the mail trigger (see trigger.ts) picks it up and sends it.
 *
 * Queueing rather than sending inline keeps each email's delivery
 * independent: a failure sending one email doesn't fail (or, on retry,
 * duplicate) the caller's other work, and every send leaves a record.
 */
import type {Firestore, Timestamp} from "firebase-admin/firestore";
import {FieldValue} from "firebase-admin/firestore";

export const MAIL_COLLECTION = "outbox";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
}

export type DeliveryState = "PROCESSING" | "SUCCESS" | "ERROR";

export interface Delivery {
  state: DeliveryState;
  startTime: Timestamp | FieldValue;
  endTime?: Timestamp | FieldValue;
  messageId?: string;
  error?: string;
}

export interface QueuedEmail extends OutgoingEmail {
  createdAt: Timestamp | FieldValue;
  delivery?: Delivery;
}

/**
 * Queue an email for delivery.
 * @param {Firestore} db - Firestore instance.
 * @param {OutgoingEmail} email - Recipient, subject and HTML body.
 * @return {Promise<void>} Resolves when queued.
 */
export async function queueEmail(
  db: Firestore,
  email: OutgoingEmail,
): Promise<void> {
  const doc: QueuedEmail = {
    ...email,
    createdAt: FieldValue.serverTimestamp(),
  };
  await db.collection(MAIL_COLLECTION).add(doc);
}
