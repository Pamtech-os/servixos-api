import { index, modelOptions, prop, PropType } from '@typegoose/typegoose';
import { Types } from 'mongoose';

export enum StartingPoint {
  NO_IDEA = 'no_idea',
  HAS_IDEA = 'has_idea',
  EXISTING_BUSINESS = 'existing_business',
}

export enum ProfileSection {
  PERSON = 'person',
  EXISTING_BUSINESS = 'existingBusiness',
  OPPORTUNITIES = 'opportunities',
  CONCEPT = 'concept',
  BRAND = 'brand',
  SERVICES = 'services',
  WORKFLOWS = 'workflows',
  PLAN = 'plan',
}

export enum SectionStatus {
  DRAFT = 'draft',
  APPROVED = 'approved',
}

export enum SectionAuthor {
  AI = 'ai',
  USER = 'user',
}

export enum PriceUnit {
  FIXED = 'fixed',
  HOURLY = 'hourly',
  PER_VISIT = 'per_visit',
  MONTHLY = 'monthly',
}

export enum ChatRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

/** Review state shared by every profile section. */
export class SectionState {
  @prop({ enum: SectionStatus, default: SectionStatus.DRAFT })
  status: SectionStatus;

  @prop({ enum: SectionAuthor, required: true })
  updatedBy: SectionAuthor;

  @prop({ required: true })
  updatedAt: Date;
}

export class PersonProfile extends SectionState {
  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  interests: string[];

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  skills: string[];

  @prop({ trim: true })
  experience?: string;

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  goals: string[];

  @prop()
  weeklyHours?: number;

  @prop()
  budgetAmount?: number;

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  preferredIndustries: string[];

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  preferredBusinessModels: string[];

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  concerns: string[];
}

export class ExistingBusinessProfile extends SectionState {
  @prop({ required: true, trim: true })
  description: string;

  @prop({ trim: true })
  customers?: string;

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  currentServices: string[];

  @prop({ trim: true })
  currentPricing?: string;

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  challenges: string[];

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  growthGoals: string[];
}

export class Opportunity {
  @prop({ required: true, trim: true })
  title: string;

  @prop({ required: true, trim: true })
  summary: string;

  @prop({ required: true, trim: true })
  whyItFits: string;

  @prop({ required: true, trim: true })
  estimatedStartupCost: string;

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  risks: string[];

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  tradeOffs: string[];
}

export class OpportunitiesSection extends SectionState {
  @prop({ type: () => Opportunity, _id: false, default: [] }, PropType.ARRAY)
  items: Opportunity[];

  /** Index into `items` of the opportunity the user chose to pursue. */
  @prop()
  selectedIndex?: number;
}

export class ConceptSection extends SectionState {
  @prop({ required: true, trim: true })
  summary: string;

  @prop({ required: true, trim: true })
  valueProposition: string;

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  targetCustomers: string[];

  @prop({ trim: true })
  industry?: string;
}

export class BrandSection extends SectionState {
  @prop({ required: true, trim: true })
  name: string;

  @prop({ trim: true })
  tagline?: string;

  @prop({ trim: true })
  primaryColor?: string;

  @prop({ trim: true })
  secondaryColor?: string;

  @prop({ trim: true })
  font?: string;

  @prop({ trim: true })
  tone?: string;
}

export class ServiceOffering {
  @prop({ required: true, trim: true })
  name: string;

  @prop({ required: true, trim: true })
  description: string;

  /** Proposed price in major units of the section currency; a suggestion, never a guarantee. */
  @prop()
  price?: number;

  @prop({ enum: PriceUnit })
  priceUnit?: PriceUnit;
}

export class ServicesSection extends SectionState {
  @prop({ required: true, uppercase: true, trim: true })
  currency: string;

  @prop(
    { type: () => ServiceOffering, _id: false, default: [] },
    PropType.ARRAY,
  )
  items: ServiceOffering[];
}

export class Workflow {
  @prop({ required: true, trim: true })
  name: string;

  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  steps: string[];
}

export class WorkflowsSection extends SectionState {
  @prop({ type: () => Workflow, _id: false, default: [] }, PropType.ARRAY)
  items: Workflow[];
}

export class ActionItem {
  @prop({ required: true, trim: true })
  title: string;

  @prop({ required: true, trim: true })
  why: string;

  @prop({ trim: true })
  timeframe?: string;
}

export class PlanSection extends SectionState {
  @prop({ type: () => String, default: [] }, PropType.ARRAY)
  goals: string[];

  @prop({ type: () => ActionItem, _id: false, default: [] }, PropType.ARRAY)
  actions: ActionItem[];
}

export class BusinessProfile {
  @prop({ type: () => PersonProfile, _id: false })
  person?: PersonProfile;

  @prop({ type: () => ExistingBusinessProfile, _id: false })
  existingBusiness?: ExistingBusinessProfile;

  @prop({ type: () => OpportunitiesSection, _id: false })
  opportunities?: OpportunitiesSection;

  @prop({ type: () => ConceptSection, _id: false })
  concept?: ConceptSection;

  @prop({ type: () => BrandSection, _id: false })
  brand?: BrandSection;

  @prop({ type: () => ServicesSection, _id: false })
  services?: ServicesSection;

  @prop({ type: () => WorkflowsSection, _id: false })
  workflows?: WorkflowsSection;

  @prop({ type: () => PlanSection, _id: false })
  plan?: PlanSection;
}

export class ChatTurn {
  @prop({ enum: ChatRole, required: true })
  role: ChatRole;

  @prop({ required: true })
  content: string;

  @prop({ required: true })
  createdAt: Date;
}

@index({ userId: 1 }, { unique: true })
@modelOptions({
  schemaOptions: { collection: 'onboarding_sessions', timestamps: true },
})
export class OnboardingSession {
  _id: Types.ObjectId;

  @prop({ ref: 'User', type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @prop({ enum: StartingPoint })
  startingPoint?: StartingPoint;

  @prop({ type: () => ChatTurn, _id: false, default: [] }, PropType.ARRAY)
  messages: ChatTurn[];

  @prop({ type: () => BusinessProfile, _id: false, default: () => ({}) })
  profile: BusinessProfile;

  /** Set when the user approves the whole setup and the business is created (Stage 3). */
  @prop()
  approvedAt?: Date;
}
