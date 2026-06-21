import { IsOptional, IsString } from 'class-validator';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';

export class AdminRefreshTokenDto {
  /** Required when calling from mobile (cookie not available). Web clients send via httpOnly cookie. */
  @IsOptional()
  @IsString({ message: ADMIN_MESSAGES.VALIDATION.REFRESH_TOKEN_INVALID })
  refreshToken?: string;
}
