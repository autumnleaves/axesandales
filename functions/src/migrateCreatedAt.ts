/**
 * Standalone script — see migrateCreatedAt.logic.ts for the actual logic.
 *
 * Usage:
 *   FIREBASE_PROJECT_ID=axes-and-ales-booking-site
 *   npx tsx functions/src/migrateCreatedAt.ts
 */
import {getAdminAuth, getDb} from "./adminApp";
import {migrateCreatedAt} from "./migrateCreatedAt.logic";

if (require.main === module) {
  migrateCreatedAt(getDb(), getAdminAuth())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration error:", err);
      process.exit(1);
    });
}
