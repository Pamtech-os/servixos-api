import { IsNotEmpty } from 'class-validator';

export class EncryptDto {
  @IsNotEmpty()
  data: unknown;
}
