/**
 * Standalone script — see unpaidReminders.logic.ts for the actual logic.
 *
 * Usage:
 *   Set GOOGLE_APPLICATION_CREDENTIALS or pass a service
 *   account JSON via FIREBASE_SERVICE_ACCOUNT env var,
 *   plus FIREBASE_PROJECT_ID.
 *
 *   npx tsx functions/src/unpaidReminders.ts
 */
import {getDb} from "./adminApp";
import {sendUnpaidReminders} from "./unpaidReminders.logic";

if (require.main === module) {
  sendUnpaidReminders(getDb())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error sending reminders:", err);
      process.exit(1);
    });
}
