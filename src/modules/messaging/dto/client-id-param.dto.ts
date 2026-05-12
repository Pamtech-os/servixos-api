import { IsMongoId } from 'class-validator';

export class ClientIdParamDto {
  @IsMongoId()
  clientId: string;
}
