import { IsEnum, IsOptional } from 'class-validator';
import { ClientPaginationDto } from './client-pagination.dto';
import { SortOrder } from './list-client-invoices.dto';

export enum ClientContractStatus {
  AWAITING_SIGNATURE = 'awaiting_signature',
  SIGNED = 'signed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum ClientContractSortBy {
  DATE_SENT = 'dateSent',
  AMOUNT = 'amount',
}

export class ListClientContractsDto extends ClientPaginationDto {
  @IsOptional()
  @IsEnum(ClientContractStatus)
  status?: ClientContractStatus;

  @IsOptional()
  @IsEnum(ClientContractSortBy)
  sort?: ClientContractSortBy = ClientContractSortBy.DATE_SENT;

  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder = SortOrder.DESC;
}
