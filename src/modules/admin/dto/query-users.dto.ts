import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/common/dto/pagination.dto';

export enum AdminUserStatus {
  ALL = 'all',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

export enum AdminUserRole {
  ALL = 'all',
  OWNER = 'owner',
  EMPLOYEE = 'employee',
  STAFF = 'staff',
  CLIENT = 'client',
}

export class QueryAdminUsersDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(AdminUserStatus)
  status?: AdminUserStatus = AdminUserStatus.ALL;

  @IsOptional()
  @IsEnum(AdminUserRole)
  role?: AdminUserRole = AdminUserRole.ALL;
}
