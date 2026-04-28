import { prop, index, modelOptions } from '@typegoose/typegoose';

@index({ slug: 1 }, { unique: true })
@modelOptions({
  schemaOptions: { collection: 'business_categories', timestamps: true },
})
export class BusinessCategory {
  @prop({ required: true, trim: true })
  name: string;

  @prop({ required: true, lowercase: true, trim: true })
  slug: string;

  @prop({ default: true })
  isActive: boolean;
}
