import { index, modelOptions, prop } from '@typegoose/typegoose';
import { Types } from 'mongoose';

/**
 * Records a single page view event on a business's published website.
 *
 * Analytics queries use this collection to compute:
 *  - Daily visitor and page-view counts (grouped by business-local date)
 *  - Top pages by view volume
 *  - Conversion rate (service requests / unique visitors)
 *
 * A "visitor" is identified by sessionId — two rows with the same sessionId
 * on the same calendar day count as one visitor but two page views.
 *
 * Example write (website visitor):
 *   { businessId: ObjectId, page: "/services", sessionId: "abc-123", timestamp: new Date() }
 */
@index({ businessId: 1, timestamp: -1 })
@index({ businessId: 1, page: 1, timestamp: -1 })
@modelOptions({
  schemaOptions: { collection: 'page_views', timestamps: false },
})
export class PageView {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  /** Relative page path visited, e.g. "/" or "/services" */
  @prop({ required: true, trim: true })
  page: string;

  /** Browser-generated session UUID for unique-visitor deduplication */
  @prop({ trim: true })
  sessionId?: string;

  /** UTC timestamp of the event */
  @prop({ required: true })
  timestamp: Date;

  /** HTTP Referer header, if present */
  @prop({ trim: true })
  referrer?: string;
}
