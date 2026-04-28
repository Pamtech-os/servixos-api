import { IsEmail, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { Match } from 'src/common/validators/match.validator';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';

export class SetPinDto {
  @IsEmail({}, { message: AUTH_MESSAGES.VALIDATION.EMAIL_INVALID })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @Matches(/^\d{4}$/, { message: AUTH_MESSAGES.VALIDATION.PIN_FORMAT })
  pin: string;

  @IsString()
  @Match('pin', { message: AUTH_MESSAGES.VALIDATION.PINS_MISMATCH })
  confirmPin: string;
}
