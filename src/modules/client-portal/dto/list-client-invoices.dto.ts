import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ClientPaginationDto } from './client-pagination.dto';

export enum ClientInvoiceStatus {
  PAID = 'paid',
  PARTIAL = 'partial',
  UNPAID = 'unpaid',
}

export enum ClientInvoiceSortBy {
  DUE_DATE = 'dueDate',
  AMOUNT = 'amount',
  ISSUED_DATE = 'issuedDate',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ListClientInvoicesDto extends ClientPaginationDto {
  @IsOptional()
  @IsEnum(ClientInvoiceStatus)
  status?: ClientInvoiceStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(ClientInvoiceSortBy)
  sort?: ClientInvoiceSortBy = ClientInvoiceSortBy.DUE_DATE;

  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder = SortOrder.DESC;
}
