import { IsString, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  otpToken: string;

  @IsString()
  @MinLength(6)
  otp: string;
}
