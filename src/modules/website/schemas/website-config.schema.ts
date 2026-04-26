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
}
