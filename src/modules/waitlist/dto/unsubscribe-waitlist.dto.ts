import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { WAITLIST_MESSAGES } from 'src/common/constants/messages/waitlist.messages';

export class UnsubscribeWaitlistDto {
  @IsString({
    message: WAITLIST_MESSAGES.VALIDATION.UNSUBSCRIBE_TOKEN_REQUIRED,
  })
  @IsNotEmpty({
    message: WAITLIST_MESSAGES.VALIDATION.UNSUBSCRIBE_TOKEN_REQUIRED,
  })
  @MaxLength(128, {
    message: WAITLIST_MESSAGES.ERROR.INVALID_UNSUBSCRIBE_TOKEN,
  })
  token: string;
}
