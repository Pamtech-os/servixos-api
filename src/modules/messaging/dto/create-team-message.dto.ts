import { IsString, MaxLength } from 'class-validator';

export class CreateTeamMessageDto {
  @IsString()
  @MaxLength(5000)
  content: string;
}
