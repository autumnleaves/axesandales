/**
 * Shared Admin SDK initialization for the standalone reminder/migration
 * scripts (membershipReminders, newUserReminders, unpaidReminders,
 * migrateCreatedAt, checkCreatedAt). These run outside the Cloud
 * Functions runtime (GitHub Actions cron or manual `npx tsx`), so they
 * authenticate via FIREBASE_SERVICE_ACCOUNT/FIREBASE_PROJECT_ID env vars
 * rather than the ambient credentials Cloud Functions provides.
 *
 * Separate from index.ts's own `initializeApp()` (the actual deployed
 * Cloud Functions), which relies on the Cloud Functions runtime's
 * default credentials and isn't run outside of it.
 */
import * as admin from "firebase-admin";

let app: admin.app.App | undefined;

/**
 * Initializes (once per process) and returns the Admin app used by the
 * standalone scripts.
 * @return {admin.app.App} The initialized Admin app.
 */
export function getAdminApp(): admin.app.App {
  if (!app) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    app = serviceAccount ?
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccount)),
        projectId,
      }) :
      admin.initializeApp({projectId});
  }
  return app;
}

/**
 * @return {admin.firestore.Firestore} The Firestore instance for the
 * shared standalone-script Admin app.
 */
export function getDb(): admin.firestore.Firestore {
  return getAdminApp().firestore();
}

/**
 * @return {admin.auth.Auth} The Auth instance for the shared
 * standalone-script Admin app.
 */
export function getAdminAuth(): admin.auth.Auth {
  return getAdminApp().auth();
}
