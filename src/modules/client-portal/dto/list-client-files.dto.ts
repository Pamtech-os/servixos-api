import { IsEnum, IsOptional } from 'class-validator';
import { ClientPaginationDto } from './client-pagination.dto';
import { SortOrder } from './list-client-invoices.dto';

export enum ClientFileFormat {
  PDF = 'pdf',
  DOC = 'doc',
  DOCX = 'docx',
  XLSX = 'xlsx',
  PNG = 'png',
  JPG = 'jpg',
}

export enum ClientFileSortBy {
  GENERATED_DATE = 'generatedDate',
  FILENAME = 'filename',
  FILESIZE_BYTES = 'filesizeBytes',
  CREATED_AT = 'createdAt',
}

export class ListClientFilesDto extends ClientPaginationDto {
  @IsOptional()
  @IsEnum(ClientFileFormat)
  format?: ClientFileFormat;

  @IsOptional()
  @IsEnum(ClientFileSortBy)
  sort?: ClientFileSortBy = ClientFileSortBy.CREATED_AT;

  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder = SortOrder.DESC;
}
