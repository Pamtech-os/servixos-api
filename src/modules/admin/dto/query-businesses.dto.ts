import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/common/dto/pagination.dto';

export enum AdminBusinessStatus {
  ALL = 'all',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

export class QueryAdminBusinessesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(AdminBusinessStatus)
  status?: AdminBusinessStatus = AdminBusinessStatus.ALL;
}
