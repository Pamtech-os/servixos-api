import { prop, index, modelOptions } from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum PlanChangeType {
  CONVERSION = 'conversion', // trial → any paid plan
  UPGRADE = 'upgrade', // paid plan → higher paid plan
  DOWNGRADE = 'downgrade', // paid plan → lower paid plan
  CHURN = 'churn', // any plan → canceled
}

@index({ businessId: 1, createdAt: -1 })
@index({ createdAt: -1 })
@modelOptions({
  schemaOptions: { collection: 'plan_changes', timestamps: true },
})
export class PlanChange {
  _id: Types.ObjectId;

  @prop({ ref: 'Business', type: Types.ObjectId, required: true })
  businessId: Types.ObjectId;

  @prop({ required: true, trim: true })
  businessName: string;

  @prop({ required: true })
  fromPlan: string;

  @prop({ required: true })
  toPlan: string;

  @prop({ enum: PlanChangeType, required: true })
  type: PlanChangeType;

  createdAt: Date;
}
