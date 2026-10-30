import { prop, index, modelOptions, PropType } from '@typegoose/typegoose';
import { Types } from 'mongoose';

class AiHero {
  @prop() headline: string;
  @prop() subheadline: string;
  @prop() ctaText: string;
}

class AiAbout {
  @prop() title: string;
  @prop() body: string;
}

class AiService {
  @prop() name: string;
  @prop() description: string;
}

class AiTestimonialPlaceholder {
  @prop() quote: string;
  @prop() author: string;
  /** False only once the owner has entered a real testimonial; missing on legacy docs. */
  @prop() isPlaceholder?: boolean;
}

class AiContact {
  @prop() callToAction: string;
}

export class AiContent {
  @prop({ type: () => AiHero, _id: false })
  hero?: AiHero;

  @prop({ type: () => AiAbout, _id: false })
  about?: AiAbout;

  @prop({ type: () => AiService, _id: false }, PropType.ARRAY)
  services?: AiService[];

  @prop({ type: () => AiTestimonialPlaceholder, _id: false })
  testimonialPlaceholder?: AiTestimonialPlaceholder;

  @prop({ type: () => AiContact, _id: false })
  contact?: AiContact;
}

/** Maps booking form field keys to the corresponding CreateRequestDto field names. */
export enum BookingFieldKey {
  CLIENT_NAME = 'clientName',
  CLIENT_EMAIL = 'clientEmail',
  CLIENT_PHONE = 'clientPhone',
  SERVICE = 'service',
  REQUESTED_DATE = 'requestedDate',
  REQUESTED_END_DATE = 'requestedEndDate',
  MESSAGE = 'message',
}

export class BookingFormField {
  @prop({ enum: BookingFieldKey, required: true })
  key: BookingFieldKey;

  @prop({ required: true, trim: true })
  label: string;

  @prop({ trim: true })
  placeholder?: string;

  @prop({ default: false })
  required: boolean;
}

export class BookingForm {
  @prop({ default: 'Book a Service', trim: true })
  title: string;

  @prop({ trim: true })
  description?: string;

  @prop({ type: () => BookingFormField, _id: false }, PropType.ARRAY)
  fields: BookingFormField[];
}

@index({ businessId: 1 }, { unique: true })
@index({ slug: 1 }, { unique: true, sparse: true })
@modelOptions({
  schemaOptions: { collection: 'website_configs', timestamps: true },
})
export class WebsiteConfig {
  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ lowercase: true, trim: true })
  slug?: string;

  @prop({ default: false })
  isPublished: boolean;

  @prop({ default: '#2563eb' })
  colorPrimary: string;

  @prop({ default: '#64748b' })
  colorSecondary: string;

  @prop({ default: 'Inter' })
  font: string;

  @prop({ type: () => AiContent, _id: false })
  aiContent?: AiContent;

  @prop({ trim: true })
  logoUrl?: string;

  @prop({ trim: true })
  logoPublicId?: string;

  @prop({ type: () => BookingForm, _id: false })
  bookingForm?: BookingForm;
}
