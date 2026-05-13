import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';
import { FILES_MESSAGES } from 'src/common/constants/messages/files.messages';

export class AttachFileDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsNotEmpty()
  publicId: string;

  @IsString()
  @IsNotEmpty()
  filename: string;

  @IsString({ message: FILES_MESSAGES.VALIDATION.MIME_TYPE_INVALID })
  @IsNotEmpty()
  mimeType: string;

  @IsNumber()
  @IsPositive()
  filesizeBytes: number;
}
