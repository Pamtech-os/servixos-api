import { IsEnum, IsOptional } from 'class-validator';
import { ClientPaginationDto } from './client-pagination.dto';

export enum ClientActivityType {
  INVOICE = 'invoice',
  PAYMENT = 'payment',
  CONTRACT = 'contract',
  FILE = 'file',
  MESSAGE = 'message',
}

export class ListClientActivitiesDto extends ClientPaginationDto {
  @IsOptional()
  @IsEnum(ClientActivityType)
  type?: ClientActivityType;
}
