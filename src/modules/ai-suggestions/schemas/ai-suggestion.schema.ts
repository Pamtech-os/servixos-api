import { index, modelOptions, prop, PropType } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import {
  SuggestionCategory,
  SuggestionKind,
  SuggestionStatus,
} from '../types/ai-suggestions.types';

export class AiSuggestionDetail {
  @prop({ required: true })
  label: string;

  @prop({ required: true })
  value: string;
}

export class AiSuggestionDraft {
  @prop({ required: true })
  label: string;

  @prop({ required: true })
  value: string;

  @prop({ required: true })
  multiline: boolean;
}

export class AiSuggestionReview {
  @prop({ required: true })
  heading: string;

  @prop(
    { type: () => AiSuggestionDetail, _id: false, default: [] },
    PropType.ARRAY,
  )
  details: AiSuggestionDetail[];

  @prop({ type: () => AiSuggestionDraft, _id: false })
  draft?: AiSuggestionDraft;

  @prop({ required: true })
  executeLabel: string;

  @prop({ required: true })
  successMessage: string;
}

/** The data the Execute action operates on — captured when the suggestion is generated. */
export class AiSuggestionPayload {
  @prop({ type: Types.ObjectId })
  invoiceId?: Types.ObjectId;

  @prop({ type: Types.ObjectId })
  clientId?: Types.ObjectId;

  /** "YYYY-MM" month a revenue target applies to. */
  @prop()
  targetMonth?: string;
}

/** What actually happened at execution time — the baseline for outcome tracking. */
export class AiSuggestionExecution {
  @prop()
  draftValue?: string;

  @prop()
  balanceDue?: number;

  @prop()
  targetAmount?: number;

  @prop()
  pricePct?: number;

  @prop({ type: () => Types.ObjectId, default: [] }, PropType.ARRAY)
  affectedJobIds: Types.ObjectId[];
}

/**
 * One persisted instance of an AI suggestion. Persisting (rather than
 * recomputing) gives each suggestion a stable unique id, caches the
 * Claude-written copy so it is only generated once per data change, and
 * keeps executed suggestions around for outcome tracking.
 *
 * `dedupeKey` identifies the underlying subject (e.g. one invoice); at most one
 * ACTIVE suggestion may exist per key, enforced by the partial unique index.
 */
@index({ businessId: 1, dedupeKey: 1, createdAt: -1 })
@index(
  { businessId: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { status: SuggestionStatus.ACTIVE },
  },
)
@index({ businessId: 1, status: 1, executedAt: -1 })
@modelOptions({
  schemaOptions: { collection: 'ai_suggestions', timestamps: true },
})
export class AiSuggestion {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ enum: SuggestionKind, type: String, required: true })
  kind: SuggestionKind;

  @prop({ enum: SuggestionCategory, type: String, required: true })
  category: SuggestionCategory;

  @prop({ required: true })
  dedupeKey: string;

  /** Hash of the facts the copy was written from — a change triggers a rewrite. */
  @prop({ required: true })
  copyFingerprint: string;

  @prop({
    enum: SuggestionStatus,
    type: String,
    default: SuggestionStatus.ACTIVE,
  })
  status: SuggestionStatus;

  @prop({ required: true })
  title: string;

  @prop({ required: true })
  description: string;

  @prop({ required: true })
  recommendation: string;

  @prop({ type: () => AiSuggestionReview, _id: false, required: true })
  review: AiSuggestionReview;

  @prop({ type: () => AiSuggestionPayload, _id: false, default: () => ({}) })
  payload: AiSuggestionPayload;

  @prop()
  executedAt?: Date;

  /** When the suggestion left ACTIVE (executed, dismissed or expired). */
  @prop()
  resolvedAt?: Date;

  @prop({ type: () => AiSuggestionExecution, _id: false })
  execution?: AiSuggestionExecution;

  @prop()
  outcome?: string;

  /** True once the outcome can no longer change, so it is not re-evaluated. */
  @prop({ default: false })
  outcomeFinal: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}
