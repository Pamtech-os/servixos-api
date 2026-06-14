import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { ReportType } from '../schemas/admin-report.schema';

export class QueryReportsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType;
}
