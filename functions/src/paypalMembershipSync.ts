/**
 * Runs as a standalone script via GitHub Actions cron (daily). Reads
 * recent payments from PayPal's Transaction Search API and renews the
 * matching memberships with the Firebase Admin SDK. See
 * paypalMembershipSync.logic.ts for the actual logic.
 *
 * Usage:
 *   Set GOOGLE_APPLICATION_CREDENTIALS or pass a service
 *   account JSON via FIREBASE_SERVICE_ACCOUNT env var,
 *   plus FIREBASE_PROJECT_ID, PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.
 *
 *   Optional: PAYPAL_LOOKBACK_DAYS (default 14), PAYPAL_API_BASE (e.g.
 *   https://api-m.sandbox.paypal.com for testing).
 *
 *   npx tsx functions/src/paypalMembershipSync.ts
 */
import {getDb} from "./adminApp";
import {fetchPayPalTransactions} from "./paypal";
import {syncPayPalMemberships} from "./paypalMembershipSync.logic";

/**
 * Fetch recent PayPal transactions and sync memberships.
 * @return {Promise<void>} Resolves when done.
 */
async function main(): Promise<void> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set.");
  }

  const lookbackDays = Number(process.env.PAYPAL_LOOKBACK_DAYS || 14);
  const end = new Date();
  const start = new Date(end.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  console.log(
    `Fetching PayPal transactions from ${start.toISOString()} ` +
    `to ${end.toISOString()}...`,
  );

  const transactions = await fetchPayPalTransactions(
    {clientId, clientSecret, apiBase: process.env.PAYPAL_API_BASE || undefined},
    start,
    end,
  );
  console.log(`${transactions.length} transaction(s) returned.`);

  await syncPayPalMemberships(getDb(), transactions);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error syncing PayPal memberships:", err);
      process.exit(1);
    });
}
