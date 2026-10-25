import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { CLIENTS_MESSAGES } from 'src/common/constants/messages/clients.messages';

export class UpdateClientDto {
  @IsOptional()
  @IsString({ message: CLIENTS_MESSAGES.VALIDATION.NAME_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: CLIENTS_MESSAGES.VALIDATION.EMAIL_INVALID })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email?: string;

  @IsOptional()
  @IsString({ message: CLIENTS_MESSAGES.VALIDATION.PHONE_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  phone?: string;
}
