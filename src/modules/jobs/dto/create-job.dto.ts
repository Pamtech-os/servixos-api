import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { JOBS_MESSAGES } from 'src/common/constants/messages/jobs.messages';

export class CreateJobDto {
  @IsNotEmpty({ message: JOBS_MESSAGES.VALIDATION.CLIENT_ID_REQUIRED })
  @IsMongoId({ message: JOBS_MESSAGES.VALIDATION.CLIENT_ID_INVALID })
  clientId: string;

  @IsString({ message: JOBS_MESSAGES.VALIDATION.TITLE_INVALID })
  @IsNotEmpty({ message: JOBS_MESSAGES.VALIDATION.TITLE_REQUIRED })
  @Transform(({ value }: { value: string }) => value?.trim())
  title: string;

  @IsOptional()
  @IsString({ message: JOBS_MESSAGES.VALIDATION.DESCRIPTION_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  description?: string;

  @IsNotEmpty({ message: JOBS_MESSAGES.VALIDATION.SCHEDULED_DATE_REQUIRED })
  @IsDateString(
    {},
    { message: JOBS_MESSAGES.VALIDATION.SCHEDULED_DATE_INVALID },
  )
  scheduledDate: string;

  @IsOptional()
  @IsString({ message: JOBS_MESSAGES.VALIDATION.LOCATION_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  location?: string;

  @IsOptional()
  @IsNumber({}, { message: JOBS_MESSAGES.VALIDATION.PRICE_INVALID })
  @Min(0, { message: JOBS_MESSAGES.VALIDATION.PRICE_MIN })
  price?: number;

  @IsOptional()
  @IsString({ message: JOBS_MESSAGES.VALIDATION.NOTES_INVALID })
  @Transform(({ value }: { value: string }) => value?.trim())
  notes?: string;
}
