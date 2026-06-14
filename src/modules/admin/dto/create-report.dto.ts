import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ReportFormat, ReportType } from '../schemas/admin-report.schema';
import { ScheduleFrequency } from '../schemas/admin-report-schedule.schema';

export enum ReportFrequency {
  ONE_TIME = 'one_time',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export class CreateReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsEnum(ReportType)
  type: ReportType;

  @IsDateString()
  dateFrom: string;

  @IsDateString()
  dateTo: string;

  @IsEnum(ReportFormat)
  format: ReportFormat;

  @IsOptional()
  @IsEnum(ReportFrequency)
  frequency?: ReportFrequency = ReportFrequency.ONE_TIME;
}

/** Map ReportFrequency to ScheduleFrequency for recurring reports. */
export const FREQUENCY_TO_SCHEDULE: Partial<
  Record<ReportFrequency, ScheduleFrequency>
> = {
  [ReportFrequency.DAILY]: ScheduleFrequency.DAILY,
  [ReportFrequency.WEEKLY]: ScheduleFrequency.WEEKLY,
  [ReportFrequency.MONTHLY]: ScheduleFrequency.MONTHLY,
};
