/**
 * Runs as a standalone script via GitHub Actions cron (daily). Uses
 * Firebase Admin SDK to bypass security rules and write to the `mail`
 * collection. See membershipReminders.logic.ts for the actual logic.
 *
 * Usage:
 *   Set GOOGLE_APPLICATION_CREDENTIALS or pass a service
 *   account JSON via FIREBASE_SERVICE_ACCOUNT env var,
 *   plus FIREBASE_PROJECT_ID.
 *
 *   npx tsx functions/src/membershipReminders.ts
 */
import {getDb} from "./adminApp";
import {sendMembershipReminders} from "./membershipReminders.logic";

if (require.main === module) {
  sendMembershipReminders(getDb())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error sending reminders:", err);
      process.exit(1);
    });
}
