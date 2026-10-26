import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { WAITLIST_MESSAGES } from 'src/common/constants/messages/waitlist.messages';
import { WaitlistPersona } from '../schemas/waitlist-entry.schema';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class JoinWaitlistDto {
  @Transform(trim)
  @IsString({ message: WAITLIST_MESSAGES.VALIDATION.FIRST_NAME_INVALID })
  @IsNotEmpty({ message: WAITLIST_MESSAGES.VALIDATION.FIRST_NAME_REQUIRED })
  @MaxLength(50, {
    message: WAITLIST_MESSAGES.VALIDATION.FIRST_NAME_MAX_LENGTH,
  })
  firstName: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsNotEmpty({ message: WAITLIST_MESSAGES.VALIDATION.EMAIL_REQUIRED })
  @IsEmail({}, { message: WAITLIST_MESSAGES.VALIDATION.EMAIL_INVALID })
  @MaxLength(254, { message: WAITLIST_MESSAGES.VALIDATION.EMAIL_MAX_LENGTH })
  email: string;

  @IsNotEmpty({ message: WAITLIST_MESSAGES.VALIDATION.PERSONA_REQUIRED })
  @IsEnum(WaitlistPersona, {
    message: WAITLIST_MESSAGES.VALIDATION.PERSONA_INVALID,
  })
  persona: WaitlistPersona;
}
