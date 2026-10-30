export {MAIL_COLLECTION, queueEmail} from "./queue";
export type {
  OutgoingEmail,
  QueuedEmail,
  Delivery,
  DeliveryState,
} from "./queue";
export {deliverQueuedEmail} from "./deliver";
export type {MailTransport, MailMessage, Sender} from "./deliver";
export {createMailTrigger} from "./trigger";
export type {MailTriggerOptions} from "./trigger";
