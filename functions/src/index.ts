import {setGlobalOptions} from "firebase-functions";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {getFirestore} from "firebase-admin/firestore";
import {initializeApp} from "firebase-admin/app";
import {
  BookingData,
  buildConfirmationEmail,
  buildModificationEmail,
  buildCancellationEmail,
  buildMembershipActivatedEmail,
  buildMembershipRenewedEmail,
  buildSwapMeetBookingEmail,
  buildSwapMeetCancelledEmail,
  buildSwapMeetCommitteeCancelledEmail,
  buildSwapMeetConfirmedEmail,
  formatDate,
  SwapMeetBookingData,
} from "./emailTemplates";

initializeApp();
const db = getFirestore();

setGlobalOptions({maxInstances: 10});

// =====================================================
// BOOKING CONFIRMATION EMAILS
// =====================================================

/**
 * Look up a user's email from the users collection.
 * @param {string} memberId - Firebase user ID.
 * @return {Promise<string | null>} The user's email.
 */
async function getUserEmail(
  memberId: string,
): Promise<string | null> {
  const userDoc = await db
    .collection("users").doc(memberId).get();
  if (userDoc.exists) {
    return userDoc.data()?.email || null;
  }
  return null;
}

/**
 * Look up a table name from the tables collection.
 * @param {string} tableId - Table document ID.
 * @return {Promise<string>} The table name.
 */
async function getTableName(
  tableId: string,
): Promise<string> {
  const tableDoc = await db
    .collection("tables").doc(tableId).get();
  if (tableDoc.exists) {
    return tableDoc.data()?.name || tableId;
  }
  return tableId;
}

/**
 * Look up a terrain box name.
 * @param {string} terrainBoxId - Terrain box document ID.
 * @return {Promise<string>} The terrain box name.
 */
async function getTerrainName(
  terrainBoxId: string,
): Promise<string> {
  const terrainDoc = await db
    .collection("terrainBoxes").doc(terrainBoxId).get();
  if (terrainDoc.exists) {
    return terrainDoc.data()?.name || terrainBoxId;
  }
  return terrainBoxId;
}

/**
 * Look up a secondary terrain item name.
 * @param {string} terrainItemId - Terrain box document ID.
 * @return {Promise<string>} The terrain item name.
 */
async function getSecondaryTerrainName(
  terrainItemId: string,
): Promise<string> {
  const terrainDoc = await db
    .collection("terrainBoxes").doc(terrainItemId).get();
  if (terrainDoc.exists) {
    return terrainDoc.data()?.name || terrainItemId;
  }
  return terrainItemId;
}

/**
 * Queue an email via the mail collection.
 * @param {string} to - Recipient email address.
 * @param {string} subject - Email subject line.
 * @param {string} html - HTML email body.
 * @return {Promise<void>} Resolves when queued.
 */
async function queueEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  await db.collection("mail").add({
    to: [to],
    message: {
      subject,
      html,
    },
  });
}

/**
 * Triggered when a new booking is created.
 * Sends a confirmation email to the member.
 */
export const onBookingCreated = onDocumentCreated(
  "bookings/{bookingId}",
  async (event) => {
    const data = event.data?.data();
    const booking = data as BookingData | undefined;
    if (!booking) return;

    const email = await getUserEmail(booking.memberId);
    if (!email) {
      logger.warn(
        `No email for member ${booking.memberId}`,
      );
      return;
    }

    const tableName = await getTableName(booking.tableId);
    const terrainName = booking.terrainBoxId ?
      await getTerrainName(booking.terrainBoxId) : null;
    const secondaryTerrainName = booking.secondaryTerrainId ?
      await getSecondaryTerrainName(booking.secondaryTerrainId) : null;

    const html = buildConfirmationEmail(
      booking, tableName, terrainName, secondaryTerrainName,
    );
    const subject =
      `Booking Confirmed - ${formatDate(booking.date)}`;
    await queueEmail(email, subject, html);

    const id = event.params.bookingId;
    logger.info(
      `Confirmation email queued for ${email} (${id})`,
    );
  },
);

/**
 * Triggered when a booking is updated.
 * Sends a modification or cancellation email.
 */
export const onBookingUpdated = onDocumentUpdated(
  "bookings/{bookingId}",
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    const before = beforeData as BookingData | undefined;
    const after = afterData as BookingData | undefined;
    if (!before || !after) return;

    const email = await getUserEmail(after.memberId);
    if (!email) {
      logger.warn(
        `No email for member ${after.memberId}`,
      );
      return;
    }

    const tableName = await getTableName(after.tableId);
    const id = event.params.bookingId;

    // Booking was cancelled
    if (
      before.status === "active" &&
      after.status === "cancelled"
    ) {
      const terrainName = after.terrainBoxId ?
        await getTerrainName(after.terrainBoxId) : null;
      const secondaryTerrainName = after.secondaryTerrainId ?
        await getSecondaryTerrainName(after.secondaryTerrainId) : null;
      const html = buildCancellationEmail(
        after, tableName, terrainName, secondaryTerrainName,
      );
      const subject =
        `Booking Cancelled - ${formatDate(after.date)}`;
      await queueEmail(email, subject, html);
      logger.info(
        `Cancellation email queued for ${email} (${id})`,
      );
      return;
    }

    // Booking was modified (only if something changed)
    const changed =
      before.date !== after.date ||
      before.tableId !== after.tableId ||
      before.terrainBoxId !== after.terrainBoxId ||
      before.secondaryTerrainId !== after.secondaryTerrainId ||
      before.gameSystem !== after.gameSystem ||
      before.playerCount !== after.playerCount;

    if (changed && after.status === "active") {
      const terrainName = after.terrainBoxId ?
        await getTerrainName(after.terrainBoxId) : null;
      const secondaryTerrainName = after.secondaryTerrainId ?
        await getSecondaryTerrainName(after.secondaryTerrainId) : null;
      const html = buildModificationEmail(
        after, tableName, terrainName, secondaryTerrainName,
      );
      const subject =
        `Booking Updated - ${formatDate(after.date)}`;
      await queueEmail(email, subject, html);
      logger.info(
        `Modification email queued for ${email} (${id})`,
      );
    }
  },
);

// =====================================================
// MEMBERSHIP CONFIRMATION EMAILS
// =====================================================

interface MembershipAuditData {
  id: string;
  userId: string;
  action: "activated" | "renewed" | "cancelled";
  performedBy: string;
  performedByName: string;
  timestamp: number;
}

/**
 * Triggered when a membership audit entry is created.
 * Sends a confirmation email for activations and renewals.
 */
export const onMembershipAuditCreated = onDocumentCreated(
  "membershipAudit/{entryId}",
  async (event) => {
    const data = event.data?.data();
    const entry = data as MembershipAuditData | undefined;
    if (!entry) return;

    // Only send emails for activations and renewals
    if (entry.action !== "activated" &&
        entry.action !== "renewed") {
      return;
    }

    // Look up the user's profile
    const userDoc = await db
      .collection("users").doc(entry.userId).get();
    if (!userDoc.exists) {
      logger.warn(
        `No user profile for ${entry.userId}`,
      );
      return;
    }

    const userData = userDoc.data();
    const email = userData?.email as string | undefined;
    const name = userData?.name as string | undefined;
    const expiryDate =
      userData?.membershipExpiryDate as string | undefined;

    if (!email || !name) {
      logger.warn(
        `Missing email/name for user ${entry.userId}`,
      );
      return;
    }

    if (!expiryDate) {
      logger.warn(
        `No expiry date for user ${entry.userId}, ` +
        "skipping membership email",
      );
      return;
    }

    const html = entry.action === "activated" ?
      buildMembershipActivatedEmail(name, expiryDate) :
      buildMembershipRenewedEmail(name, expiryDate);

    const subject = entry.action === "activated" ?
      "Welcome to Axes & Ales: Membership Activated!" :
      "Axes & Ales: Membership Renewed!";

    await queueEmail(email, subject, html);

    const id = event.params.entryId;
    logger.info(
      `Membership ${entry.action} email queued ` +
      `for ${email} (${id})`,
    );
  },
);

// =====================================================
// SWAP MEET EMAILS
// =====================================================

const COMMITTEE_EMAIL = "axesandalescommittee@gmail.com";

/**
 * Triggered when a swap meet booking is created.
 * Sends a pending confirmation email to the user.
 */
export const onSwapMeetBookingCreated = onDocumentCreated(
  "swapMeetBookings/{bookingId}",
  async (event) => {
    const data = event.data?.data();
    const booking = data as SwapMeetBookingData | undefined;
    if (!booking || booking.status === "cancelled") return;

    const email = await getUserEmail(booking.userId);
    if (!email) {
      logger.warn(
        `No email for swap meet user ${booking.userId}`,
      );
      return;
    }

    const subject = booking.paid ?
      "Swap Meet Booking Confirmed" :
      "Swap Meet Booking Received";
    const html = booking.paid ?
      buildSwapMeetConfirmedEmail(booking) :
      buildSwapMeetBookingEmail(booking);
    await queueEmail(email, subject, html);
    logger.info(
      `Swap meet booking email queued for ${email}`,
    );
  },
);

/**
 * Triggered when a swap meet booking is updated.
 * Sends confirmation and cancellation emails.
 */
export const onSwapMeetBookingUpdated = onDocumentUpdated(
  "swapMeetBookings/{bookingId}",
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    const before = beforeData as SwapMeetBookingData | undefined;
    const after = afterData as SwapMeetBookingData | undefined;
    if (!before || !after) return;

    const email = await getUserEmail(after.userId);
    if (!email) {
      logger.warn(
        `No email for swap meet user ${after.userId}`,
      );
      return;
    }

    if (
      before.status !== "cancelled" &&
      after.status === "cancelled"
    ) {
      await queueEmail(
        email,
        "Swap Meet Booking Cancelled",
        buildSwapMeetCancelledEmail(after),
      );
      await queueEmail(
        COMMITTEE_EMAIL,
        `Swap Meet Booking Cancelled - ${after.userName}`,
        buildSwapMeetCommitteeCancelledEmail(after, email),
      );
      logger.info(
        `Swap meet cancellation emails queued for ${email}`,
      );
      return;
    }

    if (!before.paid && after.paid) {
      await queueEmail(
        email,
        "Swap Meet Booking Confirmed",
        buildSwapMeetConfirmedEmail(after),
      );
      logger.info(
        `Swap meet confirmation email queued for ${email}`,
      );
    }
  },
);
