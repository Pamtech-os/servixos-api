import { IsEnum, IsOptional } from 'class-validator';
import type { DashboardPeriod } from '../types/admin.types';

export class DashboardFilterDto {
  @IsOptional()
  @IsEnum(['today', 'last7days', 'last30days'])
  period?: DashboardPeriod;
}
