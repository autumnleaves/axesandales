/**
 * Membership expiry reminder emails.
 *
 * Sends reminders at:
 *  - 30 days before expiry
 *  - 7 days before expiry
 */
import type {Firestore} from "firebase-admin/firestore";
import {buildExpiryReminderEmail} from "./emailTemplates";

export interface MembershipRemindersResult {
  totalSent: number;
}

/**
 * Get a YYYY-MM-DD date N days from today.
 * @param {number} days - Number of days ahead.
 * @return {string} ISO date string.
 */
function getDateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
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
 * Send membership expiry reminders.
 * @param {Firestore} db - Firestore instance.
 * @return {Promise<MembershipRemindersResult>} Summary of the run.
 */
export async function sendMembershipReminders(
  db: Firestore,
): Promise<MembershipRemindersResult> {
  const targets = [
    {days: 30, label: "1-month"},
    {days: 7, label: "1-week"},
  ];

  let totalSent = 0;

  for (const {days, label} of targets) {
    const targetDate = getDateInDays(days);
    console.log(
      "Checking for memberships expiring on " +
      `${targetDate} (${label} reminder)...`,
    );

    const snapshot = await db
      .collection("users")
      .where("isMember", "==", true)
      .where("membershipExpiryDate", "==", targetDate)
      .get();

    if (snapshot.empty) {
      console.log(
        `  No members expiring on ${targetDate}.`,
      );
      continue;
    }

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const email = data.email as string | undefined;
      const name = data.name as string | undefined;

      if (!email || !name) {
        console.warn(
          `  Skipping user ${doc.id} ` +
          "— missing email or name.",
        );
        continue;
      }

      const subject = days <= 7 ?
        "Axes & Ales — Membership Expires Next Week!" :
        "Axes & Ales — Membership Expires Next Month";

      const html = buildExpiryReminderEmail(
        name, targetDate, days,
      );
      await queueEmail(db, email, subject, html);
      console.log(
        `  ✓ ${label} reminder sent to ${email}`,
      );
      totalSent++;
    }
  }

  console.log(`\nDone. ${totalSent} reminder(s) sent.`);
  return {totalSent};
}
