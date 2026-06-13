import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ADMIN_MESSAGES } from 'src/common/constants/messages/admin.messages';

export class SendEmailToUserDto {
  @IsString({ message: ADMIN_MESSAGES.VALIDATION.SUBJECT_REQUIRED })
  @IsNotEmpty({ message: ADMIN_MESSAGES.VALIDATION.SUBJECT_REQUIRED })
  subject: string;

  @IsString({ message: ADMIN_MESSAGES.VALIDATION.MESSAGE_REQUIRED })
  @IsNotEmpty({ message: ADMIN_MESSAGES.VALIDATION.MESSAGE_REQUIRED })
  message: string;
}

export class BulkSendEmailDto extends SendEmailToUserDto {
  @IsArray()
  @ArrayMinSize(1, { message: ADMIN_MESSAGES.VALIDATION.USER_IDS_REQUIRED })
  @IsMongoId({ each: true })
  userIds: string[];
}

export class BulkToggleSuspendDto {
  @IsArray()
  @ArrayMinSize(1, { message: ADMIN_MESSAGES.VALIDATION.USER_IDS_REQUIRED })
  @IsMongoId({ each: true })
  userIds: string[];

  @IsOptional()
  suspend?: boolean;
}

export class BulkBusinessIdsDto {
  @IsArray()
  @ArrayMinSize(1, { message: ADMIN_MESSAGES.VALIDATION.USER_IDS_REQUIRED })
  @IsMongoId({ each: true })
  businessIds: string[];
}

export class BulkBusinessSendEmailDto extends SendEmailToUserDto {
  @IsArray()
  @ArrayMinSize(1, { message: ADMIN_MESSAGES.VALIDATION.USER_IDS_REQUIRED })
  @IsMongoId({ each: true })
  businessIds: string[];
}
