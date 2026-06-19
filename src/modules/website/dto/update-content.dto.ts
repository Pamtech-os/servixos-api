import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class HeroDto {
  @IsOptional()
  @IsString({ message: 'Hero headline must be a string' })
  @IsNotEmpty({ message: 'Hero headline must not be empty' })
  headline?: string;

  @IsOptional()
  @IsString({ message: 'Hero subheadline must be a string' })
  subheadline?: string;

  @IsOptional()
  @IsString({ message: 'Hero CTA text must be a string' })
  ctaText?: string;
}

export class AboutDto {
  @IsOptional()
  @IsString({ message: 'About title must be a string' })
  title?: string;

  @IsOptional()
  @IsString({ message: 'About body must be a string' })
  body?: string;
}

export class ServiceItemDto {
  @IsString({ message: 'Service name must be a string' })
  @IsNotEmpty({ message: 'Service name must not be empty' })
  name: string;

  @IsOptional()
  @IsString({ message: 'Service description must be a string' })
  description?: string;
}

export class TestimonialPlaceholderDto {
  @IsOptional()
  @IsString({ message: 'Testimonial quote must be a string' })
  quote?: string;

  @IsOptional()
  @IsString({ message: 'Testimonial author must be a string' })
  author?: string;
}

export class ContactDto {
  @IsOptional()
  @IsString({ message: 'Contact call-to-action must be a string' })
  callToAction?: string;
}

export class UpdateContentDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => HeroDto)
  hero?: HeroDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AboutDto)
  about?: AboutDto;

  @IsOptional()
  @IsArray({ message: 'Services must be an array' })
  @ValidateNested({ each: true })
  @Type(() => ServiceItemDto)
  services?: ServiceItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TestimonialPlaceholderDto)
  testimonialPlaceholder?: TestimonialPlaceholderDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContactDto)
  contact?: ContactDto;
}
