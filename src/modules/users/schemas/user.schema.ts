import { prop, index, modelOptions } from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { SupportedCountry } from 'src/common/constants/countries.constants';

export enum UserRole {
  OWNER = 'owner',
  EMPLOYEE = 'employee',
  STAFF = 'staff',
  CLIENT = 'client',
}

/** Ordered checkpoints of the owner onboarding journey; used to resume where the user left off. */
export enum OnboardingStage {
  REGISTERED = 'registered',
  EMAIL_VERIFIED = 'email_verified',
  PIN_SET = 'pin_set',
  BUSINESS_CREATED = 'business_created',
  PAYMENT_METHOD_ADDED = 'payment_method_added',
  COMPLETE = 'complete',
}

export enum RegistrationVerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  NOT_FOUND = 'not_found',
  UNAVAILABLE = 'unavailable',
}

export class BusinessRegistration {
  @prop({ required: true, trim: true, uppercase: true })
  number: string;

  @prop({ enum: SupportedCountry, required: true })
  country: SupportedCountry;

  @prop({
    enum: RegistrationVerificationStatus,
    default: RegistrationVerificationStatus.PENDING,
  })
  status: RegistrationVerificationStatus;

  /** Company name as returned by the registry, when found. */
  @prop({ trim: true })
  registeredName?: string;

  @prop()
  checkedAt?: Date;
}

@index({ email: 1 }, { unique: true })
@modelOptions({ schemaOptions: { collection: 'users', timestamps: true } })
export class User {
  _id: Types.ObjectId;

  @prop({ required: true, trim: true })
  firstName: string;

  @prop({ required: true, trim: true })
  lastName: string;

  @prop({ required: true, lowercase: true, trim: true })
  email: string;

  @prop({ required: true })
  passwordHash: string;

  @prop()
  pinHash?: string;

  @prop({ trim: true })
  phone?: string;

  @prop({ enum: SupportedCountry })
  country?: SupportedCountry;

  @prop({ enum: OnboardingStage })
  onboardingStage?: OnboardingStage;

  /** Optional registry number supplied at signup; verified asynchronously via Prembly. */
  @prop({ type: () => BusinessRegistration, _id: false })
  businessRegistration?: BusinessRegistration;

  @prop({ enum: UserRole, default: UserRole.OWNER })
  userRole: UserRole;

  /** Reference to the Business this user owns or belongs to */
  @prop({ ref: 'Business', type: Types.ObjectId })
  businessId?: Types.ObjectId;

  /** For employee-type users, their associated Employee document */
  @prop({ ref: 'Employee', type: Types.ObjectId })
  employeeId?: Types.ObjectId;

  /** Role (permission set) assigned to this user */
  @prop({ ref: 'Role', type: Types.ObjectId })
  roleId?: Types.ObjectId;

  @prop({ default: false })
  isActive: boolean;

  @prop({ default: false })
  isEmailVerified: boolean;

  @prop({ default: false })
  mustChangePassword: boolean;

  @prop()
  lastLoginAt?: Date;

  @prop()
  emailVerificationOtp?: string;

  @prop()
  emailVerificationOtpExpiry?: Date;

  @prop()
  passwordResetToken?: string;

  @prop()
  passwordResetTokenExpiry?: Date;

  @prop()
  deletedAt?: Date;
}
