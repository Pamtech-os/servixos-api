import { IsString, MaxLength } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(5000)
  description: string;
}
