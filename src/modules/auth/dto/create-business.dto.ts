import {
  IsArray,
  IsEmail,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateBusinessDto {
  @IsEmail()
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  businessName: string;

  @IsMongoId({ message: 'businessCategory must be a valid category ID' })
  businessCategory: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }: { value: string }) => value?.trim())
  businessDescription?: string;

  @IsString()
  @IsOptional()
  colorPrimary?: string;

  @IsString()
  @IsOptional()
  colorSecondary?: string;

  @IsString()
  @IsOptional()
  font?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  services?: string[];

  @IsString()
  @IsOptional()
  timezone?: string;
}
