import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CLIENTS_MESSAGES } from 'src/common/constants/messages/clients.messages';

export class CreateClientDto {
  @IsString({ message: CLIENTS_MESSAGES.VALIDATION.NAME_INVALID })
  @IsNotEmpty({ message: CLIENTS_MESSAGES.VALIDATION.NAME_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  name: string;

  @IsNotEmpty({ message: CLIENTS_MESSAGES.VALIDATION.EMAIL_REQUIRED })
  @IsEmail({}, { message: CLIENTS_MESSAGES.VALIDATION.EMAIL_INVALID })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsOptional()
  @IsString({ message: CLIENTS_MESSAGES.VALIDATION.PHONE_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  phone?: string;
}
