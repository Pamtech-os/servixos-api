import { IsOptional, IsString } from 'class-validator';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';

export class RefreshTokenDto {
  /** Required when calling from mobile (cookie not available). Web clients send via httpOnly cookie. */
  @IsOptional()
  @IsString({ message: AUTH_MESSAGES.VALIDATION.REFRESH_TOKEN_INVALID })
  refreshToken?: string;
}
