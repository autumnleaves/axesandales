/**
 * Send payment reminder emails to unpaid members.
 *
 * Finds all users with isMember === false, sends them a reminder that
 * payment is needed to book tables, and records when the reminder was
 * last sent.
 */
import type {firestore} from "firebase-admin";
import * as admin from "firebase-admin";
import {buildUnpaidReminderEmail} from "./emailTemplates";

export interface UnpaidRemindersResult {
  sent: number;
  skipped: number;
}

/**
 * Queue an email via the mail collection.
 * @param {firestore.Firestore} db - Firestore instance.
 * @param {string} to - Recipient email address.
 * @param {string} subject - Email subject line.
 * @param {string} html - HTML email body.
 * @return {Promise<void>} Resolves when queued.
 */
async function queueEmail(
  db: firestore.Firestore,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  await db.collection("mail").add({
    to: [to],
    message: {subject, html},
  });
}

/**
 * Send payment reminders to all unpaid members.
 * @param {firestore.Firestore} db - Firestore instance.
 * @return {Promise<UnpaidRemindersResult>} Summary of the run.
 */
export async function sendUnpaidReminders(
  db: firestore.Firestore,
): Promise<UnpaidRemindersResult> {
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  console.log(
    "Looking up unpaid users created before " +
    `${twoWeeksAgo.toISOString()}...`,
  );

  const snapshot = await db
    .collection("users")
    .where("isMember", "==", false)
    .where("createdAt", "<=", twoWeeksAgo)
    .get();

  if (snapshot.empty) {
    console.log("No matching unpaid members found.");
    return {sent: 0, skipped: 0};
  }

  console.log(
    `Found ${snapshot.size} unpaid member(s).`,
  );

  let sent = 0;
  let skipped = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const email = data.email as string | undefined;
    const name = data.name as string | undefined;

    if (data.unpaidReminderLastSent) {
      console.log(
        `  Skipping user ${doc.id} — already reminded.`,
      );
      skipped++;
      continue;
    }

    if (!email || !name) {
      console.warn(
        `  Skipping user ${doc.id} — missing email or name.`,
      );
      skipped++;
      continue;
    }

    const subject =
      "Axes & Ales — Membership Reminder";
    const html = buildUnpaidReminderEmail(name);
    await queueEmail(db, email, subject, html);

    // Track when this reminder was last sent
    await db.collection("users").doc(doc.id).update({
      unpaidReminderLastSent:
        admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`  ✓ Reminder sent to ${email}`);
    sent++;
  }

  console.log(
    `\nDone. ${sent} reminder(s) sent, ` +
    `${skipped} skipped.`,
  );
  return {sent, skipped};
}
