import type { Types } from 'mongoose';
import type { InvoiceStatus } from '../../invoices/schemas/invoice.schema';

/** UI grouping for a suggestion card. New values must be coordinated with the frontend (it owns the labels). */
export enum SuggestionCategory {
  CASH_FLOW = 'cash_flow',
  PRICING = 'pricing',
  CUSTOMER_RETENTION = 'customer_retention',
}

/** The concrete action a suggestion performs when executed. Internal — never sent to the client. */
export enum SuggestionKind {
  PAYMENT_REMINDER = 'payment_reminder',
  CLIENT_FOLLOW_UP = 'client_follow_up',
  REVENUE_TARGET = 'revenue_target',
  PRICE_INCREASE = 'price_increase',
}

export enum SuggestionStatus {
  ACTIVE = 'active',
  EXECUTED = 'executed',
  DISMISSED = 'dismissed',
  /** The underlying condition went away (e.g. the invoice was paid) before the user acted. */
  EXPIRED = 'expired',
}

// ─── Wire shapes ─────────────────────────────────────────────────────────────

export interface SuggestionDetail {
  label: string;
  value: string;
}

export interface SuggestionDraft {
  label: string;
  value: string;
  multiline: boolean;
}

export interface SuggestionReview {
  heading: string;
  details: SuggestionDetail[];
  draft?: SuggestionDraft;
  executeLabel: string;
  successMessage: string;
}

export interface Suggestion {
  id: string;
  category: SuggestionCategory;
  title: string;
  description: string;
  recommendation: string;
  review: SuggestionReview;
}

export interface SuggestionsResult {
  count: number;
  suggestions: Suggestion[];
}

export interface ExecuteSuggestionResult {
  id: string;
  remaining: number;
  executedAt: string;
}

export interface DismissSuggestionResult {
  id: string;
  remaining: number;
}

export interface TrackedSuggestion {
  id: string;
  category: SuggestionCategory;
  title: string;
  executeLabel: string;
  executedAt: string;
  /** Observed result of the action; null while still pending. */
  outcome: string | null;
}

export interface TrackedSuggestionsResult {
  tracked: TrackedSuggestion[];
}

// ─── AI copy ─────────────────────────────────────────────────────────────────

/** The human-voice parts of a suggestion — written by Claude, with a deterministic fallback. */
export interface SuggestionCopy {
  description: string;
  recommendation: string;
  /** Editable message text; only for kinds whose draft is a message. */
  draftMessage?: string;
}

export interface SuggestionCopyRequest {
  key: string;
  kind: SuggestionKind;
  /** Stable facts Claude may use. Their hash is the copy fingerprint, so never include values that drift daily. */
  facts: Record<string, string | number>;
  /** Whether Claude should write `draftMessage`. */
  wantsDraftMessage: boolean;
  fallback: SuggestionCopy;
}

// ─── Raw repository shapes ──────────────────────────────────────────────────

export interface OverdueInvoice {
  invoiceId: Types.ObjectId;
  invoiceNumber: string;
  clientId: Types.ObjectId;
  clientName: string;
  totalAmount: number;
  amountPaid: number;
  /** `dueDate`, or `invoiceDate` when no due date was set (due on receipt). */
  dueDate: Date;
}

export interface IdleClient {
  clientId: Types.ObjectId;
  name: string;
  email: string;
  lastCompletedAt: Date;
  lastJobTitle: string;
  completedJobs: number;
}

export interface ClientPaymentHabit {
  clientId: Types.ObjectId;
  avgDaysToPay: number;
}

export interface InvoiceOutcomeRow {
  invoiceId: Types.ObjectId;
  status: InvoiceStatus;
  totalAmount: number;
  amountPaid: number;
  deleted: boolean;
  lastPaymentDate: Date | null;
}

export interface JobStatusCounts {
  completed: number;
  cancelled: number;
}
