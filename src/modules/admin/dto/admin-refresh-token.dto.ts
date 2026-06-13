import { IsNotEmpty, IsString } from 'class-validator';

export class AdminRefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
