/**
 * Cloud Function that sends each email written to the outbox
 * collection, over SMTP via nodemailer.
 */
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {createTransport} from "nodemailer";
import {MailTransport, Sender, deliverQueuedEmail} from "./deliver";
import {MAIL_COLLECTION} from "./queue";

export interface MailTriggerOptions {
  region: string;
  sender: Sender;
  smtp: {
    host: string;
    port: number;
    user: string;
    /** Name of the Secret Manager secret holding the SMTP password. */
    passwordSecret: string;
  };
}

/**
 * Create the Firestore trigger that delivers queued emails.
 * @param {MailTriggerOptions} options - Region, sender and SMTP config.
 * @return {CloudFunction} The trigger, to be exported from index.ts.
 */
export function createMailTrigger(options: MailTriggerOptions) {
  const {region, sender, smtp} = options;
  const password = defineSecret(smtp.passwordSecret);
  // Created on first use: secret values are only readable at runtime.
  let transport: MailTransport | undefined;

  return onDocumentCreated(
    {
      document: `${MAIL_COLLECTION}/{emailId}`,
      region,
      secrets: [password],
    },
    async (event) => {
      if (!event.data) return;

      transport ??= createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: {user: smtp.user, pass: password.value()},
      });

      const id = event.params.emailId;
      const state = await deliverQueuedEmail(
        event.data.ref, transport, sender,
      );
      if (state === "ERROR") {
        logger.error(`Email ${id} failed to send; see its delivery.error`);
      } else if (state === "SUCCESS") {
        logger.info(`Email ${id} sent`);
      } else {
        logger.info(`Email ${id} already claimed, skipping`);
      }
    },
  );
}
