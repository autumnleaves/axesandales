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
import {type App, cert, initializeApp} from "firebase-admin/app";
import {type Firestore, getFirestore} from "firebase-admin/firestore";
import {type Auth, getAuth} from "firebase-admin/auth";

let app: App | undefined;

/**
 * Initializes (once per process) and returns the Admin app used by the
 * standalone scripts.
 * @return {App} The initialized Admin app.
 */
export function getAdminApp(): App {
  if (!app) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    app = serviceAccount ?
      initializeApp({
        credential: cert(JSON.parse(serviceAccount)),
        projectId,
      }) :
      initializeApp({projectId});
  }
  return app;
}

/**
 * @return {Firestore} The Firestore instance for the shared
 * standalone-script Admin app.
 */
export function getDb(): Firestore {
  return getFirestore(getAdminApp());
}

/**
 * @return {Auth} The Auth instance for the shared standalone-script
 * Admin app.
 */
export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}
