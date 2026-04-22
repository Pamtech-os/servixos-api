import {
  prop,
  getModelForClass,
  index,
  modelOptions,
} from '@typegoose/typegoose';
import { Types } from 'mongoose';

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
}

export const WebsiteConfigModel = getModelForClass(WebsiteConfig);
