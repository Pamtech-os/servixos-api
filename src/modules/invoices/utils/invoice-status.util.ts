import { InvoiceStatus } from '../schemas/invoice.schema';

/**
 * Derives the invoice status from amounts already paid vs. the total.
 * Pass a small epsilon (e.g. 0.000001) to absorb floating-point drift when
 * the paid sum comes from accumulated payment records.
 */
export const calculateInvoiceStatus = (
  amountPaid: number,
  totalAmount: number,
  epsilon = 0,
): InvoiceStatus =>
  amountPaid + epsilon >= totalAmount
    ? InvoiceStatus.PAID
    : amountPaid > 0
      ? InvoiceStatus.PARTIAL
      : InvoiceStatus.PENDING;
