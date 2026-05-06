import { IsMongoId, IsString } from 'class-validator';

export class MarkReadDto {
  @IsMongoId()
  clientId: string;

  @IsString()
  @IsMongoId()
  upToMessageId: string;
}
