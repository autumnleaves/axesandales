/**
 * Minimal read-only PayPal client for the Transaction Search API
 * (GET /v1/reporting/transactions). Used by paypalMembershipSync to look
 * for membership payments; it never creates or modifies anything in
 * PayPal.
 *
 * The REST app behind PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET only needs the
 * "Transaction search" feature enabled.
 */

export const PAYPAL_LIVE_API = "https://api-m.paypal.com";

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  apiBase?: string;
}

/**
 * The subset of a Transaction Search result we use. See
 * https://developer.paypal.com/docs/api/transaction-search/v1/
 */
export interface PayPalTransaction {
  transaction_info: {
    transaction_id: string;
    transaction_event_code?: string;
    transaction_initiation_date?: string;
    transaction_amount?: {currency_code: string; value: string};
    transaction_status?: string;
    transaction_subject?: string;
    transaction_note?: string;
    invoice_id?: string;
    custom_field?: string;
  };
  payer_info?: {
    email_address?: string;
    payer_name?: {
      given_name?: string;
      surname?: string;
      alternate_full_name?: string;
    };
  };
  cart_info?: {
    item_details?: Array<Record<string, unknown>>;
  };
}

interface TransactionSearchPage {
  transaction_details?: PayPalTransaction[];
  total_pages?: number;
}

const TRANSACTION_SEARCH_SCOPE =
  "https://uri.paypal.com/services/reporting/search/read";

interface AccessToken {
  access_token: string;
  scope?: string;
  expires_in?: number;
}

/**
 * Exchange the app's client credentials for an OAuth access token.
 * @param {PayPalConfig} config - PayPal app credentials.
 * @return {Promise<AccessToken>} Bearer access token and its scopes.
 */
async function getAccessToken(config: PayPalConfig): Promise<AccessToken> {
  const base = config.apiBase ?? PAYPAL_LIVE_API;
  const auth = Buffer
    .from(`${config.clientId}:${config.clientSecret}`)
    .toString("base64");
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(
      `PayPal token request failed: ${res.status} ${await res.text()}`,
    );
  }
  return await res.json() as AccessToken;
}

/**
 * Explain a 403 from Transaction Search using the token's scopes.
 * @param {AccessToken} token - The token that was rejected.
 * @return {string} A hint for the error message.
 */
function explainForbidden(token: AccessToken): string {
  if (token.scope?.split(" ").includes(TRANSACTION_SEARCH_SCOPE)) {
    return "The access token has the Transaction Search scope, so check " +
      "the PayPal account itself is a Business account with Transaction " +
      "Search available.";
  }
  const hours = token.expires_in ? Math.ceil(token.expires_in / 3600) : 9;
  return "The access token doesn't have the Transaction Search scope. " +
    "Check \"Transaction search\" is ticked on the Live (not Sandbox) " +
    "app. If it was only just ticked, PayPal keeps handing out the old " +
    "token until it expires, so try again in about " +
    `${hours} hour${hours === 1 ? "" : "s"}.`;
}

/**
 * Format a Date the way Transaction Search expects (no milliseconds).
 * @param {Date} d - Date to format.
 * @return {string} ISO 8601 timestamp, e.g. 2026-11-03T00:00:00Z.
 */
function toPayPalTimestamp(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Fetch every transaction between two dates. Transaction Search allows at
 * most 31 days per request, so longer ranges are split into chunks.
 * @param {PayPalConfig} config - PayPal app credentials.
 * @param {Date} start - Start of the range.
 * @param {Date} end - End of the range.
 * @return {Promise<PayPalTransaction[]>} All transactions in the range.
 */
export async function fetchPayPalTransactions(
  config: PayPalConfig,
  start: Date,
  end: Date,
): Promise<PayPalTransaction[]> {
  const base = config.apiBase ?? PAYPAL_LIVE_API;
  const token = await getAccessToken(config);
  const maxChunkMs = 31 * 24 * 60 * 60 * 1000;
  const results: PayPalTransaction[] = [];

  for (let chunkStart = start.getTime(); chunkStart < end.getTime();) {
    const chunkEnd = Math.min(chunkStart + maxChunkMs, end.getTime());
    let page = 1;
    let totalPages = 1;
    do {
      const params = new URLSearchParams({
        start_date: toPayPalTimestamp(new Date(chunkStart)),
        end_date: toPayPalTimestamp(new Date(chunkEnd)),
        fields: "all",
        page_size: "500",
        page: String(page),
      });
      const res = await fetch(
        `${base}/v1/reporting/transactions?${params}`,
        {headers: {Authorization: `Bearer ${token.access_token}`}},
      );
      if (!res.ok) {
        const hint = res.status === 403 ? `\n${explainForbidden(token)}` : "";
        throw new Error(
          `PayPal transaction search failed: ${res.status} ` +
          await res.text() + hint,
        );
      }
      const body = await res.json() as TransactionSearchPage;
      results.push(...(body.transaction_details ?? []));
      totalPages = body.total_pages ?? 1;
      page++;
    } while (page <= totalPages);
    chunkStart = chunkEnd;
  }

  return results;
}
