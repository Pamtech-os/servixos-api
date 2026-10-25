import { IsOptional, IsString } from 'class-validator';
import { CLIENT_AUTH_MESSAGES } from 'src/common/constants/messages/client-auth.messages';

export class ClientRefreshTokenDto {
  /** Required when calling from mobile (cookie not available). Web clients send via httpOnly cookie. */
  @IsOptional()
  @IsString({
    message: CLIENT_AUTH_MESSAGES.VALIDATION.REFRESH_TOKEN_INVALID,
  })
  refreshToken?: string;
}
