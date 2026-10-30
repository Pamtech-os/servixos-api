import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ONBOARDING_MESSAGES } from 'src/common/constants/messages/onboarding.messages';

export const MAX_CHAT_MESSAGE_LENGTH = 2000;

export class ChatMessageDto {
  @IsString({ message: ONBOARDING_MESSAGES.VALIDATION.MESSAGE_REQUIRED })
  @IsNotEmpty({ message: ONBOARDING_MESSAGES.VALIDATION.MESSAGE_REQUIRED })
  @MaxLength(MAX_CHAT_MESSAGE_LENGTH, {
    message: ONBOARDING_MESSAGES.VALIDATION.MESSAGE_TOO_LONG,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  message: string;
}
