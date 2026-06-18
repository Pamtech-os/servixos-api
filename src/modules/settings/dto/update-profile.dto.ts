import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsPhoneNumber, IsString } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString({ message: 'Business name must be a valid string' })
  @Transform(({ value }: { value: string }) => value?.trim())
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email?: string;

  @IsOptional()
  @IsPhoneNumber(undefined, {
    message: 'Phone must be a valid international phone number',
  })
  phone?: string;

  @IsOptional()
  @IsString({ message: 'Address must be a valid string' })
  @Transform(({ value }: { value: string }) => value?.trim())
  address?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a valid string' })
  @Transform(({ value }: { value: string }) => value?.trim())
  description?: string;
}
