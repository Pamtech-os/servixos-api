export interface InvoiceSendJobData {
  businessId: string;
  invoiceId: string;
  /** When set, the email is sent as a payment reminder with this (user-reviewed) message. */
  reminderMessage?: string;
}

export interface InvoiceAutoCreatePaymentJobData {
  businessId: string;
  invoiceId: string;
}
