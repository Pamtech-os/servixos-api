import { prop, index, modelOptions } from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum WaitlistPersona {
  ASPIRING_FOUNDER = 'aspiring_founder',
  HAS_IDEA = 'has_idea',
  BUSINESS_OWNER = 'business_owner',
  EXPLORING = 'exploring',
}

export const WAITLIST_PERSONA_LABELS: Record<WaitlistPersona, string> = {
  [WaitlistPersona.ASPIRING_FOUNDER]:
    "I want to start a business but don't know what to start.",
  [WaitlistPersona.HAS_IDEA]: 'I have a business idea and want to get started.',
  [WaitlistPersona.BUSINESS_OWNER]: 'I already run a business.',
  [WaitlistPersona.EXPLORING]: "I'm interested in exploring Servix OS.",
};

@index({ email: 1 }, { unique: true })
@index({ createdAt: -1 })
@index({ persona: 1, createdAt: -1 })
@modelOptions({
  schemaOptions: { collection: 'waitlist_entries', timestamps: true },
})
export class WaitlistEntry {
  _id: Types.ObjectId;

  @prop({ required: true, trim: true, maxlength: 50 })
  firstName: string;

  @prop({ required: true, trim: true, lowercase: true, maxlength: 254 })
  email: string;

  @prop({ enum: WaitlistPersona, required: true })
  persona: WaitlistPersona;

  createdAt: Date;
  updatedAt: Date;
}
