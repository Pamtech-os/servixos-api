import { IsNotEmpty, IsString } from 'class-validator';
import { AUTH_MESSAGES } from 'src/common/constants/messages/auth.messages';

export class RefreshTokenDto {
  @IsString({ message: AUTH_MESSAGES.VALIDATION.REFRESH_TOKEN_INVALID })
  @IsNotEmpty({ message: AUTH_MESSAGES.VALIDATION.REFRESH_TOKEN_REQUIRED })
  refreshToken: string;
}
