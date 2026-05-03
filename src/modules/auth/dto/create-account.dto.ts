import {
  IsEmail,
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Match } from 'src/common/validators/match.validator';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';

export class CreateAccountDto {
  @IsString({ message: AUTH_MESSAGES.VALIDATION.FIRST_NAME_INVALID })
  @IsNotEmpty({ message: AUTH_MESSAGES.VALIDATION.FIRST_NAME_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  firstName: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.LAST_NAME_INVALID })
  @IsNotEmpty({ message: AUTH_MESSAGES.VALIDATION.LAST_NAME_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  lastName: string;

  @IsEmail({}, { message: AUTH_MESSAGES.VALIDATION.EMAIL_INVALID })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsPhoneNumber(undefined, { message: AUTH_MESSAGES.VALIDATION.PHONE_INVALID })
  phone: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.PASSWORD_INVALID })
  @MinLength(8, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_MIN_LENGTH })
  @Matches(/[A-Z]/, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_UPPERCASE })
  @Matches(/[0-9]/, { message: AUTH_MESSAGES.VALIDATION.PASSWORD_NUMBER })
  password: string;

  @IsString({ message: AUTH_MESSAGES.VALIDATION.CONFIRM_PASSWORD_INVALID })
  @Match('password', { message: AUTH_MESSAGES.VALIDATION.PASSWORDS_MISMATCH })
  confirmPassword: string;
}
