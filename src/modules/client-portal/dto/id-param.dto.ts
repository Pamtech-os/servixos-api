import { IsMongoId } from 'class-validator';

export class IdParamDto {
  @IsMongoId({ message: 'ID must be a valid Mongo ID' })
  id: string;
}
