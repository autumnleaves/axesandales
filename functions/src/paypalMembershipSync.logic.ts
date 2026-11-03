/**
 * Automatic membership activation/renewal from PayPal payments.
 *
 * For each membership-fee payment found in PayPal:
 *  1. Match the payer's PayPal email to a user account.
 *  2. Otherwise, look for a sign-up email in the payment note/details.
 *
 * Matched payments renew the member exactly like the admin "Renew
 * Membership" button (same expiry rules, same membershipAudit entry, which
 * triggers the usual confirmation email). Anything that can't be matched
 * or looks like a duplicate is emailed to the committee to check by hand.
 *
 * Every payment seen is recorded in the `paypalTransactions` collection
 * (keyed by PayPal transaction ID) so a payment is never applied twice and
 * the committee is only emailed about each payment once.
 */
import type {
  DocumentData,
  DocumentReference,
  Firestore,
} from "firebase-admin/firestore";
import {FieldValue} from "firebase-admin/firestore";
import {
  buildPayPalManualReviewEmail,
  type PayPalAppliedItem,
  type PayPalReviewItem,
} from "./emailTemplates";
import {queueEmail} from "./mail";
import type {PayPalTransaction} from "./paypal";

export const PAYPAL_LEDGER_COLLECTION = "paypalTransactions";
export const COMMITTEE_EMAIL = "axesandalescommittee@gmail.com";
export const SYNC_PERFORMED_BY = "paypal-sync";
export const SYNC_PERFORMED_BY_NAME = "PayPal auto-sync";

// Matches AdminView's renewal rules.
const MAX_EXTENSION_MONTHS = 18;
// A payment this soon after the membership was last paid is more likely a
// duplicate (or already handled by hand) than a genuine renewal.
const RECENT_PAYMENT_DAYS = 30;

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const NOT_MEMBERSHIP_PATTERN = /swap\s*meet|stall|half[\s-]*table/i;

export interface PayPalSyncOptions {
  membershipFee?: number;
  currency?: string;
  committeeEmail?: string;
  now?: Date;
}

export interface PayPalSyncResult {
  applied: number;
  alreadyApplied: number;
  manualReview: number;
  ignored: number;
  committeeNotified: boolean;
}

type LedgerStatus = "applied" | "already_applied" | "manual_review";

interface UserRecord {
  id: string;
  data: DocumentData;
}

type MatchResult =
  | {user: UserRecord; stage: "payer_email" | "payment_note"}
  | {reason: string};

/**
 * @param {Date} d - Date.
 * @return {string} YYYY-MM-DD (UTC), as used for membership dates.
 */
function toDateString(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Same as AdminView's computeNewExpiry: 12 months (+1 day) from the
 * current expiry if still active, otherwise from today, capped at
 * MAX_EXTENSION_MONTHS from today.
 * @param {string | undefined} currentExpiryDate - Current expiry.
 * @param {string} todayStr - Today, YYYY-MM-DD.
 * @return {string} New expiry date, YYYY-MM-DD.
 */
export function computeNewExpiry(
  currentExpiryDate: string | undefined,
  todayStr: string,
): string {
  const today = new Date(todayStr + "T00:00:00Z");
  const maxExpiry = new Date(today);
  maxExpiry.setUTCMonth(maxExpiry.getUTCMonth() + MAX_EXTENSION_MONTHS);

  let base = today;
  if (currentExpiryDate) {
    const current = new Date(currentExpiryDate + "T00:00:00Z");
    base = current > today ? current : today;
  }

  const newExpiry = new Date(base);
  newExpiry.setUTCFullYear(newExpiry.getUTCFullYear() + 1);
  newExpiry.setUTCDate(newExpiry.getUTCDate() + 1);

  return toDateString(newExpiry > maxExpiry ? maxExpiry : newExpiry);
}

/**
 * @param {string} todayStr - Today, YYYY-MM-DD.
 * @return {string} Furthest allowed expiry date, YYYY-MM-DD.
 */
function maxExpiryFrom(todayStr: string): string {
  const max = new Date(todayStr + "T00:00:00Z");
  max.setUTCMonth(max.getUTCMonth() + MAX_EXTENSION_MONTHS);
  return toDateString(max);
}

/**
 * @param {string} from - YYYY-MM-DD.
 * @param {string} to - YYYY-MM-DD.
 * @return {number} Whole days from `from` to `to`.
 */
function daysBetween(from: string, to: string): number {
  const ms = Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z");
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/**
 * @param {PayPalTransaction} txn - PayPal transaction.
 * @return {string} Payer's display name, or "" if PayPal didn't give one.
 */
function payerName(txn: PayPalTransaction): string {
  const name = txn.payer_info?.payer_name;
  if (!name) return "";
  return name.alternate_full_name ||
    [name.given_name, name.surname].filter(Boolean).join(" ");
}

/**
 * The free-text parts of a payment a payer can write in (note, subject,
 * custom/invoice fields and button options).
 * @param {PayPalTransaction} txn - PayPal transaction.
 * @return {string} Those parts joined together.
 */
function paymentText(txn: PayPalTransaction): string {
  const info = txn.transaction_info;
  return [
    info.transaction_note,
    info.transaction_subject,
    info.custom_field,
    info.invoice_id,
    txn.cart_info ? JSON.stringify(txn.cart_info) : undefined,
  ].filter(Boolean).join(" ");
}

/**
 * Whether a transaction is an incoming, completed membership-fee payment.
 * @param {PayPalTransaction} txn - PayPal transaction.
 * @param {number} fee - Membership fee.
 * @param {string} currency - Expected currency code.
 * @return {boolean} True if it should be treated as a membership payment.
 */
export function isMembershipPayment(
  txn: PayPalTransaction,
  fee: number,
  currency: string,
): boolean {
  const info = txn.transaction_info;
  // T00xx event codes are PayPal-to-PayPal payments (including Friends &
  // Family and hosted button/card payments); everything else is fees,
  // refunds, bank transfers and so on.
  if (!info.transaction_event_code?.startsWith("T00")) return false;
  if (info.transaction_status !== "S") return false;
  if (info.transaction_amount?.currency_code !== currency) return false;
  if (Number(info.transaction_amount.value) !== fee) return false;
  return !NOT_MEMBERSHIP_PATTERN.test(paymentText(txn));
}

/**
 * Match a payment to a user: first by PayPal email, then by an email
 * written in the payment note.
 * @param {PayPalTransaction} txn - PayPal transaction.
 * @param {Map<string, UserRecord[]>} usersByEmail - Users keyed by
 *   lower-cased email.
 * @return {MatchResult} The matched user, or why there isn't one.
 */
function matchPayment(
  txn: PayPalTransaction,
  usersByEmail: Map<string, UserRecord[]>,
): MatchResult {
  const payerEmail = txn.payer_info?.email_address?.toLowerCase();
  const payerMatches = payerEmail ? usersByEmail.get(payerEmail) ?? [] : [];

  const noteEmails = [...new Set(
    (paymentText(txn).match(EMAIL_PATTERN) ?? [])
      .map((e) => e.toLowerCase())
      .filter((e) => e !== payerEmail),
  )];
  const noteMatches = new Map<string, UserRecord>();
  for (const email of noteEmails) {
    for (const user of usersByEmail.get(email) ?? []) {
      noteMatches.set(user.id, user);
    }
  }

  if (payerMatches.length > 1) {
    return {reason: "Several accounts share the payer's email address."};
  }
  if (payerMatches.length === 1) {
    const [user] = payerMatches;
    const otherNoteMatch = [...noteMatches.keys()].some((id) => id !== user.id);
    if (otherNoteMatch) {
      return {
        reason: "The payer's email matches one account but the payment " +
          "note names a different account — possibly paying for someone " +
          "else.",
      };
    }
    return {user, stage: "payer_email"};
  }

  if (noteMatches.size === 1) {
    return {user: [...noteMatches.values()][0], stage: "payment_note"};
  }
  if (noteMatches.size > 1) {
    return {reason: "The payment note mentions more than one account."};
  }
  if (noteEmails.length > 0) {
    return {
      reason: `No account found for ${noteEmails.join(", ")} (from the ` +
        "payment note) or the payer's PayPal email.",
    };
  }
  return {
    reason: "No account uses the payer's PayPal email, and the payment " +
      "note doesn't include a sign-up email.",
  };
}

/**
 * Process PayPal transactions: renew matched members and email the
 * committee about anything that needs a human.
 * @param {Firestore} db - Firestore instance.
 * @param {PayPalTransaction[]} transactions - Transactions from PayPal.
 * @param {PayPalSyncOptions} options - Fee, currency, recipient, clock.
 * @return {Promise<PayPalSyncResult>} Summary of the run.
 */
export async function syncPayPalMemberships(
  db: Firestore,
  transactions: PayPalTransaction[],
  options: PayPalSyncOptions = {},
): Promise<PayPalSyncResult> {
  const fee = options.membershipFee ?? 60;
  const currency = options.currency ?? "AUD";
  const committeeEmail = options.committeeEmail ?? COMMITTEE_EMAIL;
  const todayStr = toDateString(options.now ?? new Date());

  const result: PayPalSyncResult = {
    applied: 0,
    alreadyApplied: 0,
    manualReview: 0,
    ignored: 0,
    committeeNotified: false,
  };

  const payments = transactions
    .filter((txn) => {
      const keep = isMembershipPayment(txn, fee, currency);
      if (!keep) result.ignored++;
      return keep;
    })
    .sort((a, b) =>
      (a.transaction_info.transaction_initiation_date ?? "")
        .localeCompare(b.transaction_info.transaction_initiation_date ?? ""));

  console.log(
    `${payments.length} membership payment(s) found, ` +
    `${result.ignored} other transaction(s) ignored.`,
  );
  if (payments.length === 0) return result;

  const ledgerRefs = payments.map((txn) => db
    .collection(PAYPAL_LEDGER_COLLECTION)
    .doc(txn.transaction_info.transaction_id));
  const ledgerSnaps = await db.getAll(...ledgerRefs);

  const usersSnap = await db.collection("users").get();
  const usersByEmail = new Map<string, UserRecord[]>();
  for (const doc of usersSnap.docs) {
    const email = (doc.data().email as string | undefined)?.toLowerCase();
    if (!email) continue;
    const list = usersByEmail.get(email) ?? [];
    list.push({id: doc.id, data: doc.data()});
    usersByEmail.set(email, list);
  }

  const appliedThisRun = new Set<string>();
  const newReviewItems: PayPalReviewItem[] = [];
  const newReviewRefs: DocumentReference[] = [];
  const appliedItems: PayPalAppliedItem[] = [];

  for (const [i, txn] of payments.entries()) {
    const txnId = txn.transaction_info.transaction_id;
    const ledgerRef = ledgerRefs[i];
    const previous = ledgerSnaps[i].data();
    const previousStatus = previous?.status as LedgerStatus | undefined;

    // Applied (or found already applied) on an earlier run — nothing to do.
    if (previousStatus === "applied" || previousStatus === "already_applied") {
      continue;
    }

    const paymentDate = toDateString(
      new Date(txn.transaction_info.transaction_initiation_date ?? Date.now()),
    );
    const amount = `${txn.transaction_info.transaction_amount?.value} ` +
      currency;
    const payment = {
      transactionId: txnId,
      paymentDate,
      amount,
      payerName: payerName(txn),
      payerEmail: txn.payer_info?.email_address ?? "",
      note: txn.transaction_info.transaction_note ?? "",
    };

    const match = matchPayment(txn, usersByEmail);
    let reason: string | undefined;
    let user: UserRecord | undefined;
    let stage: string | undefined;

    if ("reason" in match) {
      reason = match.reason;
    } else {
      user = match.user;
      stage = match.stage;
      const paidDate = user.data.membershipPaidDate as string | undefined;
      const expiry = user.data.membershipExpiryDate as string | undefined;

      if (appliedThisRun.has(user.id)) {
        reason = "Another payment from this member was applied in the " +
          "same run — possible duplicate payment.";
      } else if (paidDate && paidDate >= paymentDate) {
        // Already renewed (by hand or an earlier run) on or after the day
        // this payment was made.
        await ledgerRef.set({
          ...payment,
          status: "already_applied",
          userId: user.id,
          processedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        result.alreadyApplied++;
        console.log(
          `  = ${txnId}: ${user.data.email} already paid on ${paidDate}.`,
        );
        continue;
      } else if (
        paidDate && daysBetween(paidDate, paymentDate) < RECENT_PAYMENT_DAYS
      ) {
        reason = `Membership was last paid on ${paidDate}, less than ` +
          `${RECENT_PAYMENT_DAYS} days before this payment — check it ` +
          "isn't a duplicate.";
      } else if (expiry && expiry >= maxExpiryFrom(todayStr)) {
        reason = `Membership already runs to ${expiry}, the furthest it ` +
          `can be extended (${MAX_EXTENSION_MONTHS} months).`;
      } else if (await hasUnpaidSwapMeetBooking(db, user.id, fee)) {
        reason = "This member also has an unpaid swap meet booking for " +
          "the same amount — check which this payment is for.";
      }
    }

    if (reason || !user) {
      result.manualReview++;
      console.log(`  ? ${txnId}: needs manual check — ${reason}`);
      await ledgerRef.set({
        ...payment,
        status: "manual_review",
        reason,
        userId: user?.id ?? null,
        processedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      // Payments stay in review (and are re-checked each run, e.g. once
      // the payer creates their account), but the committee only hears
      // about each one once.
      if (!previous?.notifiedAt) {
        newReviewItems.push({
          ...payment,
          reason: reason ?? "",
          accountEmail: user?.data.email as string | undefined,
        });
        newReviewRefs.push(ledgerRef);
      }
      continue;
    }

    const wasMember = user.data.isMember === true;
    const newExpiry = computeNewExpiry(
      user.data.membershipExpiryDate as string | undefined, todayStr,
    );
    const auditRef = db.collection("membershipAudit").doc();
    const batch = db.batch();
    batch.update(db.collection("users").doc(user.id), {
      isMember: true,
      membershipPaidDate: paymentDate,
      membershipExpiryDate: newExpiry,
    });
    // Triggers onMembershipAuditCreated, which emails the member.
    batch.set(auditRef, {
      id: auditRef.id,
      userId: user.id,
      action: wasMember ? "renewed" : "activated",
      performedBy: SYNC_PERFORMED_BY,
      performedByName: SYNC_PERFORMED_BY_NAME,
      timestamp: Date.now(),
    });
    batch.set(ledgerRef, {
      ...payment,
      status: "applied",
      userId: user.id,
      matchedBy: stage,
      newExpiryDate: newExpiry,
      processedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    await batch.commit();

    user.data = {
      ...user.data,
      isMember: true,
      membershipPaidDate: paymentDate,
      membershipExpiryDate: newExpiry,
    };
    appliedThisRun.add(user.id);
    appliedItems.push({
      ...payment,
      accountEmail: user.data.email as string,
      action: wasMember ? "renewed" : "activated",
      newExpiryDate: newExpiry,
    });
    result.applied++;
    console.log(
      `  ✓ ${txnId}: ${wasMember ? "renewed" : "activated"} ` +
      `${user.data.email} until ${newExpiry} (matched by ${stage}).`,
    );
  }

  if (newReviewItems.length > 0) {
    await queueEmail(db, {
      to: committeeEmail,
      subject: `Axes & Ales — ${newReviewItems.length} PayPal payment(s) ` +
        "to check",
      html: buildPayPalManualReviewEmail(newReviewItems, appliedItems),
    });
    const batch = db.batch();
    for (const ref of newReviewRefs) {
      batch.update(ref, {notifiedAt: FieldValue.serverTimestamp()});
    }
    await batch.commit();
    result.committeeNotified = true;
    console.log(`Committee emailed about ${newReviewItems.length} payment(s).`);
  }

  console.log(
    `\nDone. ${result.applied} applied, ${result.alreadyApplied} already ` +
    `applied, ${result.manualReview} need a manual check.`,
  );
  return result;
}

/**
 * @param {Firestore} db - Firestore instance.
 * @param {string} userId - User ID.
 * @param {number} fee - Membership fee.
 * @return {Promise<boolean>} Whether the user has an active, unpaid swap
 *   meet booking costing the same as a membership.
 */
async function hasUnpaidSwapMeetBooking(
  db: Firestore,
  userId: string,
  fee: number,
): Promise<boolean> {
  const snap = await db.collection("swapMeetBookings")
    .where("userId", "==", userId)
    .get();
  return snap.docs.some((doc) => {
    const data = doc.data();
    return data.status !== "cancelled" && data.paid !== true &&
      data.amountOwed === fee;
  });
}
