import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsHexColor,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ONBOARDING_MESSAGES } from 'src/common/constants/messages/onboarding.messages';
import { PriceUnit } from '../schemas/onboarding-session.schema';

const SHORT_TEXT = 200;
const LONG_TEXT = 2000;
const MAX_LIST = 20;
const V = ONBOARDING_MESSAGES.VALIDATION;

const LIST_ITEM = { each: true, message: V.LIST_ITEM_INVALID };

export class PersonProfileInput {
  @IsOptional()
  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(MAX_LIST, { message: V.LIST_TOO_LONG })
  @IsString(LIST_ITEM)
  @MaxLength(SHORT_TEXT, LIST_ITEM)
  interests?: string[];

  @IsOptional()
  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(MAX_LIST, { message: V.LIST_TOO_LONG })
  @IsString(LIST_ITEM)
  @MaxLength(SHORT_TEXT, LIST_ITEM)
  skills?: string[];

  @IsOptional()
  @IsString({ message: V.TEXT_INVALID })
  @MaxLength(LONG_TEXT, { message: V.TEXT_TOO_LONG })
  experience?: string;

  @IsOptional()
  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(MAX_LIST, { message: V.LIST_TOO_LONG })
  @IsString(LIST_ITEM)
  @MaxLength(SHORT_TEXT, LIST_ITEM)
  goals?: string[];

  @IsOptional()
  @IsInt({ message: V.NUMBER_INVALID })
  @Min(0, { message: V.NUMBER_INVALID })
  @Max(168, { message: V.NUMBER_INVALID })
  weeklyHours?: number;

  @IsOptional()
  @IsNumber({}, { message: V.NUMBER_INVALID })
  @Min(0, { message: V.NUMBER_INVALID })
  budgetAmount?: number;

  @IsOptional()
  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(MAX_LIST, { message: V.LIST_TOO_LONG })
  @IsString(LIST_ITEM)
  @MaxLength(SHORT_TEXT, LIST_ITEM)
  preferredIndustries?: string[];

  @IsOptional()
  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(MAX_LIST, { message: V.LIST_TOO_LONG })
  @IsString(LIST_ITEM)
  @MaxLength(SHORT_TEXT, LIST_ITEM)
  preferredBusinessModels?: string[];

  @IsOptional()
  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(MAX_LIST, { message: V.LIST_TOO_LONG })
  @IsString(LIST_ITEM)
  @MaxLength(SHORT_TEXT, LIST_ITEM)
  concerns?: string[];
}

export class ExistingBusinessInput {
  @IsString({ message: V.TEXT_INVALID })
  @IsNotEmpty({ message: V.TEXT_INVALID })
  @MaxLength(LONG_TEXT, { message: V.TEXT_TOO_LONG })
  description: string;

  @IsOptional()
  @IsString({ message: V.TEXT_INVALID })
  @MaxLength(LONG_TEXT, { message: V.TEXT_TOO_LONG })
  customers?: string;

  @IsOptional()
  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(MAX_LIST, { message: V.LIST_TOO_LONG })
  @IsString(LIST_ITEM)
  @MaxLength(SHORT_TEXT, LIST_ITEM)
  currentServices?: string[];

  @IsOptional()
  @IsString({ message: V.TEXT_INVALID })
  @MaxLength(LONG_TEXT, { message: V.TEXT_TOO_LONG })
  currentPricing?: string;

  @IsOptional()
  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(MAX_LIST, { message: V.LIST_TOO_LONG })
  @IsString(LIST_ITEM)
  @MaxLength(SHORT_TEXT, LIST_ITEM)
  challenges?: string[];

  @IsOptional()
  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(MAX_LIST, { message: V.LIST_TOO_LONG })
  @IsString(LIST_ITEM)
  @MaxLength(SHORT_TEXT, LIST_ITEM)
  growthGoals?: string[];
}

export class OpportunityInput {
  @IsString({ message: V.TEXT_INVALID })
  @Length(1, SHORT_TEXT, { message: V.TEXT_TOO_LONG })
  title: string;

  @IsString({ message: V.TEXT_INVALID })
  @Length(1, LONG_TEXT, { message: V.TEXT_TOO_LONG })
  summary: string;

  @IsString({ message: V.TEXT_INVALID })
  @Length(1, LONG_TEXT, { message: V.TEXT_TOO_LONG })
  whyItFits: string;

  @IsString({ message: V.TEXT_INVALID })
  @Length(1, SHORT_TEXT, { message: V.TEXT_TOO_LONG })
  estimatedStartupCost: string;

  @IsOptional()
  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(MAX_LIST, { message: V.LIST_TOO_LONG })
  @IsString(LIST_ITEM)
  @MaxLength(SHORT_TEXT, LIST_ITEM)
  risks?: string[];

  @IsOptional()
  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(MAX_LIST, { message: V.LIST_TOO_LONG })
  @IsString(LIST_ITEM)
  @MaxLength(SHORT_TEXT, LIST_ITEM)
  tradeOffs?: string[];
}

export class OpportunitiesInput {
  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(5, { message: V.LIST_TOO_LONG })
  @ValidateNested({ each: true })
  @Type(() => OpportunityInput)
  items: OpportunityInput[];

  @IsOptional()
  @IsInt({ message: V.NUMBER_INVALID })
  @Min(0, { message: V.NUMBER_INVALID })
  @Max(4, { message: V.NUMBER_INVALID })
  selectedIndex?: number;
}

export class ConceptInput {
  @IsString({ message: V.TEXT_INVALID })
  @Length(1, LONG_TEXT, { message: V.TEXT_TOO_LONG })
  summary: string;

  @IsString({ message: V.TEXT_INVALID })
  @Length(1, LONG_TEXT, { message: V.TEXT_TOO_LONG })
  valueProposition: string;

  @IsOptional()
  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(MAX_LIST, { message: V.LIST_TOO_LONG })
  @IsString(LIST_ITEM)
  @MaxLength(SHORT_TEXT, LIST_ITEM)
  targetCustomers?: string[];

  @IsOptional()
  @IsString({ message: V.TEXT_INVALID })
  @MaxLength(SHORT_TEXT, { message: V.TEXT_TOO_LONG })
  industry?: string;
}

export class BrandInput {
  @IsString({ message: V.TEXT_INVALID })
  @Length(1, 80, { message: V.TEXT_TOO_LONG })
  name: string;

  @IsOptional()
  @IsString({ message: V.TEXT_INVALID })
  @MaxLength(SHORT_TEXT, { message: V.TEXT_TOO_LONG })
  tagline?: string;

  @IsOptional()
  @IsHexColor({ message: V.COLOR_INVALID })
  primaryColor?: string;

  @IsOptional()
  @IsHexColor({ message: V.COLOR_INVALID })
  secondaryColor?: string;

  @IsOptional()
  @IsString({ message: V.TEXT_INVALID })
  @MaxLength(60, { message: V.TEXT_TOO_LONG })
  font?: string;

  @IsOptional()
  @IsString({ message: V.TEXT_INVALID })
  @MaxLength(SHORT_TEXT, { message: V.TEXT_TOO_LONG })
  tone?: string;
}

export class ServiceOfferingInput {
  @IsString({ message: V.TEXT_INVALID })
  @Length(1, SHORT_TEXT, { message: V.TEXT_TOO_LONG })
  name: string;

  @IsString({ message: V.TEXT_INVALID })
  @Length(1, LONG_TEXT, { message: V.TEXT_TOO_LONG })
  description: string;

  @IsOptional()
  @IsNumber({}, { message: V.NUMBER_INVALID })
  @Min(0, { message: V.NUMBER_INVALID })
  price?: number;

  @IsOptional()
  @IsEnum(PriceUnit, { message: V.PRICE_UNIT_INVALID })
  priceUnit?: PriceUnit;
}

export class ServicesInput {
  @IsString({ message: V.CURRENCY_INVALID })
  @Length(3, 3, { message: V.CURRENCY_INVALID })
  currency: string;

  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(MAX_LIST, { message: V.LIST_TOO_LONG })
  @ValidateNested({ each: true })
  @Type(() => ServiceOfferingInput)
  items: ServiceOfferingInput[];
}

export class WorkflowInput {
  @IsString({ message: V.TEXT_INVALID })
  @Length(1, SHORT_TEXT, { message: V.TEXT_TOO_LONG })
  name: string;

  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(MAX_LIST, { message: V.LIST_TOO_LONG })
  @IsString(LIST_ITEM)
  @MaxLength(SHORT_TEXT, LIST_ITEM)
  steps: string[];
}

export class WorkflowsInput {
  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(10, { message: V.LIST_TOO_LONG })
  @ValidateNested({ each: true })
  @Type(() => WorkflowInput)
  items: WorkflowInput[];
}

export class ActionItemInput {
  @IsString({ message: V.TEXT_INVALID })
  @Length(1, SHORT_TEXT, { message: V.TEXT_TOO_LONG })
  title: string;

  @IsString({ message: V.TEXT_INVALID })
  @Length(1, LONG_TEXT, { message: V.TEXT_TOO_LONG })
  why: string;

  @IsOptional()
  @IsString({ message: V.TEXT_INVALID })
  @MaxLength(SHORT_TEXT, { message: V.TEXT_TOO_LONG })
  timeframe?: string;
}

export class PlanInput {
  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(10, { message: V.LIST_TOO_LONG })
  @IsString(LIST_ITEM)
  @MaxLength(SHORT_TEXT, LIST_ITEM)
  goals: string[];

  @IsArray({ message: V.LIST_INVALID })
  @ArrayMaxSize(MAX_LIST, { message: V.LIST_TOO_LONG })
  @ValidateNested({ each: true })
  @Type(() => ActionItemInput)
  actions: ActionItemInput[];
}
