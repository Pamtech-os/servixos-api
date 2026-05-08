import { IsNotEmpty, IsString } from 'class-validator';
import { CLIENT_AUTH_MESSAGES } from 'src/common/constants/messages/client-auth.messages';

export class ClientRefreshTokenDto {
  @IsString({
    message: CLIENT_AUTH_MESSAGES.VALIDATION.REFRESH_TOKEN_INVALID,
  })
  @IsNotEmpty({
    message: CLIENT_AUTH_MESSAGES.VALIDATION.REFRESH_TOKEN_REQUIRED,
  })
  refreshToken: string;
}
