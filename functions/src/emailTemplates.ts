/**
 * Shared email templates for Axes & Ales functions.
 */

// =====================================================
// Shared types
// =====================================================

export interface BookingData {
  id: string;
  date: string;
  tableId: string;
  terrainBoxId?: string | null;
  secondaryTerrainId?: string | null;
  memberName: string;
  memberId: string;
  gameSystem: string;
  playerCount: number;
  timestamp: number;
  status: "active" | "cancelled";
  cancelledAt?: number;
  cancelledBy?: string;
}

export interface SwapMeetBookingData {
  id: string;
  userId: string;
  userName: string;
  stallCount: number;
  status: "pending" | "confirmed" | "cancelled";
  amountOwed: number;
  paid: boolean;
  invoiced: boolean;
  createdAt: number;
  updatedAt: number;
  paidAt?: number;
  paidBy?: string;
  cancelledAt?: number;
  cancelledBy?: string;
}

// =====================================================
// Formatting helpers
// =====================================================

/**
 * Format a date with weekday (for bookings).
 * @param {string} dateStr - YYYY-MM-DD date string.
 * @return {string} Formatted date.
 */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Format a date without weekday (for membership).
 * @param {string} dateStr - YYYY-MM-DD date string.
 * @return {string} Formatted date.
 */
export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Format a currency amount for swap meet emails.
 * @param {number} amount - Amount in dollars.
 * @return {string} Formatted amount.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(amount);
}

// =====================================================
// Booking emails
// =====================================================

/**
 * Build HTML email for a booking confirmation.
 * @param {BookingData} booking - The booking data.
 * @param {string} tableName - Display name of the table.
 * @param {string | null} terrainName - Terrain box name.
 * @param { string | null } secondaryTerrainName - Secondary terrain box name.
 * @return {string} HTML email body.
 */
export function buildConfirmationEmail(
  booking: BookingData,
  tableName: string,
  terrainName: string | null,
  secondaryTerrainName: string | null,
): string {
  return `
    <p>Hi ${booking.memberName},</p>
    <p>Your booking is confirmed:</p>
    <p>
      <strong>${formatDate(booking.date)}</strong><br>
      Table: ${tableName}<br>
      Terrain: ${terrainName || "None"}<br>
      Extra Terrain: ${secondaryTerrainName || "None"}<br>
      Game: ${booking.gameSystem}<br>
      Players: ${booking.playerCount}
    </p>
    <p>To change or cancel, visit
    <a href="https://www.axesandales.club/booking">
    Axes &amp; Ales</a>.</p>
  `;
}

/**
 * Build HTML email for a booking modification.
 * @param {BookingData} booking - The booking data.
 * @param {string} tableName - Display name of the table.
 * @param {string | null} terrainName - Terrain box name.
 * @param { string | null } secondaryTerrainName - Secondary terrain box name.
 * @return {string} HTML email body.
 */
export function buildModificationEmail(
  booking: BookingData,
  tableName: string,
  terrainName: string | null,
  secondaryTerrainName: string | null,
): string {
  return `
    <p>Hi ${booking.memberName},</p>
    <p>Your booking has been updated:</p>
    <p>
      <strong>${formatDate(booking.date)}</strong><br>
      Table: ${tableName}<br>
      Terrain: ${terrainName || "None"}<br>
      Extra Terrain: ${secondaryTerrainName || "None"}<br>
      Game: ${booking.gameSystem}<br>
      Players: ${booking.playerCount}
    </p>
    <p>To make further changes, visit
    <a href="https://www.axesandales.club/booking">
    Axes &amp; Ales</a>.</p>
  `;
}

/**
 * Build HTML email for a booking cancellation.
 * @param {BookingData} booking - The booking data.
 * @param {string} tableName - Display name of the table.
 * @param {string | null} terrainName - Terrain box name.
 * @param { string | null } secondaryTerrainName - Secondary terrain box name.
 * @return {string} HTML email body.
 */
export function buildCancellationEmail(
  booking: BookingData,
  tableName: string,
  terrainName: string | null,
  secondaryTerrainName: string | null,
): string {
  return `
    <p>Hi ${booking.memberName},</p>
    <p>Your booking has been cancelled:</p>
    <p>
      ${formatDate(booking.date)}<br>
      Table: ${tableName}<br>
      Terrain: ${terrainName || "None"}<br>
      Extra Terrain: ${secondaryTerrainName || "None"}<br>
      Game: ${booking.gameSystem}
    </p>
    <p>You can make a new booking any time on
    <a href="https://www.axesandales.club/booking">
    Axes &amp; Ales</a>.</p>
  `;
}

// =====================================================
// Swap meet emails
// =====================================================

/**
 * Build HTML email for a swap meet booking.
 * @param {SwapMeetBookingData} booking - The booking data.
 * @return {string} HTML email body.
 */
export function buildSwapMeetBookingEmail(
  booking: SwapMeetBookingData,
): string {
  return `
    <p>Hi ${booking.userName},</p>
    <p>Your swap meet half-table booking has been received.</p>
    <p>
      <strong>Sunday 19 July 2026</strong><br>
      Half-tables booked: ${booking.stallCount}<br>
      Amount owing: ${formatCurrency(booking.amountOwed)}<br>
      Status: Pending confirmation
    </p>
    <p>The committee will confirm your booking once payment has
    been marked as received.</p>
    <p>Questions? Email
    <a href="mailto:axesandalescommittee@gmail.com">
    axesandalescommittee@gmail.com</a>.</p>
  `;
}

/**
 * Build HTML email for a confirmed swap meet booking.
 * @param {SwapMeetBookingData} booking - The booking data.
 * @return {string} HTML email body.
 */
export function buildSwapMeetConfirmedEmail(
  booking: SwapMeetBookingData,
): string {
  return `
    <p>Hi ${booking.userName},</p>
    <p>Your swap meet booking has been confirmed.</p>
    <p>
      <strong>Sunday 19 July 2026</strong><br>
      Half-tables booked: ${booking.stallCount}<br>
      Amount paid: ${formatCurrency(booking.amountOwed)}
    </p>
    <p>Thanks for supporting Axes &amp; Ales.</p>
  `;
}

/**
 * Build HTML email for a cancelled swap meet booking.
 * @param {SwapMeetBookingData} booking - The booking data.
 * @return {string} HTML email body.
 */
export function buildSwapMeetCancelledEmail(
  booking: SwapMeetBookingData,
): string {
  const refundNote = booking.paid ?
    `<p>This booking had been marked as paid. Please email
    <a href="mailto:axesandalescommittee@gmail.com">
    axesandalescommittee@gmail.com</a> to arrange a refund.</p>` :
    "";
  return `
    <p>Hi ${booking.userName},</p>
    <p>Your swap meet booking has been cancelled.</p>
    <p>
      <strong>Sunday 19 July 2026</strong><br>
      Half-tables cancelled: ${booking.stallCount}<br>
      Amount: ${formatCurrency(booking.amountOwed)}
    </p>
    ${refundNote}
  `;
}

/**
 * Build HTML email alerting the committee to a cancellation.
 * @param {SwapMeetBookingData} booking - The booking data.
 * @param {string} userEmail - User email address.
 * @return {string} HTML email body.
 */
export function buildSwapMeetCommitteeCancelledEmail(
  booking: SwapMeetBookingData,
  userEmail: string,
): string {
  const refundNote = booking.paid ?
    "<p><strong>Refund follow-up required.</strong></p>" :
    "";
  return `
    <p>A swap meet booking has been cancelled.</p>
    <p>
      User: ${booking.userName}<br>
      Email: ${userEmail}<br>
      Half-tables cancelled: ${booking.stallCount}<br>
      Amount: ${formatCurrency(booking.amountOwed)}<br>
      Paid: ${booking.paid ? "Yes" : "No"}
    </p>
    ${refundNote}
  `;
}

// =====================================================
// Membership emails
// =====================================================

/**
 * Build HTML email for membership activation.
 * @param {string} name - Member's display name.
 * @param {string} expiryDate - Membership expiry date.
 * @return {string} HTML email body.
 */
export function buildMembershipActivatedEmail(
  name: string,
  expiryDate: string,
): string {
  return `
    <p>Hi ${name},</p>
    <p>Welcome to <strong>Axes &amp; Ales</strong>! 🎉</p>
    <p>Your membership has been activated and is valid
    until <strong>${formatShortDate(expiryDate)}</strong>.</p>
    <p>As a member, you can now
    <a href="https://www.axesandales.club/booking">
    book tables in advance</a> for club nights.
    We look forward to seeing you at the table!</p>
    <p>Thank you for supporting the club.</p>
    <p>— The Axes &amp; Ales Committee</p>
  `;
}

/**
 * Build HTML email for membership renewal.
 * @param {string} name - Member's display name.
 * @param {string} expiryDate - New membership expiry date.
 * @return {string} HTML email body.
 */
export function buildMembershipRenewedEmail(
  name: string,
  expiryDate: string,
): string {
  return `
    <p>Hi ${name},</p>
    <p>Thanks for renewing your
    <strong>Axes &amp; Ales</strong> membership! 🙌</p>
    <p>Your membership has been extended and is now valid
    until <strong>${formatShortDate(expiryDate)}</strong>.</p>
    <p>You can continue to
    <a href="https://www.axesandales.club/booking">
    book tables</a> for upcoming club nights.</p>
    <p>Thank you for your continued support!</p>
    <p>— The Axes &amp; Ales Committee</p>
  `;
}

// =====================================================
// Expiry reminder email (used by membershipReminders)
// =====================================================

/**
 * Build HTML email for an expiry reminder.
 * @param {string} name - Member's display name.
 * @param {string} expiryDate - Expiry date string.
 * @param {number} daysUntil - Days until expiry.
 * @return {string} HTML email body.
 */
export function buildExpiryReminderEmail(
  name: string,
  expiryDate: string,
  daysUntil: number,
): string {
  const urgency = daysUntil <= 7 ?
    "expires in just one week" :
    "expires in one month";
  return `
    <p>Hi ${name},</p>
    <p>Just a friendly heads-up — your
    <strong>Axes &amp; Ales</strong> membership
    ${urgency}, on
    <strong>${formatShortDate(expiryDate)}</strong>.</p>
    <p>To keep booking tables for club nights,
    head to the
    <a href="https://www.axesandales.club/membership">
    Membership &amp; Payment</a> page to renew.</p>
    <p>Once you've paid, the committee will update
    your membership — no need to do anything
    else.</p>
    <p>See you at the table!</p>
    <p>— The Axes &amp; Ales Committee</p>
  `;
}

// =====================================================
// Unpaid member reminder
// =====================================================

/**
 * Build HTML email for an unpaid member reminder.
 * @param {string} name - Member's display name.
 * @return {string} HTML email body.
 */
export function buildUnpaidReminderEmail(
  name: string,
): string {
  return `
    <p>Hi ${name},</p>
    <p>Thank you for creating an Axes & Ales account.</p>
    <p>If you wanted to become a member to book tables 
    and support the club, please head to the
    <a href="https://www.axesandales.club/membership">
    Membership &amp; Payment</a> page.</p>
    <p>If you've already paid, please
    <a href="mailto:axesandalescommittee@gmail.com">
    contact the committee</a> so we can match your
    payment to your account.</p>
    <p>See you at the table!</p>
    <p>— The Axes &amp; Ales Committee</p>
  `;
}

// =====================================================
// PayPal membership sync (used by paypalMembershipSync)
// =====================================================

export interface PayPalPaymentSummary {
  transactionId: string;
  paymentDate: string;
  amount: string;
  payerName: string;
  payerEmail: string;
  note: string;
}

export interface PayPalReviewItem extends PayPalPaymentSummary {
  reason: string;
  accountEmail?: string;
}

export interface PayPalAppliedItem extends PayPalPaymentSummary {
  accountEmail: string;
  action: "activated" | "renewed";
  newExpiryDate: string;
}

/**
 * Escape text for HTML. PayPal payment notes are written by payers.
 * @param {string} text - Untrusted text.
 * @return {string} HTML-safe text.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build HTML email asking the committee to check PayPal payments that
 * couldn't be matched to a membership automatically.
 * @param {PayPalReviewItem[]} items - Payments needing a manual check.
 * @param {PayPalAppliedItem[]} applied - Payments applied automatically
 *   in the same run, for reference.
 * @return {string} HTML email body.
 */
export function buildPayPalManualReviewEmail(
  items: PayPalReviewItem[],
  applied: PayPalAppliedItem[],
): string {
  const cell = "style=\"border:1px solid #ccc;padding:4px 8px;" +
    "vertical-align:top\"";
  const reviewRows = items.map((item) => {
    const account = item.accountEmail ?
      `<br>Account: ${escapeHtml(item.accountEmail)}` : "";
    return `
      <tr>
        <td ${cell}>${formatShortDate(item.paymentDate)}</td>
        <td ${cell}>${escapeHtml(item.amount)}</td>
        <td ${cell}>${escapeHtml(item.payerName || "—")}<br>
          ${escapeHtml(item.payerEmail || "—")}</td>
        <td ${cell}>${escapeHtml(item.note || "—")}</td>
        <td ${cell}>${escapeHtml(item.reason)}${account}</td>
        <td ${cell}>${escapeHtml(item.transactionId)}</td>
      </tr>`;
  }).join("");

  const appliedList = applied.length === 0 ? "" : `
    <p>For reference, these payments were applied automatically in the
    same run:</p>
    <ul>${applied.map((item) => `
      <li>${escapeHtml(item.accountEmail)} — ${item.action} until
      ${formatShortDate(item.newExpiryDate)}
      (${escapeHtml(item.transactionId)})</li>`).join("")}
    </ul>`;

  return `
    <p>Hi committee,</p>
    <p>The PayPal membership sync couldn't automatically match
    ${items.length === 1 ? "this payment" : "these payments"} to a
    membership. Please check ${items.length === 1 ? "it" : "them"} and
    activate or renew the right account from the
    <a href="https://www.axesandales.club/admin">admin page</a>.</p>
    <table style="border-collapse:collapse">
      <tr>
        <th ${cell}>Date</th>
        <th ${cell}>Amount</th>
        <th ${cell}>Payer</th>
        <th ${cell}>Note</th>
        <th ${cell}>Why it needs checking</th>
        <th ${cell}>PayPal transaction</th>
      </tr>${reviewRows}
    </table>
    ${appliedList}
    <p>You'll only be emailed about each payment once. If the payer
    creates their account within a couple of weeks, the sync will pick the
    payment up automatically.</p>
  `;
}
