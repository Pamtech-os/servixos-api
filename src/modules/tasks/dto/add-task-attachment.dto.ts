import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';
import { TASKS_MESSAGES } from 'src/common/constants/messages/tasks.messages';

export class AddTaskAttachmentDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsNotEmpty()
  publicId: string;

  @IsString()
  @IsNotEmpty()
  filename: string;

  @IsString({ message: TASKS_MESSAGES.VALIDATION.MIME_TYPE_INVALID })
  @IsNotEmpty()
  mimeType: string;

  @IsNumber()
  @IsPositive()
  filesizeBytes: number;
}
