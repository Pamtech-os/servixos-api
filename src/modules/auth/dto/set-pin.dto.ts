import { IsEmail, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { Match } from 'src/common/validators/match.validator';

export class SetPinDto {
  @IsEmail()
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 digits' })
  pin: string;

  @IsString()
  @Match('pin', { message: 'PINs do not match' })
  confirmPin: string;
}
