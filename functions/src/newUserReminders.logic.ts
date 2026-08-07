/**
 * Send payment reminder to users who signed up ~2 weeks ago and still
 * haven't paid for membership.
 */
import type {Firestore} from "firebase-admin/firestore";
import {FieldValue} from "firebase-admin/firestore";
import {buildUnpaidReminderEmail} from "./emailTemplates";

export interface NewUserRemindersResult {
  sent: number;
  skipped: number;
}

/**
 * Queue an email via the mail collection.
 * @param {Firestore} db - Firestore instance.
 * @param {string} to - Recipient email address.
 * @param {string} subject - Email subject line.
 * @param {string} html - HTML email body.
 * @return {Promise<void>} Resolves when queued.
 */
async function queueEmail(
  db: Firestore,
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
 * Send reminders to users created 14–15 days ago who are still not
 * members and haven't been reminded yet.
 * @param {Firestore} db - Firestore instance.
 * @return {Promise<NewUserRemindersResult>} Summary of the run.
 */
export async function sendNewUserReminders(
  db: Firestore,
): Promise<NewUserRemindersResult> {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - 15);
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() - 14);

  console.log(
    "Checking for unpaid users created between " +
    `${windowStart.toISOString()} and ` +
    `${windowEnd.toISOString()}...`,
  );

  const snapshot = await db
    .collection("users")
    .where("isMember", "==", false)
    .where("createdAt", ">=", windowStart)
    .where("createdAt", "<=", windowEnd)
    .get();

  if (snapshot.empty) {
    console.log("No matching users found.");
    return {sent: 0, skipped: 0};
  }

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

    await db.collection("users").doc(doc.id).update({
      unpaidReminderLastSent: FieldValue.serverTimestamp(),
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
